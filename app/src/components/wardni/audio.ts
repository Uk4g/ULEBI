'use client'

/**
 * Ward alarm audio. Verdict tones can be muted; the emergency siren cannot be muted —
 * only snoozed for a short time — so an unanswered RED is never silent.
 */
type Listener = () => void

class WardAudio {
  private ctx: AudioContext | null = null
  private siren: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<Listener>()
  tonesEnabled = true

  constructor() {
    if (typeof window !== 'undefined') {
      this.tonesEnabled = localStorage.getItem('wardni_tones') !== 'off'
      const unlock = () => this.unlock()
      window.addEventListener('pointerdown', unlock, { passive: true })
      window.addEventListener('keydown', unlock)
    }
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  private emit() {
    this.listeners.forEach((l) => l())
  }

  get unlocked() {
    return this.ctx?.state === 'running'
  }

  unlock() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!Ctx) return
        this.ctx = new Ctx()
        this.ctx.onstatechange = () => this.emit()
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.emit())
      this.emit()
    } catch {
      /* audio unavailable */
    }
  }

  setTones(on: boolean) {
    this.tonesEnabled = on
    localStorage.setItem('wardni_tones', on ? 'on' : 'off')
    this.emit()
  }

  private beep(freqs: number[], step: number, type: OscillatorType, gainV: number) {
    if (!this.ctx || this.ctx.state !== 'running') return
    const now = this.ctx.currentTime
    freqs.forEach((f, i) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      osc.type = type
      osc.frequency.value = f
      gain.gain.setValueAtTime(gainV, now + i * step)
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * step + step * 0.9)
      osc.connect(gain)
      gain.connect(this.ctx!.destination)
      osc.start(now + i * step)
      osc.stop(now + i * step + step)
    })
  }

  tone(level: 'RED' | 'YELLOW') {
    if (!this.tonesEnabled) return
    if (level === 'RED') this.beep([880, 660, 880, 660], 0.17, 'triangle', 0.18)
    else this.beep([587.33, 783.99], 0.22, 'sine', 0.12)
  }

  startSiren() {
    if (this.siren) return
    const play = () => this.beep([960, 720, 960, 720, 960, 720], 0.2, 'square', 0.12)
    play()
    this.siren = setInterval(play, 1800)
  }

  stopSiren() {
    if (this.siren) clearInterval(this.siren)
    this.siren = null
  }
}

let instance: WardAudio | null = null
export function wardAudio() {
  if (!instance) instance = new WardAudio()
  return instance
}
