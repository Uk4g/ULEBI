'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Camera, Crosshair, Eye, EyeOff, FlaskConical, MousePointerClick, Pause, Play, Plus, Route, ScanFace, Settings2, Square, Trash2, Upload, X } from 'lucide-react'
import { api } from '@/components/wardni/client'
import { RoomFormModal } from '@/components/wardni/RoomFormModal'
import { RoomTabs, useActiveRoom } from '@/components/wardni/RoomTabs'
import { useWard } from '@/components/wardni/WardProvider'
import { Button, Empty, EngineTag, ErrorText, inputCls, LevelBadge, Panel, cx } from '@/components/wardni/ui'
import type { BedZone, VisionClass, WardEventDTO } from '@/lib/wardni/types'
import { buildClassPrompt, computeFacts, DEFAULT_CLASSES, overlapPct, parseSamWire, type ParsedSam, type PatientLock, type TrackPoint } from '@/lib/wardni/vision'

type Media = { kind: 'file'; file: File; url: string } | { kind: 'webcam'; stream: MediaStream }
type Draft = { classes: VisionClass[]; bedZone: BedZone; negativeExclusions: string }
type Overlay = { frames: ParsedSam['frames']; tracks: Record<string, TrackPoint[]>; sliceStart: number | null; sliceDur: number; at: number }
type Facts = ReturnType<typeof computeFacts>['facts']
type Mode = 'text' | 'spatial' | 'exemplar'

const DEFAULT_BED: BedZone = { xMin: 0.18, yMin: 0.18, xMax: 0.82, yMax: 0.86 }
const COLORS = ['#2DD4BF', '#38BDF8', '#F59E0B', '#A78BFA', '#F472B6', '#34D399']
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function VisionView() {
  const { snap, refresh } = useWard()
  const { room, select } = useActiveRoom(snap?.rooms, 'wardni_vision_room')
  const [roomModal, setRoomModal] = useState<'add' | 'edit' | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [sel, setSel] = useState(0)
  const [mode, setMode] = useState<Mode>('text')
  const [tool, setTool] = useState<'pos' | 'neg' | 'box'>('pos')
  const [drawingEx, setDrawingEx] = useState(false)
  const [editBed, setEditBed] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [traces, setTraces] = useState(true)
  const [capture, setCapture] = useState<'clip' | 'frame'>('clip')
  const [maskEnc, setMaskEnc] = useState('one_bit')
  const [effort, setEffort] = useState('low')
  const [mediaKind, setMediaKind] = useState<'none' | 'video' | 'image'>('none')
  const [mediaLabel, setMediaLabel] = useState('')
  const [imgSrc, setImgSrc] = useState('')
  const [mediaVer, setMediaVer] = useState(0)
  const [stage, setStage] = useState('READY')
  const [running, setRunning] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [err, setErr] = useState('')
  const [lat, setLat] = useState({ upload: '—', sam: '—', spark: '—' })
  const [facts, setFacts] = useState<Facts | null>(null)
  const [verdict, setVerdict] = useState<WardEventDTO | null>(null)
  const [, setTick] = useState(0)
  const rerender = () => setTick((t) => t + 1)

  const videoRef = useRef<HTMLVideoElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const hlsRef = useRef<{ destroy: () => void } | null>(null)
  const mediaMap = useRef(new Map<string, Media>())
  const exemplars = useRef(new Map<string, string>())
  const refPhotos = useRef(new Map<string, string>())
  const overlays = useRef(new Map<string, Overlay>())
  const locks = useRef(new Map<string, PatientLock>())
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pendingSaves = useRef(new Map<string, Draft>())
  const draftRef = useRef<Draft | null>(null)
  const roomRef = useRef(room)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const tempRef = useRef<BedZone | null>(null)
  const runningRef = useRef(false)
  const rollingRef = useRef(false)
  const cfg = useRef({ mode, capture, maskEnc, effort, mediaKind, sel, privacy, traces, editBed })
  const snapRef = useRef(snap)

  useEffect(() => {
    cfg.current = { mode, capture, maskEnc, effort, mediaKind, sel, privacy, traces, editBed }
    roomRef.current = room
    snapRef.current = snap
  })

  // ----- prompt drafts: local source of truth per room, persisted on every edit -----
  const saveNow = useCallback(async (roomId: string, d: Draft) => {
    pendingSaves.current.delete(roomId)
    try {
      await api(`/ward-api/rooms/${encodeURIComponent(roomId)}`, { method: 'PATCH', body: { visionClasses: d.classes, bedZone: d.bedZone, negativeExclusions: d.negativeExclusions } })
    } catch (e) {
      setErr(`Could not save prompts: ${(e as Error).message}`)
    }
  }, [])

  const flushSaves = useCallback(() => {
    for (const [id, t] of saveTimers.current) {
      clearTimeout(t)
      const d = pendingSaves.current.get(id)
      if (d) void saveNow(id, d)
    }
    saveTimers.current.clear()
  }, [saveNow])

  const update = (fn: (d: Draft) => Draft, delay = 500) => {
    const cur = draftRef.current
    const rm = roomRef.current
    if (!cur || !rm) return
    const next = fn(cur)
    draftRef.current = next
    setDraft(next)
    const id = rm.id
    pendingSaves.current.set(id, next)
    clearTimeout(saveTimers.current.get(id))
    saveTimers.current.set(
      id,
      setTimeout(() => {
        saveTimers.current.delete(id)
        void saveNow(id, next)
      }, delay),
    )
  }
  const updateClass = (idx: number, patch: Partial<VisionClass>, delay?: number) =>
    update((d) => ({ ...d, classes: d.classes.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }), delay)

  useEffect(() => {
    flushSaves()
    rollingRef.current = false
    setRolling(false)
    if (!room) {
      draftRef.current = null
      setDraft(null)
      return
    }
    const d: Draft = {
      classes: room.visionClasses?.length ? room.visionClasses : DEFAULT_CLASSES.map((c) => ({ ...c, spatialPoints: [] })),
      bedZone: room.bedZone || DEFAULT_BED,
      negativeExclusions: room.negativeExclusions || 'medical staff, nurse, doctor, visitor',
    }
    draftRef.current = d
    setDraft(d)
    setSel(0)
    setVerdict(null)
    setFacts(null)
    setErr('')
    setStage('READY')
  }, [room?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => flushSaves(), [flushSaves])

  // ----- media source wiring (webcam / local clip / relayed camera) -----
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let cancelled = false
    hlsRef.current?.destroy()
    hlsRef.current = null
    v.pause()
    v.srcObject = null
    v.removeAttribute('src')
    v.load()
    setImgSrc('')
    if (!room) {
      setMediaKind('none')
      return
    }
    const m = mediaMap.current.get(room.id)
    if (m?.kind === 'webcam') {
      v.srcObject = m.stream
      void v.play().catch(() => undefined)
      setMediaKind('video')
      setMediaLabel('Local webcam')
    } else if (m?.kind === 'file') {
      v.src = m.url
      setMediaKind('video')
      setMediaLabel(m.file.name)
    } else if (room.camUrl) {
      const url = `/ward-api/cam/${encodeURIComponent(room.id)}`
      const lower = room.camUrl.toLowerCase()
      setMediaLabel('Live camera · server relay')
      if (lower.includes('.m3u8')) {
        setMediaKind('video')
        if (v.canPlayType('application/vnd.apple.mpegurl')) {
          v.src = url
          void v.play().catch(() => undefined)
        } else {
          void import('hls.js').then(({ default: Hls }) => {
            if (cancelled) return
            if (!Hls.isSupported()) return setErr('HLS playback is not supported in this browser.')
            const h = new Hls()
            hlsRef.current = h
            h.loadSource(url)
            h.attachMedia(v)
            h.on(Hls.Events.MANIFEST_PARSED, () => void v.play().catch(() => undefined))
            h.on(Hls.Events.ERROR, (_e, data) => data.fatal && setErr(`Camera stream error: ${data.details}`))
          })
        }
      } else if (/mjpe?g|snapshot|\.jpe?g|\.cgi/.test(lower)) {
        setImgSrc(url)
        setMediaKind('image')
        setCapture('frame')
      } else {
        v.src = url
        setMediaKind('video')
        void v.play().catch(() => undefined)
      }
    } else {
      setMediaKind('none')
      setMediaLabel('')
    }
    return () => {
      cancelled = true
    }
  }, [room?.id, room?.camUrl, mediaVer]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      hlsRef.current?.destroy()
      for (const m of mediaMap.current.values()) {
        if (m.kind === 'webcam') m.stream.getTracks().forEach((t) => t.stop())
        else URL.revokeObjectURL(m.url)
      }
    },
    [],
  )

  const setMedia = (m: Media | null) => {
    const rm = roomRef.current
    if (!rm) return
    const old = mediaMap.current.get(rm.id)
    if (old?.kind === 'webcam') old.stream.getTracks().forEach((t) => t.stop())
    if (old?.kind === 'file') URL.revokeObjectURL(old.url)
    if (m) mediaMap.current.set(rm.id, m)
    else mediaMap.current.delete(rm.id)
    overlays.current.delete(rm.id)
    setMediaVer((x) => x + 1)
  }

  const dims = () => {
    const v = videoRef.current
    const img = imgRef.current
    if (cfg.current.mediaKind === 'video' && v?.videoWidth) return { w: v.videoWidth, h: v.videoHeight, el: v as CanvasImageSource }
    if (cfg.current.mediaKind === 'image' && img?.naturalWidth) return { w: img.naturalWidth, h: img.naturalHeight, el: img as CanvasImageSource }
    return null
  }

  const fitBox = (cw: number, ch: number) => {
    const d = dims()
    const vr = d ? d.w / d.h : 16 / 9
    if (vr > cw / ch) {
      const h = cw / vr
      return { x: 0, y: (ch - h) / 2, w: cw, h }
    }
    const w = ch * vr
    return { x: (cw - w) / 2, y: 0, w, h: ch }
  }

  const snapshot = (type: 'image/png' | 'image/jpeg', q?: number, crop?: BedZone) => {
    const d = dims()
    if (!d) throw new Error('Connect a camera stream, webcam or clip first.')
    const c = document.createElement('canvas')
    const sx = crop ? Math.round(crop.xMin * d.w) : 0
    const sy = crop ? Math.round(crop.yMin * d.h) : 0
    const sw = crop ? Math.max(16, Math.round((crop.xMax - crop.xMin) * d.w)) : d.w
    const sh = crop ? Math.max(16, Math.round((crop.yMax - crop.yMin) * d.h)) : d.h
    c.width = sw
    c.height = sh
    c.getContext('2d')!.drawImage(d.el, sx, sy, sw, sh, 0, 0, sw, sh)
    return c.toDataURL(type, q)
  }

  // ----- overlay rendering -----
  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const cv = canvasRef.current
      if (!cv) return
      const r = cv.getBoundingClientRect()
      if (!r.width || !r.height) return
      const dpr = window.devicePixelRatio || 1
      const cw = Math.round(r.width * dpr)
      const ch = Math.round(r.height * dpr)
      if (cv.width !== cw || cv.height !== ch) {
        cv.width = cw
        cv.height = ch
      }
      const ctx = cv.getContext('2d')!
      ctx.clearRect(0, 0, cw, ch)
      const c = cfg.current
      if (c.privacy) {
        ctx.fillStyle = '#05080F'
        ctx.fillRect(0, 0, cw, ch)
        ctx.strokeStyle = 'rgba(148,163,184,0.06)'
        ctx.lineWidth = 1
        for (let x = 0; x < cw; x += 24 * dpr) ctx.strokeRect(x, 0, 0.5, ch)
        for (let y = 0; y < ch; y += 24 * dpr) ctx.strokeRect(0, y, cw, 0.5)
      }
      const d = draftRef.current
      const rm = roomRef.current
      if (!d || !rm) return
      const vb = fitBox(cw, ch)
      const X = (n: number) => vb.x + n * vb.w
      const Y = (n: number) => vb.y + n * vb.h
      const font = `600 ${Math.round(10 * dpr)}px ui-monospace, monospace`

      const bz = c.editBed && tempRef.current ? tempRef.current : d.bedZone
      ctx.save()
      ctx.strokeStyle = 'rgba(45,212,191,0.8)'
      ctx.lineWidth = 1.8 * dpr
      ctx.setLineDash([6 * dpr, 4 * dpr])
      ctx.strokeRect(X(bz.xMin), Y(bz.yMin), (bz.xMax - bz.xMin) * vb.w, (bz.yMax - bz.yMin) * vb.h)
      ctx.restore()
      ctx.font = font
      ctx.fillStyle = '#2DD4BF'
      ctx.fillText('BED ZONE', X(bz.xMin) + 6 * dpr, Y(bz.yMin) + 14 * dpr)

      const cls = d.classes[c.sel]
      if (cls?.spatialBox) {
        ctx.strokeStyle = cls.color
        ctx.lineWidth = 2 * dpr
        ctx.strokeRect(X(cls.spatialBox.xMin), Y(cls.spatialBox.yMin), (cls.spatialBox.xMax - cls.spatialBox.xMin) * vb.w, (cls.spatialBox.yMax - cls.spatialBox.yMin) * vb.h)
      }
      for (const p of cls?.spatialPoints || []) {
        ctx.beginPath()
        ctx.arc(X(p.x), Y(p.y), 5 * dpr, 0, Math.PI * 2)
        ctx.fillStyle = p.label === 1 ? '#10B981' : '#EF4444'
        ctx.fill()
      }
      if (tempRef.current && !c.editBed) {
        const t = tempRef.current
        ctx.strokeStyle = '#F59E0B'
        ctx.lineWidth = 2 * dpr
        ctx.strokeRect(X(t.xMin), Y(t.yMin), (t.xMax - t.xMin) * vb.w, (t.yMax - t.yMin) * vb.h)
      }

      const ov = overlays.current.get(rm.id)
      if (ov?.frames.length) {
        let idx = ov.frames.length - 1
        const v = videoRef.current
        if (ov.sliceStart != null && v && ov.sliceDur > 0 && v.currentTime >= ov.sliceStart && v.currentTime <= ov.sliceStart + ov.sliceDur) {
          idx = Math.min(ov.frames.length - 1, Math.floor(((v.currentTime - ov.sliceStart) / ov.sliceDur) * ov.frames.length))
        }
        if (c.traces) {
          for (const pts of Object.values(ov.tracks)) {
            if (pts.length < 2) continue
            ctx.beginPath()
            ctx.strokeStyle = pts[0].color
            ctx.lineWidth = 2 * dpr
            pts.forEach((p, i) => (i ? ctx.lineTo(X(p.cx), Y(p.cy)) : ctx.moveTo(X(p.cx), Y(p.cy))))
            ctx.stroke()
          }
        }
        for (const o of ov.frames[idx]?.objects || []) {
          const ox = X(o.nx1)
          const oy = Y(o.ny1)
          const ow = (o.nx2 - o.nx1) * vb.w
          const oh = (o.ny2 - o.ny1) * vb.h
          ctx.fillStyle = `${o.color}26`
          ctx.fillRect(ox, oy, ow, oh)
          ctx.strokeStyle = o.color
          ctx.lineWidth = 2 * dpr
          ctx.strokeRect(ox, oy, ow, oh)
          const lbl = `${o.trackId} · bed ${overlapPct(o, d.bedZone)}%`
          ctx.font = font
          ctx.fillStyle = 'rgba(8,12,20,0.9)'
          ctx.fillRect(ox, Math.max(0, oy - 18 * dpr), ctx.measureText(lbl).width + 10 * dpr, 17 * dpr)
          ctx.fillStyle = o.color
          ctx.fillText(lbl, ox + 5 * dpr, Math.max(12 * dpr, oy - 5 * dpr))
        }
        const age = Math.round((Date.now() - ov.at) / 1000)
        if (age > 4) {
          ctx.font = font
          ctx.fillStyle = 'rgba(148,163,184,0.85)'
          ctx.fillText(`last analysis ${age}s ago`, vb.x + 8 * dpr, vb.y + vb.h - 8 * dpr)
        }
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ----- pointer interaction (mouse, pen, touch) -----
  const interactive = editBed || drawingEx || mode === 'spatial'
  const norm = (e: RPointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current!
    const r = cv.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const vb = fitBox(cv.width, cv.height)
    return {
      x: Math.max(0, Math.min(1, ((e.clientX - r.left) * dpr - vb.x) / Math.max(1, vb.w))),
      y: Math.max(0, Math.min(1, ((e.clientY - r.top) * dpr - vb.y) / Math.max(1, vb.h))),
    }
  }
  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!draftRef.current) return
    const p = norm(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (editBed || drawingEx || (mode === 'spatial' && tool === 'box')) {
      dragRef.current = p
      tempRef.current = { xMin: p.x, yMin: p.y, xMax: p.x, yMax: p.y }
      return
    }
    if (mode === 'spatial') {
      const cls = draftRef.current.classes[sel]
      const label: 0 | 1 = tool === 'pos' ? 1 : 0
      if (cls) updateClass(sel, { spatialPoints: [...cls.spatialPoints, { x: p.x, y: p.y, label }].slice(-20) })
    }
  }
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const s = dragRef.current
    if (!s) return
    const p = norm(e)
    tempRef.current = { xMin: Math.min(s.x, p.x), yMin: Math.min(s.y, p.y), xMax: Math.max(s.x, p.x), yMax: Math.max(s.y, p.y) }
  }
  const onUp = () => {
    const rect = tempRef.current
    dragRef.current = null
    tempRef.current = null
    if (!rect || rect.xMax - rect.xMin < 0.02 || rect.yMax - rect.yMin < 0.02) return
    const rm = roomRef.current
    if (editBed) {
      update((d) => ({ ...d, bedZone: rect }), 0)
      locks.current.delete(rm?.id || '')
    } else if (drawingEx) {
      setDrawingEx(false)
      try {
        exemplars.current.set(`${rm?.id}:${sel}`, snapshot('image/jpeg', 0.85, rect))
        rerender()
      } catch (er) {
        setErr((er as Error).message)
      }
    } else if (mode === 'spatial' && tool === 'box') {
      updateClass(sel, { spatialBox: rect })
    }
  }

  // ----- analysis pipeline -----
  const recordSlice = async (ms: number) => {
    const v = videoRef.current
    const rm = roomRef.current
    if (!v || !rm || typeof MediaRecorder === 'undefined') return null
    const mime = ['video/mp4;codecs=avc1', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m))
    if (!mime) return null
    const media = mediaMap.current.get(rm.id)
    const vv = v as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }
    const rawStream = media?.kind === 'webcam' ? media.stream : vv.captureStream?.() || vv.mozCaptureStream?.()
    if (!rawStream) return null
    // Strip audio tracks: Vision slices sent to SAM/Wonder must be video-only
    const videoTracks = rawStream.getVideoTracks()
    if (!videoTracks.length) return null
    const stream = new MediaStream(videoTracks)
    if (v.paused) await v.play().catch(() => undefined)
    const start = media?.kind === 'webcam' ? null : v.currentTime
    const blob = await new Promise<Blob>((resolve, reject) => {
      const chunks: Blob[] = []
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 900_000 })
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      rec.onerror = () => reject(new Error('Recording failed'))
      rec.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' }))
      rec.start()
      setTimeout(() => rec.state === 'recording' && rec.stop(), ms)
    })
    return { file: new File([blob], 'slice.mp4', { type: 'video/mp4' }), start, dur: ms / 1000 }
  }

  const runCycle = async (): Promise<boolean> => {
    const rm = roomRef.current
    const d = draftRef.current
    const c = cfg.current
    if (!rm || !d || runningRef.current) return false
    const apiSt = snapRef.current?.api
    if (!(apiSt?.state === 'LIVE' && apiSt.samVerified)) {
      setErr('SAM 3.1 is not LIVE, so camera analysis is paused. Configure MODEL_API_KEY in Meta API Keys and click Test Connection / Save & Verify Live.')
      return false
    }
    const active = d.classes.map((cls, idx) => ({ cls, idx })).filter(({ cls }) => cls.label.trim() || cls.spatialBox || cls.spatialPoints.length)
    if (!active.length) {
      setErr('Add at least one class in Step A.')
      return false
    }
    const dm = dims()
    if (!dm) {
      setErr('Connect a camera, webcam or .mp4/.mov clip first.')
      return false
    }
    runningRef.current = true
    setRunning(true)
    setErr('')
    try {
      let videoPart: unknown = null
      let imageDataUrl: string | null = null
      let sliceStart: number | null = null
      let sliceDur = 0
      if (c.capture === 'clip' && c.mediaKind === 'video') {
        setStage('1/3 RECORDING 3.5s')
        const slice = await recordSlice(3500)
        if (slice) {
          setStage('1/3 UPLOADING')
          try {
            const up = await api<{ videoPart: unknown; uploadMs: number }>('/ward-api/sam/upload', {
              method: 'POST',
              raw: slice.file,
              headers: { 'Content-Type': 'application/octet-stream', 'x-file-name': 'slice.mp4', 'x-file-type': 'video/mp4' },
            })
            videoPart = up.videoPart
            sliceStart = slice.start
            sliceDur = slice.dur
            setLat((l) => ({ ...l, upload: `${up.uploadMs}ms` }))
          } catch (e) {
            setErr(`Clip upload failed (${(e as Error).message}) — analysed a single frame instead.`)
          }
        }
      }
      if (!videoPart) {
        const t0 = performance.now()
        imageDataUrl = snapshot('image/png')
        setLat((l) => ({ ...l, upload: `frame ${Math.round(performance.now() - t0)}ms` }))
      }
      setStage(`2/3 SAM 3.1 · ${active.length} class${active.length > 1 ? 'es' : ''}`)
      const runs = await Promise.all(
        active.map(async ({ cls, idx }) => {
          const r = await api<{ wire: string; totalMs: number }>('/ward-api/sam/track', {
            body: {
              promptText: buildClassPrompt(cls, c.mode, dm.w, dm.h),
              maskEncoding: c.maskEnc,
              videoPart,
              imageDataUrl,
              exemplarCropDataUrl: c.mode === 'exemplar' ? exemplars.current.get(`${rm.id}:${idx}`) || null : null,
            },
          })
          return { ms: r.totalMs, parsed: parseSamWire(r.wire, cls, idx, dm.w, dm.h) }
        }),
      )
      setLat((l) => ({ ...l, sam: `${Math.max(...runs.map((r) => r.ms || 0))}ms` }))
      const frameMap = new Map<number, TrackPoint[]>()
      const tracks: Record<string, TrackPoint[]> = {}
      for (const { parsed } of runs) {
        Object.assign(tracks, parsed.tracks)
        for (const f of parsed.frames) frameMap.set(f.frameIndex, [...(frameMap.get(f.frameIndex) || []), ...f.objects])
      }
      const frames = [...frameMap.entries()].sort((a, b) => a[0] - b[0]).map(([frameIndex, objects]) => ({ frameIndex, objects }))
      const { facts: f, newLock } = computeFacts(tracks, d.bedZone, d.negativeExclusions, locks.current.get(rm.id) || null)
      if (newLock) locks.current.set(rm.id, newLock)
      overlays.current.set(rm.id, { frames, tracks, sliceStart, sliceDur, at: Date.now() })
      setFacts(f)
      setStage('3/3 WONDER + SPARK')
      const t = await api<{ event: WardEventDTO }>('/ward-api/triage', { body: { source: 'SAM', roomId: rm.id, movementFacts: f, reasoningEffort: c.effort, videoFileId: (videoPart as { file_id?: string } | null)?.file_id, imageDataUrl } })
      setVerdict(t.event)
      setLat((l) => ({ ...l, spark: `${t.event.latencyMs ?? 0}ms` }))
      setStage(`DONE · ${t.event.level}`)
      void refresh()
      return true
    } catch (e) {
      setStage('ERROR')
      setErr((e as Error).message)
      return false
    } finally {
      runningRef.current = false
      setRunning(false)
    }
  }

  const toggleRolling = async () => {
    if (rollingRef.current) {
      rollingRef.current = false
      setRolling(false)
      return
    }
    rollingRef.current = true
    setRolling(true)
    let fails = 0
    while (rollingRef.current) {
      const ok = await runCycle()
      fails = ok ? 0 : fails + 1
      if (fails >= 3) {
        setErr((m) => `${m} Rolling stopped after 3 consecutive failures.`)
        break
      }
      await sleep(ok ? 1200 : 3000)
    }
    rollingRef.current = false
    setRolling(false)
  }


  const lockPatient = async () => {
    const rm = roomRef.current
    const d = draftRef.current
    const photo = rm ? refPhotos.current.get(rm.id) : null
    if (!rm || !d || !photo) return
    setErr('')
    try {
      const frameZeroDataUrl = snapshot('image/jpeg', 0.85)
      setStage('MATCHING FRAME 0')
      const r = await api<{ found: boolean; box: BedZone | null; visual_desc: string }>('/ward-api/sam/locate', { body: { referencePhotoDataUrl: photo, frameZeroDataUrl, bedZone: d.bedZone } })
      if (!r.found || !r.box) {
        setErr('The reference patient was not found in Frame 0.')
        setStage('READY')
        return
      }
      const idx = Math.max(0, d.classes.findIndex((c) => c.role === 'Patient'))
      updateClass(idx, { spatialBox: r.box, ...(r.visual_desc ? { desc: r.visual_desc } : {}) })
      locks.current.set(rm.id, { nx1: r.box.xMin, ny1: r.box.yMin, nx2: r.box.xMax, ny2: r.box.yMax })
      setSel(idx)
      setMode('spatial')
      setStage('PATIENT LOCKED')
    } catch (e) {
      setErr((e as Error).message)
      setStage('READY')
    }
  }

  if (!snap) return <div className="h-96 animate-pulse rounded-2xl border border-line bg-panel" />
  const samLive = snap.api.state === 'LIVE' && snap.api.samVerified
  const shown = verdict && verdict.room === room?.id ? verdict : null
  const lastSam = room?.latestBySource?.SAM
  const refPhoto = room ? refPhotos.current.get(room.id) : undefined

  return (
    <div className="space-y-4">
      <RoomTabs rooms={snap.rooms} activeId={room?.id} onSelect={select} onAdd={() => setRoomModal('add')} source="SAM" />
      {!room || !draft ? (
        <Empty title="Watch a room" action={<Button variant="primary" onClick={() => setRoomModal('add')}>Add a room</Button>}>
          Connect a room camera, a webcam, or a test video. The AI watches and tells the nurse what needs attention first.
        </Empty>
      ) : (
        <>
        <p className="rounded-xl border border-line bg-panel px-4 py-3 text-xs leading-relaxed text-slate-300">Watch one room, in three simple steps: <strong className="text-white">1 · Who to watch</strong>, <strong className="text-white">2 · Start the video</strong>, <strong className="text-white">3 · Read the decision</strong>. You do not need to know how the AI works — just tell it who the patient is and press Check now.</p>
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
          {/* Step 1: who to watch */}
          <Panel eyebrow="Step 1" title="1 · Who to watch" className="xl:col-span-3" bodyClassName="space-y-3.5 p-4">
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-well p-1 text-[11px] font-semibold">
              {(['text', 'spatial', 'exemplar'] as Mode[]).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={cx('rounded-lg py-1.5', mode === m ? 'bg-accent text-slate-950' : 'text-slate-300 hover:text-white')}>
                  {m === 'text' ? 'Describe in words' : m === 'spatial' ? 'Point on screen' : 'Show an example'}
                </button>
              ))}
            </div>
            {mode === 'spatial' && (
              <div className="space-y-2 rounded-xl border border-line bg-raised p-2.5">
                <p className="text-[11px] text-slate-400">Tap the video to point at the person or thing you want to watch.</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['pos', 'neg', 'box'] as const).map((t) => (
                    <Button key={t} size="sm" variant={tool === t ? 'primary' : 'secondary'} onClick={() => setTool(t)}>
                      {t === 'pos' ? <><Plus className="h-3 w-3" /> This is it</> : t === 'neg' ? <><X className="h-3 w-3" /> Not this</> : <><Square className="h-3 w-3" /> Draw a box</>}
                    </Button>
                  ))}
                </div>
                <Button size="sm" className="w-full" onClick={() => updateClass(sel, { spatialPoints: [], spatialBox: null })}>
                  Clear my marks
                </Button>
              </div>
            )}
            {mode === 'exemplar' && (
              <div className="space-y-2 rounded-xl border border-line bg-raised p-2.5">
                <p className="text-[11px] text-slate-400">Draw a box around the thing once — the AI learns what it looks like.</p>
                <Button size="sm" variant={drawingEx ? 'primary' : 'secondary'} className="w-full" onClick={() => setDrawingEx((x) => !x)} disabled={mediaKind === 'none'}>
                  <Crosshair className="h-3.5 w-3.5" /> {drawingEx ? 'Draw on the video…' : 'Draw a box on the video'}
                </Button>
              </div>
            )}
            <details className="rounded-xl border border-line bg-well p-2.5 text-xs">
              <summary className="cursor-pointer font-semibold text-slate-300">Lock onto one patient with a photo</summary>
              <div className="mt-2.5 space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  className="block w-full text-[11px] text-slate-400 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-slate-200"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f || !room) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      refPhotos.current.set(room.id, String(reader.result))
                      rerender()
                    }
                    reader.readAsDataURL(f)
                  }}
                />
                {refPhoto && (
                  <div className="flex items-center gap-2">
                    <Image src={refPhoto} alt="Patient admission reference" width={40} height={40} unoptimized className="h-10 w-10 rounded-md border border-accent/50 object-cover" />
                    <Button size="sm" variant="primary" className="flex-1" onClick={lockPatient} disabled={mediaKind === 'none' || !snap.api.sparkVerified}>
                      <ScanFace className="h-3.5 w-3.5" /> Lock onto this patient
                    </Button>
                  </div>
                )}
                <p className="text-[10px] text-slate-500">The photo stays on this computer, except for the one-time match.</p>
              </div>
            </details>
            <label className="block space-y-1">
              <span className="text-[11px] text-slate-400">Never count as the patient (staff, visitors…)</span>
              <input className={cx(inputCls, 'py-1.5 font-mono text-xs')} value={draft.negativeExclusions} onChange={(e) => update((d) => ({ ...d, negativeExclusions: e.target.value }))} />
            </label>
            <div className="flex items-center justify-between">
              <button type="button" className="font-mono text-[11px] text-slate-500 hover:text-white" onClick={() => update((d) => ({ ...d, classes: DEFAULT_CLASSES.map((c) => ({ ...c, spatialPoints: [] })) }))}>
                Back to patient + staff
              </button>
              <Button
                size="sm"
                disabled={draft.classes.length >= 8}
                onClick={() => {
                  update((d) => ({ ...d, classes: [...d.classes, { label: '', desc: '', role: 'Object', color: COLORS[d.classes.length % COLORS.length], spatialPoints: [], spatialBox: null }] }))
                  setSel(draft.classes.length)
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Add person or thing
              </Button>
            </div>
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-0.5">
              {draft.classes.map((cls, idx) => {
                const ex = exemplars.current.get(`${room.id}:${idx}`)
                return (
                  <div key={idx} onClick={() => setSel(idx)} className={cx('space-y-2 rounded-xl border bg-raised p-2.5', idx === sel ? 'border-accent/60' : 'border-line')}>
                    <div className="flex items-center gap-1.5">
                      <input className={cx(inputCls, 'py-1.5 text-xs font-semibold')} placeholder="What is this? e.g. patient in bed" value={cls.label} onChange={(e) => updateClass(idx, { label: e.target.value })} />
                      <input type="color" aria-label="Class color" value={cls.color} onChange={(e) => updateClass(idx, { color: e.target.value })} className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent" />
                      <button
                        type="button"
                        aria-label="Remove class"
                        onClick={(e) => {
                          e.stopPropagation()
                          for (const k of [...exemplars.current.keys()]) if (k.startsWith(`${room.id}:`)) exemplars.current.delete(k)
                          update((d) => ({ ...d, classes: d.classes.filter((_, i) => i !== idx) }))
                          setSel(0)
                        }}
                        className="shrink-0 text-slate-500 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input className={cx(inputCls, 'py-1.5 text-[11px]')} placeholder="What does it look like?" value={cls.desc} onChange={(e) => updateClass(idx, { desc: e.target.value })} />
                    <div className="flex items-center justify-between gap-2">
                      <select className="rounded-md border border-line-strong bg-well px-1.5 py-1 text-[11px] text-slate-200" value={cls.role} onChange={(e) => updateClass(idx, { role: e.target.value as VisionClass['role'] })}>
                        <option value="Patient">This is the patient</option>
                        <option value="Staff">This is staff</option>
                        <option value="Object">This is equipment</option>
                      </select>
                      <span className="font-mono text-[10px] text-accent">
                        {cls.spatialBox ? 'Box drawn ' : ''}
                        {cls.spatialPoints.length ? `${cls.spatialPoints.length} points` : ''}
                      </span>
                    </div>
                    {ex && (
                      <div className="flex items-center gap-2 border-t border-line pt-2">
                        <Image src={ex} alt="Exemplar crop" width={36} height={36} unoptimized className="h-9 w-9 rounded border border-accent/50 object-cover" />
                        <span className="font-mono text-[10px] text-accent">Example saved</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Panel>

          {/* Step 2: video */}
          <section className="overflow-hidden rounded-2xl border border-line bg-panel xl:col-span-5">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cx('h-2 w-2 rounded-full', mediaKind === 'none' ? 'bg-slate-600' : 'bg-emerald-400')} />
                <span className="truncate font-semibold text-slate-200">{mediaKind === 'none' ? 'No video source' : `${room.name} · ${mediaLabel}`}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cx('font-mono text-[11px]', stage === 'ERROR' ? 'text-rose-300' : 'text-accent')}>{stage}</span>
                <button type="button" aria-label="Room & camera settings" onClick={() => setRoomModal('edit')} className="text-slate-500 hover:text-white">
                  <Settings2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="relative aspect-video w-full select-none overflow-hidden bg-[#05080f]">
              <video ref={videoRef} playsInline muted controls={mediaKind === 'video' && !interactive} className={cx('absolute inset-0 h-full w-full object-contain', mediaKind !== 'video' && 'hidden', privacy && 'opacity-0')} />
              {imgSrc && (
                // Live MJPEG camera stream (not a content image), so next/image does not apply.
                // eslint-disable-next-line @next/next/no-img-element
                <img ref={imgRef} src={imgSrc} alt={`${room.name} camera`} className={cx('absolute inset-0 h-full w-full object-contain', privacy && 'opacity-0')} onError={() => setErr('Camera could not be loaded. Check the room camera settings and try again.')} />
              )}
              {mediaKind === 'none' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="font-display text-sm font-semibold text-white">Connect a video source</p>
                  <p className="max-w-sm text-xs text-slate-400">Use the room camera, a webcam, or a test video (.mp4 or .mov).</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" variant="primary" onClick={() => fileRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" /> Load a video
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          setMedia({ kind: 'webcam', stream: await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false }) })
                        } catch (e) {
                          setErr(`Webcam unavailable: ${(e as Error).message}`)
                        }
                      }}
                    >
                      <Camera className="h-3.5 w-3.5" /> Use webcam
                    </Button>
                    <Button size="sm" onClick={() => setRoomModal('edit')}>
                      <Settings2 className="h-3.5 w-3.5" /> Room camera settings
                    </Button>
                  </div>
                </div>
              )}
              <canvas
                ref={canvasRef}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className={cx('absolute inset-0 h-full w-full touch-none', interactive ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none')}
              />
              <input
                ref={fileRef}
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  if (/webm/i.test(f.type) || /\.webm$/i.test(f.name)) return setErr('Please use an .mp4 or .mov video — other formats do not work here.')
                  setMedia({ kind: 'file', file: f, url: URL.createObjectURL(f) })
                }}
              />
            </div>
            <div className="space-y-3 border-t border-line p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant={editBed ? 'primary' : 'secondary'} onClick={() => setEditBed((x) => !x)}>
                    <MousePointerClick className="h-3.5 w-3.5" /> {editBed ? 'Done marking bed' : 'Mark the bed area'}
                  </Button>
                  <Button size="sm" variant={privacy ? 'primary' : 'secondary'} onClick={() => setPrivacy((x) => !x)}>
                    {privacy ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {privacy ? 'Hide video (outlines only)' : 'Show video'}
                  </Button>
                  <Button size="sm" variant={traces ? 'primary' : 'secondary'} onClick={() => setTraces((x) => !x)}>
                    <Route className="h-3.5 w-3.5" /> Movement trails
                  </Button>
                  {mediaKind !== 'none' && mediaMap.current.has(room.id) && (
                    <Button size="sm" variant="ghost" onClick={() => setMedia(null)}>
                      <X className="h-3.5 w-3.5" /> Disconnect
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <select aria-label="Capture mode" className="rounded-md border border-line-strong bg-well px-1.5 py-1 font-mono text-[11px] text-slate-200" value={capture} onChange={(e) => setCapture(e.target.value as 'clip' | 'frame')}>
                    <option value="clip">Short video check (3.5 sec)</option>
                    <option value="frame">Single photo check</option>
                  </select>
                  <select aria-label="Mask encoding" className="rounded-md border border-line-strong bg-well px-1.5 py-1 font-mono text-[11px] text-slate-200" value={maskEnc} onChange={(e) => setMaskEnc(e.target.value)}>
                    <option value="one_bit">Standard outline</option>
                    <option value="lossless">Detailed outline</option>
                  </select>
                  <select aria-label="Spark reasoning effort" className="rounded-md border border-line-strong bg-well px-1.5 py-1 font-mono text-[11px] text-slate-200" value={effort} onChange={(e) => setEffort(e.target.value)}>
                    {['minimal', 'low', 'medium', 'high'].map((x) => (
                      <option key={x} value={x}>
                        {x === 'minimal' ? 'Fastest' : x === 'low' ? 'Quick' : x === 'medium' ? 'Careful' : 'Most careful'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <ErrorText>{err}</ErrorText>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <span className="max-w-[260px] truncate text-[11px] text-slate-400">About this patient: {room.clinicalContext || '—'}</span>
                <div className="flex gap-2">
                  <Button onClick={() => void runCycle()} disabled={running || rolling || !samLive || mediaKind === 'none'}>
                    Check now
                  </Button>
                  <Button variant={rolling ? 'danger' : 'primary'} onClick={toggleRolling} disabled={!rolling && (!samLive || mediaKind === 'none')}>
                    {rolling ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {rolling ? 'Stop watching' : 'Watch continuously'}
                  </Button>
                </div>
              </div>
              {!samLive && <p className="text-[11px] text-amber-200/90">Video watching is paused — connect Meta in AI settings first.</p>}
            </div>
          </section>

          {/* Step 3: decision + live picture */}
          <div className="space-y-4 xl:col-span-4">
            <Panel eyebrow="Step 3 · Decision" title="What the AI decided" actions={<LevelBadge level={shown?.level || lastSam?.level || 'STANDBY'} />} bodyClassName="space-y-3 p-4">
              {shown || lastSam ? (
                <>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-sm font-bold text-white">{shown?.headline || lastSam?.headline}</h3>
                    <EngineTag engine={shown?.engine || lastSam?.engine} failSafe={shown?.failSafe || lastSam?.failSafe} />
                  </div>
                  <p className="text-xs leading-relaxed text-slate-300">{shown?.reason || lastSam?.reason}</p>
                  <div className="rounded-xl border border-accent/30 border-l-4 border-l-accent bg-well p-3">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-accent">Nurse action</div>
                    <p className="mt-0.5 text-xs font-semibold text-white">{shown?.nurseAction || lastSam?.nurseAction}</p>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400">Press Check now or Watch continuously and the decision will appear here.</p>
              )}
            </Panel>
            <Panel eyebrow="What the camera sees" title="Live picture" bodyClassName="space-y-3 p-4">
              <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[11px]">
                {(['upload', 'sam', 'spark'] as const).map((k) => (
                  <div key={k} className="rounded-lg border border-line bg-well p-2">
                    <div className="text-[10px] text-slate-500">{k === 'upload' ? 'Video' : k === 'sam' ? 'Watching' : 'Decision'}</div>
                    <div className="truncate font-semibold text-white">{lat[k]}</div>
                  </div>
                ))}
              </div>
              {facts ? (
                <>
                  <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                    <Flag on={facts.patient_visible} label="Patient seen" />
                    <Flag on={facts.patient_out_of_bed} label="Out of bed" warn />
                    <Flag on={facts.staff_co_present_near_bed} label="Staff at bedside" />
                    <span className="rounded border border-line px-1.5 py-0.5 text-slate-400">Following: {facts.patient_lock === 'continuity' ? 'same patient as before' : facts.patient_lock === 'origin_bed' ? 'patient in bed' : facts.patient_lock === 'single_person_track' ? 'only person seen' : 'not locked yet'}</span>
                  </div>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto">
                    {(facts.tracks as { track_id: string; resolved_role: string; bed_overlap_start_pct: number; bed_overlap_end_pct: number }[]).map((t) => (
                      <div key={t.track_id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-well px-2.5 py-1.5 font-mono text-[11px]">
                        <span className="truncate">
                          {t.track_id} ·{' '}
                          <strong className={t.resolved_role === 'ORIGIN_LOCKED_PATIENT' ? 'text-accent' : t.resolved_role === 'STAFF_OR_EXCLUDED' ? 'text-sky-300' : 'text-amber-200'}>{t.resolved_role === 'ORIGIN_LOCKED_PATIENT' ? 'Patient' : t.resolved_role === 'STAFF_OR_EXCLUDED' ? 'Staff' : t.resolved_role === 'EQUIPMENT' ? 'Equipment' : 'Not sure yet'}</strong>
                        </span>
                        <span className="shrink-0 text-slate-500">
                          in bed {t.bed_overlap_start_pct}%→{t.bed_overlap_end_pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="font-mono text-[11px] text-slate-500">Nothing watched yet.</p>
              )}
            </Panel>
            <Panel eyebrow="Step by step" title="How the decision was made" bodyClassName="space-y-2.5 p-4 font-mono text-[11px]">
              <div className="rounded-lg border border-line bg-well p-2.5">
                <div className="text-[10px] uppercase text-slate-500">1. Watching — finds people in the video</div>
                <div className="mt-0.5 text-slate-200">{facts ? `Found ${facts.tracks.length} people or things` : 'Waiting for video'}</div>
              </div>
              <div className="rounded-lg border border-line bg-well p-2.5">
                <div className="text-[10px] uppercase text-slate-500">2. Second look — checks the movement again, only when needed</div>
                <div className="mt-0.5 text-slate-200">{shown?.engine === "wonder" ? "Checked the short video again" : "Only runs when something unusual happens"}</div>
              </div>
              <div className="rounded-lg border border-line bg-well p-2.5">
                <div className="text-[10px] uppercase text-slate-500">3. Decision — ranks how urgent it is</div>
                <div className="mt-0.5 text-slate-200">{shown ? `Verdict: ${shown.level.toUpperCase()} — ${shown.headline}` : "Waiting for the watching step"}</div>
              </div>
            </Panel>
          </div>
        </div>
        </>
      )}
      <RoomFormModal
        open={roomModal !== null}
        onClose={() => setRoomModal(null)}
        room={roomModal === 'edit' ? room : null}
        onSaved={(r) => {
          select(r.id)
          setMediaVer((x) => x + 1)
        }}
      />
    </div>
  )
}

function Flag({ on, label, warn }: { on: boolean; label: string; warn?: boolean }) {
  return (
    <span className={cx('rounded border px-1.5 py-0.5', on ? (warn ? 'border-rose-500/50 text-rose-200' : 'border-accent/40 text-accent') : 'border-line text-slate-500')}>
      {on ? '' : 'no '}
      {label}
    </span>
  )
}
