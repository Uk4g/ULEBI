/**
 * Browser-side audio helpers for the Muse Voice Transcribe path. Pure functions (no DOM) so they run in tests.
 * Muse Voice Transcribe's file endpoint accepts only mono 16-bit PCM WAV at 16 kHz or 24 kHz.
 */

export const ASR_SAMPLE_RATE = 16_000

/** Box-filter resampler (averages the source samples under each output sample, which limits aliasing when downsampling). */
export function resampleTo(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input
  const ratio = from / to
  const outLen = Math.max(0, Math.floor(input.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const a = i * ratio
    const b = Math.min(input.length, (i + 1) * ratio)
    let lo = Math.floor(a)
    const hi = Math.max(lo + 1, Math.ceil(b))
    let sum = 0
    let n = 0
    for (; lo < hi && lo < input.length; lo++, n++) sum += input[lo]
    out[i] = n ? sum / n : 0
  }
  return out
}

/** Encodes mono float samples (-1..1) as a 44-byte-header PCM16 little-endian WAV. */
export function encodeWav16(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = samples.length * 2
  const buf = new ArrayBuffer(44 + bytes)
  const dv = new DataView(buf)
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i))
  }
  w(0, 'RIFF')
  dv.setUint32(4, 36 + bytes, true)
  w(8, 'WAVE')
  w(12, 'fmt ')
  dv.setUint32(16, 16, true)
  dv.setUint16(20, 1, true) // PCM
  dv.setUint16(22, 1, true) // mono
  dv.setUint32(24, sampleRate, true)
  dv.setUint32(28, sampleRate * 2, true)
  dv.setUint16(32, 2, true)
  dv.setUint16(34, 16, true)
  w(36, 'data')
  dv.setUint32(40, bytes, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Uint8Array(buf)
}

export type Segment = { samples: Float32Array; durationMs: number; forced: boolean }

export type SegmenterOptions = {
  sampleRate: number
  windowMs?: number
  /** audio kept from before speech was confirmed, so the first syllable is not clipped */
  prerollMs?: number
  /** silence that ends an utterance */
  hangoverMs?: number
  /** speech shorter than this (clicks, bumps) is discarded */
  minSpeechMs?: number
  /** hard cut so a long monologue or constant noise still reaches the transcriber */
  maxSegmentMs?: number
  /** absolute RMS floor for "speech" */
  minThreshold?: number
  /** speech must exceed noiseFloor * ratio */
  ratio?: number
}

/**
 * Energy-based voice-activity segmenter with an adaptive noise floor. Feed it arbitrary-size mono chunks; it returns
 * finished utterances. Deliberately simple and sensitive: a missed cry for help is worse than an extra transcription.
 */
export class SpeechSegmenter {
  private o: Required<SegmenterOptions>
  private win: number
  private carry = new Float32Array(0)
  private noise = 0.004
  private preroll: Float32Array[] = []
  private candidate: Float32Array[] = []
  private recording: Float32Array[] | null = null
  private speechRun = 0
  private silenceMs = 0
  private recMs = 0

  constructor(opts: SegmenterOptions) {
    this.o = { windowMs: 20, prerollMs: 300, hangoverMs: 900, minSpeechMs: 160, maxSegmentMs: 12_000, minThreshold: 0.012, ratio: 3.5, ...opts }
    this.win = Math.max(1, Math.round((this.o.sampleRate * this.o.windowMs) / 1000))
  }

  /** Current speech threshold (RMS), exposed for UI meters. */
  get threshold() {
    return Math.max(this.o.minThreshold, this.noise * this.o.ratio)
  }

  get active() {
    return this.recording !== null || this.candidate.length > 0
  }

  push(chunk: Float32Array): Segment[] {
    const out: Segment[] = []
    let data = chunk
    if (this.carry.length) {
      data = new Float32Array(this.carry.length + chunk.length)
      data.set(this.carry, 0)
      data.set(chunk, this.carry.length)
    }
    let off = 0
    for (; off + this.win <= data.length; off += this.win) this.window(data.slice(off, off + this.win), out)
    this.carry = data.slice(off)
    return out
  }

  /** Flushes an utterance that is still in progress (call when listening stops). */
  flush(): Segment[] {
    const out: Segment[] = []
    if (this.recording) this.finish(out, false)
    this.candidate = []
    this.speechRun = 0
    return out
  }

  private window(w: Float32Array, out: Segment[]) {
    let sum = 0
    for (let i = 0; i < w.length; i++) sum += w[i] * w[i]
    const rms = Math.sqrt(sum / w.length)
    const speech = rms > this.threshold
    const winMs = this.o.windowMs

    if (this.recording) {
      this.recording.push(w)
      this.recMs += winMs
      this.silenceMs = speech ? 0 : this.silenceMs + winMs
      if (this.silenceMs >= this.o.hangoverMs) this.finish(out, false)
      else if (this.recMs >= this.o.maxSegmentMs) this.finish(out, true, true)
      return
    }

    if (speech) {
      this.candidate.push(w)
      this.speechRun += winMs
      if (this.speechRun >= this.o.minSpeechMs) {
        this.recording = [...this.preroll, ...this.candidate]
        this.recMs = this.recording.length * winMs
        this.silenceMs = 0
        this.preroll = []
        this.candidate = []
        this.speechRun = 0
      }
      return
    }

    // not speech: update the noise floor, drop an unconfirmed candidate into the preroll ring
    this.noise = Math.min(0.05, Math.max(0.001, this.noise * 0.95 + rms * 0.05))
    if (this.candidate.length) {
      this.preroll.push(...this.candidate)
      this.candidate = []
      this.speechRun = 0
    }
    this.preroll.push(w)
    const keep = Math.ceil(this.o.prerollMs / winMs)
    if (this.preroll.length > keep) this.preroll.splice(0, this.preroll.length - keep)
  }

  private finish(out: Segment[], forced: boolean, continueRecording = false) {
    const wins = this.recording || []
    // keep ~200 ms of trailing silence, drop the rest of the hangover
    const trailing = Math.floor(this.silenceMs / this.o.windowMs)
    const dropTrail = Math.max(0, trailing - Math.ceil(200 / this.o.windowMs))
    const kept = wins.slice(0, wins.length - dropTrail)
    const samples = new Float32Array(kept.length * this.win)
    kept.forEach((k, i) => samples.set(k, i * this.win))
    out.push({ samples, durationMs: kept.length * this.o.windowMs, forced })
    this.recording = continueRecording ? [] : null
    this.recMs = 0
    this.silenceMs = 0
  }
}
