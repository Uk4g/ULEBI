'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { EscalationDTO, StaffRole, WardSnapshot } from '@/lib/wardni/types'
import { api, ApiError, SIGNED_OUT_EVENT } from './client'
import { wardAudio } from './audio'

export type Conn = 'connecting' | 'live' | 'lost' | 'signed-out'
export type ThemeMode = 'dark' | 'light'

export type ToastItem = {
  id: string
  tone: 'ok' | 'err' | 'info'
  title: string
  detail?: string
}

type WardCtx = {
  snap: WardSnapshot | null
  conn: Conn
  refresh: () => Promise<void>
  serverNow: () => number
  alarms: EscalationDTO[]
  snoozedUntil: number
  snooze: (ms: number) => void
  apiModalOpen: boolean
  setApiModalOpen: (open: boolean) => void
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  toggleTheme: () => void
  effectiveRole: StaffRole
  roleOverride: StaffRole | null
  setRoleOverride: (r: StaffRole | null) => void
  toasts: ToastItem[]
  pushToast: (t: Omit<ToastItem, 'id'>) => void
  dismissToast: (id: string) => void
  timelineJumpIso: string | null
  setTimelineJumpIso: (iso: string | null) => void
}

const Ctx = createContext<WardCtx | null>(null)

const POLL_MS = 2000

/**
 * Polls /ward-api/state every 2s. Also manages theme (Night-Shift dark vs Daylight light),
 * role-view preview, toast notifications, idle auto-lock, and timeline jump coordination.
 */
export function WardProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<WardSnapshot | null>(null)
  const [conn, setConn] = useState<Conn>('connecting')
  const [snoozedUntil, setSnoozedUntil] = useState(0)
  const [apiModalOpen, setApiModalOpen] = useState(false)
  const [theme, setThemeState] = useState<ThemeMode>('dark')
  const [roleOverride, setRoleOverride] = useState<StaffRole | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [timelineJumpIso, setTimelineJumpIso] = useState<string | null>(null)

  const fails = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offset = useRef(0)
  const seenEvents = useRef<Set<string> | null>(null)
  const seenAlarms = useRef<Set<string>>(new Set())
  const inFlight = useRef<Promise<void> | null>(null)
  const connRef = useRef<Conn>('connecting')

  // Load saved theme
  useEffect(() => {
    try {
      const saved = localStorage.getItem('wardni_theme') as ThemeMode | null
      const initial: ThemeMode = saved === 'light' ? 'light' : 'dark'
      setThemeState(initial)
      document.documentElement.setAttribute('data-theme', initial)
    } catch {
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  const setTheme = useCallback((t: ThemeMode) => {
    setThemeState(t)
    try {
      localStorage.setItem('wardni_theme', t)
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', t)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  const pushToast = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setToasts((prev) => [...prev.slice(-4), { ...t, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id))
    }, 4200)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const signals = useCallback((s: WardSnapshot) => {
    const audio = wardAudio()
    if (seenEvents.current) {
      const fresh = s.events.filter((e) => !seenEvents.current!.has(e.id))
      const top = fresh.find((e) => e.level === 'RED') || fresh.find((e) => e.level === 'YELLOW')
      if (top) audio.tone(top.level as 'RED' | 'YELLOW')
    }
    seenEvents.current = new Set(s.events.map((e) => e.id))
    for (const esc of s.escalations) {
      if (esc.active && esc.status === 'AUTOMATED_EMERGENCY_ALARM' && !seenAlarms.current.has(esc.id)) {
        seenAlarms.current.add(esc.id)
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`WARDNI RED ALARM — ${esc.roomName}`, {
              body: esc.nurseAction || esc.headline || 'Unanswered emergency',
              requireInteraction: true,
            })
          } catch {
            /* notification blocked */
          }
        }
      }
    }
  }, [])

  const poll = useCallback(async () => {
    if (inFlight.current) return inFlight.current
    if (timer.current) clearTimeout(timer.current)
    inFlight.current = (async () => {
      try {
        const s = await api<WardSnapshot>('/ward-api/state')
        offset.current = Date.parse(s.serverTime) - Date.now()
        fails.current = 0
        setSnap(s)
        connRef.current = 'live'
        setConn('live')
        signals(s)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          connRef.current = 'signed-out'
          setConn('signed-out')
        } else {
          fails.current += 1
          if (fails.current >= 2) {
            connRef.current = 'lost'
            setConn('lost')
          }
        }
      } finally {
        inFlight.current = null
        const delay = connRef.current === 'signed-out' ? 10_000 : fails.current ? 4000 : POLL_MS
        timer.current = setTimeout(() => void poll(), delay)
      }
    })()
    return inFlight.current
  }, [signals])

  useEffect(() => {
    void poll()
    const onOut = () => {
      connRef.current = 'signed-out'
      setConn('signed-out')
    }
    const onVisible = () => document.visibilityState === 'visible' && void poll()
    window.addEventListener(SIGNED_OUT_EVENT, onOut)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      window.removeEventListener(SIGNED_OUT_EVENT, onOut)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [poll])

  // Idle station auto-lock timer
  useEffect(() => {
    const mins = snap?.idleLockMinutes ?? 30
    if (!mins || mins <= 0 || conn === 'signed-out') return
    let idleTimer: ReturnType<typeof setTimeout>
    const resetIdle = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        void api('/ward-api/auth/logout', { method: 'POST', body: { clearSessionKeys: true } }).finally(() => {
          window.location.href = '/login'
        })
      }, mins * 60_000)
    }
    resetIdle()
    window.addEventListener('pointerdown', resetIdle, { passive: true })
    window.addEventListener('keydown', resetIdle)
    return () => {
      clearTimeout(idleTimer)
      window.removeEventListener('pointerdown', resetIdle)
      window.removeEventListener('keydown', resetIdle)
    }
  }, [snap?.idleLockMinutes, conn])

  const alarms = useMemo(() => (snap?.escalations || []).filter((e) => e.active && e.status === 'AUTOMATED_EMERGENCY_ALARM'), [snap])

  useEffect(() => {
    const audio = wardAudio()
    const evaluate = () => {
      if (alarms.length && Date.now() >= snoozedUntil) audio.startSiren()
      else audio.stopSiren()
    }
    evaluate()
    const t = snoozedUntil > Date.now() ? setTimeout(evaluate, snoozedUntil - Date.now() + 50) : null
    return () => {
      if (t) clearTimeout(t)
    }
  }, [alarms, snoozedUntil])

  useEffect(() => () => wardAudio().stopSiren(), [])

  useEffect(() => {
    if (conn !== 'lost' && conn !== 'signed-out') return
    const t = setInterval(() => wardAudio().tone('YELLOW'), 30_000)
    return () => clearInterval(t)
  }, [conn])

  const effectiveRole: StaffRole = roleOverride || snap?.me.role || 'admin'

  const value = useMemo<WardCtx>(
    () => ({
      snap,
      conn,
      refresh: poll,
      serverNow: () => Date.now() + offset.current,
      alarms,
      snoozedUntil,
      snooze: (ms: number) => setSnoozedUntil(Date.now() + ms),
      apiModalOpen,
      setApiModalOpen,
      theme,
      setTheme,
      toggleTheme,
      effectiveRole,
      roleOverride,
      setRoleOverride,
      toasts,
      pushToast,
      dismissToast,
      timelineJumpIso,
      setTimelineJumpIso,
    }),
    [snap, conn, poll, alarms, snoozedUntil, apiModalOpen, theme, setTheme, toggleTheme, effectiveRole, roleOverride, toasts, pushToast, dismissToast, timelineJumpIso],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWard() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWard must be used inside WardProvider')
  return v
}

export function useNow(ms = 1000) {
  const { serverNow } = useWard()
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), ms)
    return () => clearInterval(t)
  }, [ms])
  return serverNow()
}

export function useAudioState() {
  const audio = wardAudio()
  return useSyncExternalStore(
    (cb) => audio.subscribe(cb),
    () => `${audio.unlocked ? 1 : 0}${audio.tonesEnabled ? 1 : 0}`,
    () => '01',
  )
}
