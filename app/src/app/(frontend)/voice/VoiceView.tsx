'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Send } from 'lucide-react'
import { api } from '@/components/wardni/client'
import { RoomFormModal } from '@/components/wardni/RoomFormModal'
import { RoomTabs, useActiveRoom } from '@/components/wardni/RoomTabs'
import { useNow, useWard } from '@/components/wardni/WardProvider'
import { Button, Empty, EngineTag, ErrorText, inputCls, LevelBadge, Panel, cx, timeAgo } from '@/components/wardni/ui'
import type { WardEventDTO } from '@/lib/wardni/types'
import { voiceRules } from '@/lib/wardni/rules'
import { ASR_SAMPLE_RATE, encodeWav16, resampleTo, SpeechSegmenter, type Segment } from '@/lib/wardni/wav'

/* eslint-disable @typescript-eslint/no-explicit-any */
type SR = any

const LANGS = [
  { v: 'en-US', l: 'English' },
  { v: 'fr-FR', l: 'Français' },
  { v: 'ar-DZ', l: 'العربية (DZ)' },
]
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture'])
const LANG_SHORT: Record<string, string> = { 'en-US': 'en', 'fr-FR': 'fr', 'ar-DZ': 'ar' }
// Minimal AudioWorklet that forwards raw mono mic frames to the page (loaded from a Blob URL, no extra file needed).
const WORKLET_SRC = `class C extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor('wardni-cap',C)`
type Asr = 'muse' | 'browser'

export function VoiceView() {
  const { snap, refresh } = useWard()
  const { room, select } = useActiveRoom(snap?.rooms, 'wardni_voice_room')
  const [addOpen, setAddOpen] = useState(false)
  const [lang, setLang] = useState('en-US')
  const [listening, setListening] = useState(false)
  const [pending, setPending] = useState('')
  const [interim, setInterim] = useState('')
  const [autoSend, setAutoSend] = useState(true)
  const [asr, setAsr] = useState<Asr>('muse')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [verdict, setVerdict] = useState<(WardEventDTO & { note?: string }) | null>(null)
  const now = useNow(5000)
  const [fileBusy, setFileBusy] = useState(false)
  const [fileStatus, setFileStatus] = useState('')

  const handleExtractFileAudio = async (file: File) => {
    const rm = roomRef.current
    if (!rm) return
    setFileBusy(true)
    setErr('')
    setFileStatus(`Decoding audio track from "${file.name}"…`)
    try {
      const arrayBuf = await file.arrayBuffer()
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const decodeCtx = new AudioCtx()
      let audioBuf: AudioBuffer
      try {
        audioBuf = await decodeCtx.decodeAudioData(arrayBuf.slice(0))
      } catch {
        void decodeCtx.close().catch(() => undefined)
        setFileStatus('')
        setErr(`"${file.name}" contains no decodable audio track (video-only or unsupported container). Nothing was sent to Muse Voice Transcribe 1.0.`)
        return
      }
      void decodeCtx.close().catch(() => undefined)

      if (audioBuf.numberOfChannels === 0 || audioBuf.length === 0) {
        setFileStatus('')
        setErr(`"${file.name}" has 0 audio channels. Nothing was sent to Muse Voice Transcribe 1.0.`)
        return
      }

      const rawSamples = audioBuf.getChannelData(0)
      let sumSq = 0
      let peak = 0
      for (let i = 0; i < rawSamples.length; i++) {
        const s = Math.abs(rawSamples[i])
        sumSq += s * s
        if (s > peak) peak = s
      }
      const rms = Math.sqrt(sumSq / Math.max(1, rawSamples.length))
      const dbFs = rms > 0 ? Math.round(20 * Math.log10(rms)) : -100

      if (rms < 0.0025 || peak < 0.015) {
        setFileStatus('')
        setErr(`"${file.name}" has a silent audio track (${dbFs} dBFS, peak ${(peak * 100).toFixed(1)}%). No speech exists in this file — nothing sent to Muse Voice Transcribe 1.0.`)
        return
      }

      if (!voiceReady) {
        setFileStatus('')
        setErr(`Decoded ${audioBuf.duration.toFixed(1)}s of real audio (${dbFs} dBFS) from "${file.name}", but Muse Voice Transcribe 1.0 is not LIVE. Configure a valid MODEL_API_KEY in Meta API Keys first.`)
        return
      }

      const resampled = resampleTo(rawSamples, audioBuf.sampleRate, ASR_SAMPLE_RATE)
      const maxSamples = ASR_SAMPLE_RATE * 55
      const clipped = resampled.length > maxSamples ? resampled.subarray(0, maxSamples) : resampled
      const wav = encodeWav16(clipped, ASR_SAMPLE_RATE)
      const order = [LANG_SHORT[langRef.current] || 'en', 'en', 'fr', 'ar'].filter((l, i, a) => a.indexOf(l) === i).join(',')

      setFileStatus(`Step 1/2: Sending ${Math.round(wav.byteLength / 1024)} KB 16kHz PCM WAV (${dbFs} dBFS) to muse-voice-transcribe-1.0…`)
      const tr = await api<{ transcript: string }>(`/ward-api/voice/transcribe?lang=${order}&room=${encodeURIComponent(String(rm.id))}`, {
        method: 'POST',
        raw: wav as unknown as BodyInit,
        headers: { 'Content-Type': 'application/octet-stream' },
      })
      const text = (tr.transcript || '').trim()
      if (text.length < 2) {
        setFileStatus('')
        setErr(`Muse Voice Transcribe 1.0 processed "${file.name}" (${dbFs} dBFS) and returned an empty transcript (no recognizable speech).`)
        return
      }
      pendingRef.current = text
      setPending(text)
      setFileStatus(`Step 2/2: Piping transcript ("${text.slice(0, 80)}") into muse-spark-1.3…`)
      await submit(text)
      setFileStatus(`Completed pipeline: muse-voice-transcribe-1.0 → muse-spark-1.3 for "${file.name}".`)
    } catch (e) {
      setFileStatus('')
      setErr((e as Error).message)
    } finally {
      setFileBusy(false)
    }
  }

  const recRef = useRef<SR>(null)
  const listeningRef = useRef(false)
  const fatalRef = useRef(false)
  const langRef = useRef(lang)
  const pendingRef = useRef('')
  const autoRef = useRef(autoSend)
  const roomRef = useRef(room)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioRef = useRef<{ ctx: AudioContext; stream: MediaStream; raf: number; node?: AudioWorkletNode; seg?: SpeechSegmenter } | null>(null)
  const asrRef = useRef<Asr>('muse')
  const asrTouched = useRef(false)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const museFails = useRef(0)
  const lastUntranscribed = useRef(0)
  const discardRef = useRef(false)
  const transcribeRef = useRef<(s: Segment, sampleRate: number) => void>(() => undefined)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])
  useEffect(() => {
    autoRef.current = autoSend
  }, [autoSend])
  useEffect(() => {
    roomRef.current = room
  }, [room])
  useEffect(() => {
    asrRef.current = asr
  }, [asr])
  // Default to Muse Voice Transcribe as soon as the server reports it is configured (until the user picks one).
  const voiceReady = Boolean(snap?.api?.voiceReady)
  useEffect(() => {
    if (!asrTouched.current && voiceReady) setAsr('muse')
  }, [voiceReady])

  const submit = useCallback(
    async (text?: string) => {
      const transcript = (text ?? pendingRef.current).trim()
      const rm = roomRef.current
      if (!rm || transcript.length < 2) return
      // Clear only what we send, so speech that arrives during the request is kept for the next submit.
      pendingRef.current = pendingRef.current.startsWith(transcript) ? pendingRef.current.slice(transcript.length).trimStart() : ''
      setPending(pendingRef.current)
      setBusy(true)
      setErr('')
      try {
        const r = await api<{ event: WardEventDTO; note?: string }>('/ward-api/triage', { body: { source: 'VOICE', roomId: rm.id, transcript } })
        setVerdict({ ...r.event, note: r.note })
        await refresh()
      } catch (e) {
        setErr((e as Error).message)
        pendingRef.current = `${transcript} ${pendingRef.current}`.trim()
        setPending(pendingRef.current)
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  /** Speech was heard but could not be transcribed: never stored as an event (v6 rule).
   *  The nurse is told here to check the patient in person instead. */
  const submitUntranscribed = useCallback(
    async (_cause: string) => {
      if (Date.now() - lastUntranscribed.current < 60_000) return
      lastUntranscribed.current = Date.now()
      setErr('Speech heard but not transcribed — nothing stored. Check the patient in person.')
    },
    [],
  )

  /** Muse Voice Transcribe: one VAD-segmented utterance → server → text → the same submit() path as typed text. */
  const transcribeSegment = useCallback(
    (seg: Segment, sampleRate: number) => {
      const rm = roomRef.current // captured now: speech is never attributed to a room selected later
      chainRef.current = chainRef.current.then(async () => {
        if (!rm) return
        const wav = encodeWav16(resampleTo(seg.samples, sampleRate, ASR_SAMPLE_RATE), ASR_SAMPLE_RATE)
        const order = [LANG_SHORT[langRef.current] || 'en', 'en', 'fr', 'ar'].filter((l, i, a) => a.indexOf(l) === i).join(',')
        setInterim('transcribing…')
        try {
          const r = await api<{ transcript: string }>(`/ward-api/voice/transcribe?lang=${order}&room=${encodeURIComponent(String(rm.id))}`, {
            method: 'POST',
            raw: wav as unknown as BodyInit,
            headers: { 'Content-Type': 'application/octet-stream' },
          })
          museFails.current = 0
          setInterim('')
          const text = (r.transcript || '').trim()
          if (text.length < 2 || roomRef.current?.id !== rm.id) return
          pendingRef.current = `${pendingRef.current} ${text}`.trim()
          setPending(pendingRef.current)
          // The recognizer already ended the utterance on silence, so there is no extra pause to wait for.
          if (autoRef.current) void submit()
        } catch (e) {
          setInterim('')
          museFails.current += 1
          setErr(`Muse Voice Transcribe failed (${(e as Error).message}).`)
          if (autoRef.current && roomRef.current?.id === rm.id) void submitUntranscribed((e as Error).message.slice(0, 100))
        }
      })
    },
    [submit, submitUntranscribed],
  )
  useEffect(() => {
    transcribeRef.current = transcribeSegment
  }, [transcribeSegment])

  const stopAudio = () => {
    const a = audioRef.current
    if (!a) return
    if (a.seg && a.node) {
      try {
        a.node.port.onmessage = null
        a.node.disconnect()
        // Pressing Stop mid-sentence still transcribes what was said; switching rooms discards it.
        if (!discardRef.current) for (const s of a.seg.flush()) transcribeRef.current(s, a.ctx.sampleRate)
      } catch {
        /* node already gone */
      }
    }
    cancelAnimationFrame(a.raf)
    a.stream.getTracks().forEach((t) => t.stop())
    void a.ctx.close().catch(() => undefined)
    audioRef.current = null
    const cv = canvasRef.current
    cv?.getContext('2d')?.clearRect(0, 0, cv.width, cv.height)
  }

  const stop = useCallback(() => {
    listeningRef.current = false
    setListening(false)
    setInterim('')
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      recRef.current?.stop()
    } catch {
      /* already stopped */
    }
    recRef.current = null
    stopAudio()
  }, [])

  useEffect(() => stop, [stop])
  useEffect(() => {
    // Switching rooms ends the session so speech is never attributed to the wrong patient.
    discardRef.current = true
    stop()
    discardRef.current = false
    setPending('')
    setVerdict(null)
    setErr('')
  }, [room?.id, stop])

  const start = async () => {
    const useMuse = asrRef.current === 'muse'
    if (!useMuse) {
      // Browser speech was removed: only Muse Voice Transcribe counts as a model input.
      setErr('Browser speech is removed in this build — use Muse Voice Transcribe only.')
      return
    }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setErr('')
    fatalRef.current = false
    museFails.current = 0
    let stream: MediaStream | undefined
    let ctx: AudioContext | undefined
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: true } })
      const audioCtx = new AudioContext()
      ctx = audioCtx
      const an = audioCtx.createAnalyser()
      an.fftSize = 128
      const src = audioCtx.createMediaStreamSource(stream)
      src.connect(an)
      let node: AudioWorkletNode | undefined
      let seg: SpeechSegmenter | undefined
      if (useMuse) {
        const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'text/javascript' }))
        try {
          await audioCtx.audioWorklet.addModule(url)
        } finally {
          URL.revokeObjectURL(url)
        }
        node = new AudioWorkletNode(audioCtx, 'wardni-cap')
        seg = new SpeechSegmenter({ sampleRate: audioCtx.sampleRate })
        const segmenter = seg
        node.port.onmessage = (e: MessageEvent<Float32Array>) => {
          for (const s of segmenter.push(e.data)) transcribeRef.current(s, audioCtx.sampleRate)
        }
        const mute = audioCtx.createGain() // some browsers only pull worklets that reach the destination
        mute.gain.value = 0
        src.connect(node)
        node.connect(mute)
        mute.connect(audioCtx.destination)
      }
      const data = new Uint8Array(an.frequencyBinCount)
      const draw = () => {
        const cv = canvasRef.current
        if (cv) {
          const dpr = window.devicePixelRatio || 1
          const w = Math.round(cv.clientWidth * dpr)
          const h = Math.round(cv.clientHeight * dpr)
          if (cv.width !== w || cv.height !== h) {
            cv.width = w
            cv.height = h
          }
          const c = cv.getContext('2d')!
          an.getByteFrequencyData(data)
          c.clearRect(0, 0, w, h)
          const bars = 48
          const bw = w / bars
          for (let i = 0; i < bars; i++) {
            const v = data[Math.floor((i / bars) * data.length)] / 255
            const bh = Math.max(2 * dpr, v * h)
            c.fillStyle = `rgba(45,212,191,${0.35 + v * 0.65})`
            c.fillRect(i * bw + bw * 0.2, (h - bh) / 2, bw * 0.6, bh)
          }
        }
        if (audioRef.current) audioRef.current.raf = requestAnimationFrame(draw)
      }
      audioRef.current = { ctx: audioCtx, stream, raf: requestAnimationFrame(draw), node, seg }
    } catch (e) {
      setErr(`Microphone or audio setup failed (${(e as Error).message || 'permission denied'}). Allow mic access to listen at the bedside.`)
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close().catch(() => undefined)
      stopAudio()
      return
    }
    if (useMuse) {
      // Muse Voice Transcribe is server-side; no browser recognizer to start.
      listeningRef.current = true
      setListening(true)
      return
    }

    const rec: SR = new Ctor()
    rec.lang = langRef.current
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (ev: any) => {
      let inter = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) {
          pendingRef.current = `${pendingRef.current} ${r[0].transcript}`.trim()
          setPending(pendingRef.current)
        } else inter += r[0].transcript
      }
      setInterim(inter)
      if (autoRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current)
        // Distress words go out at once; everything else waits for a 2.2 s pause. (The old `length > 4` guard
        // silently swallowed one-word cries such as "Help", "Aide", "SOS" and "طحت".)
        const text = pendingRef.current.trim()
        const urgent = text.length >= 2 && voiceRules(text, '', '').floor === 'RED'
        timerRef.current = setTimeout(() => {
          if (pendingRef.current.trim().length >= 2) void submit()
        }, urgent ? 0 : 2200)
      }
    }
    rec.onerror = (e: any) => {
      if (FATAL.has(e.error)) {
        fatalRef.current = true
        setErr(`Speech recognition stopped: ${e.error}.`)
        stop()
      }
    }
    rec.onend = () => {
      if (!listeningRef.current || fatalRef.current) return
      setTimeout(() => {
        if (!listeningRef.current || recRef.current !== rec) return
        rec.lang = langRef.current
        try {
          rec.start()
        } catch {
          /* already started */
        }
      }, 250)
    }
    recRef.current = rec
    listeningRef.current = true
    setListening(true)
    rec.start()
  }

  const changeLang = (v: string) => {
    setLang(v)
    langRef.current = v
    // Restart so the new language applies immediately (onend re-starts with langRef).
    if (listeningRef.current) {
      try {
        recRef.current?.stop()
      } catch {
        /* noop */
      }
    }
  }

  if (!snap) return <div className="h-96 animate-pulse rounded-2xl border border-line bg-panel" />
  const history = snap.events.filter((e) => e.source === 'VOICE' && e.room === room?.id).slice(0, 8)
  const shown = verdict && verdict.room === room?.id ? verdict : history[0] || null

  return (
    <div className="space-y-4">
      <RoomTabs rooms={snap.rooms} activeId={room?.id} onSelect={select} onAdd={() => setAddOpen(true)} source="VOICE" />
      {!room ? (
        <Empty title="Bedside voice workstation" action={<Button variant="primary" onClick={() => setAddOpen(true)}>Add a room</Button>}>
          Listen at the bedside in English, French or Algerian Arabic. Muse Voice Transcribe turns speech into text, then Muse Spark ranks its urgency — RED for cries for help, falls or breathing distress. Distress words are escalated by rules first, without waiting for the AI.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
          <div className="space-y-5 xl:col-span-7">
            <Panel
              eyebrow="Section 2 · Bedside microphone"
              title={room.name}
              actions={
                <>
                  <select
                    aria-label="Transcription engine"
                    className="rounded-lg border border-line-strong bg-well px-2 py-1.5 text-xs text-slate-200"
                    value={asr}
                    disabled={listening}
                    onChange={(e) => {
                      asrTouched.current = true
                      setAsr(e.target.value as Asr)
                    }}
                  >
                    <option value="muse" disabled={!voiceReady}>
                      Muse Voice Transcribe{voiceReady ? '' : ' (not configured)'}
                    </option>
                  </select>
                  <select aria-label="Recognition language" className="rounded-lg border border-line-strong bg-well px-2 py-1.5 text-xs text-slate-200" value={lang} onChange={(e) => changeLang(e.target.value)}>
                    {LANGS.map((l) => (
                      <option key={l.v} value={l.v}>
                        {l.l}
                      </option>
                    ))}
                  </select>
                  <Button variant={listening ? 'danger' : 'primary'} onClick={listening ? stop : start}>
                    {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />} {listening ? 'Stop listening' : 'Start bedside mic'}
                  </Button>
                </>
              }
              bodyClassName="space-y-4"
            >
              <p className="text-xs text-slate-400">Patient note: {room.clinicalContext || '—'}</p>
              <div className="flex items-center gap-3 rounded-xl border border-line bg-well px-4 py-3">
                <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', listening ? 'animate-alarm bg-emerald-400' : 'bg-slate-600')} />
                <span className="w-28 shrink-0 font-mono text-[11px] text-slate-300">{listening ? 'Listening live' : 'Mic standby'}</span>
                <canvas ref={canvasRef} className="h-9 flex-1" />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Unsent transcript</span>
                  <label className="flex items-center gap-2 text-[11px] text-slate-400">
                    <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} className="accent-teal-400" /> Auto-send after a 2 s pause
                  </label>
                </div>
                <textarea
                  className={cx(inputCls, 'min-h-[120px] text-base leading-relaxed')}
                  placeholder="Live speech from bedside mic or extracted audio appears here (read-only — typed lines are never sent)."
                  value={pending}
                  readOnly
                />
                {interim && <p className="mt-1.5 font-mono text-[11px] text-slate-500">hearing: {interim}</p>}
              </div>
              <div className="rounded-xl border border-line bg-well p-3.5 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">Extract Audio from Camera / Video File → Muse Voice Transcribe 1.0 → Muse Spark 1.3</div>
                    <div className="text-[11px] text-slate-400">Decodes real PCM audio from .mp4 / .mov / .wav files, verifies non-silent dBFS energy, transcribes via muse-voice-transcribe-1.0, and pipes output into muse-spark-1.3.</div>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:opacity-90">
                    <span>{fileBusy ? 'Processing Audio…' : 'Select Video / Audio File'}</span>
                    <input
                      type="file"
                      accept="video/*,audio/*,.mp4,.mov,.wav,.mp3,.m4a"
                      className="hidden"
                      disabled={fileBusy}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) void handleExtractFileAudio(f)
                      }}
                    />
                  </label>
                </div>
                {fileStatus && <div className="rounded border border-line bg-panel px-2.5 py-1.5 font-mono text-[11px] text-slate-200">{fileStatus}</div>}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-slate-400">Pipeline: Muse Voice Transcribe 1.0 (ASR) → Muse Spark 1.3 (Clinical Triage)</span>
                <Button variant="primary" onClick={() => submit()} disabled={busy || pending.trim().length < 2}>
                  <Send className="h-3.5 w-3.5" /> {busy ? 'Ranking with Spark 1.3…' : 'Send Transcript to Spark 1.3'}
                </Button>
              </div>
              <ErrorText>{err}</ErrorText>
            </Panel>
          </div>
          <div className="space-y-5 xl:col-span-5">
            <Panel eyebrow="Voice-only verdict" title="Muse Spark ranking" actions={shown ? <LevelBadge level={shown.level} /> : <LevelBadge level="STANDBY" />}>
              {shown ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-base font-bold text-white">{shown.headline}</h3>
                    <EngineTag engine={shown.engine} failSafe={shown.failSafe} />
                  </div>
                  <p className="text-sm leading-relaxed text-slate-300">{shown.reason}</p>
                  <div className="rounded-xl border border-accent/30 border-l-4 border-l-accent bg-well p-3">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-accent">Nurse action</div>
                    <p className="mt-0.5 text-sm font-semibold text-white">{shown.nurseAction}</p>
                  </div>
                  {shown.detail && <p className="font-mono text-[11px] text-slate-500">&ldquo;{shown.detail}&rdquo;</p>}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No transcript ranked for this room yet.</p>
              )}
            </Panel>
            <Panel eyebrow="This room" title="Voice history" bodyClassName="space-y-2">
              {history.length === 0 && <div className="font-mono text-[11px] text-slate-500">Nothing yet.</div>}
              {history.map((e) => (
                <div key={e.id} className="rounded-lg border border-line bg-well px-3 py-2">
                  <div className="flex items-center justify-between">
                    <LevelBadge level={e.level} size="sm" />
                    <span className="font-mono text-[10px] text-slate-500">{timeAgo(e.createdAt, now)}</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-white">{e.headline}</div>
                  <div className="truncate font-mono text-[11px] text-slate-500">&ldquo;{e.detail}&rdquo;</div>
                </div>
              ))}
            </Panel>
          </div>
        </div>
      )}
      <RoomFormModal open={addOpen} onClose={() => setAddOpen(false)} withCamera={false} onSaved={(r) => select(r.id)} />
    </div>
  )
}
