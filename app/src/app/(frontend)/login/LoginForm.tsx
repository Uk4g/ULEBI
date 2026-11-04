'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Lock, Moon, ShieldCheck, Sun } from 'lucide-react'
import { api, ApiError } from '@/components/wardni/client'
import { BrandMark, UlebiWordmark } from '@/components/wardni/AppShell'
import { Button, cx, inputCls } from '@/components/wardni/ui'

const ULEBI_EMAIL_RE = /^[^\s@]+@ulebi\.com$/i
const FIRST_LOGIN_EMAIL = 'admin@ulebi.com'
const FIRST_LOGIN_PASSWORD = 'Ulebi@2026!'

export function LoginForm({ next = '/dashboard' }: { next?: string; restrictedTo?: string[]; testMode?: boolean }) {
  const router = useRouter()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [form, setForm] = useState({ email: FIRST_LOGIN_EMAIL, password: FIRST_LOGIN_PASSWORD, remember: true })
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [failedCount, setFailedCount] = useState(0)
  const [lockoutSec, setLockoutSec] = useState(0)

  const emailRef = useRef<HTMLInputElement>(null)
  const passRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('wardni_theme') === 'light' ? 'light' : 'dark'
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (lockoutSec <= 0) return
    const t = setInterval(() => {
      setLockoutSec((s) => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [lockoutSec])

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    try {
      localStorage.setItem('wardni_theme', nextTheme)
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute('data-theme', nextTheme)
  }

  const fillFirstLogin = (email = FIRST_LOGIN_EMAIL, password = FIRST_LOGIN_PASSWORD) => {
    setForm((f) => ({ ...f, email, password }))
    setFieldErrors({})
    setErr('')
  }

  const validate = () => {
    const errs: { email?: string; password?: string } = {}
    const cleanEmail = form.email.trim().toLowerCase()
    if (!cleanEmail) {
      errs.email = 'Enter your @ulebi.com work email.'
    } else if (!ULEBI_EMAIL_RE.test(cleanEmail)) {
      errs.email = 'Access is restricted to @ulebi.com email addresses (e.g. admin@ulebi.com).'
    }
    if (form.password.length < 8) {
      errs.password = 'Password must be at least 8 characters.'
    }
    setFieldErrors(errs)
    if (errs.email) emailRef.current?.focus()
    else if (errs.password) passRef.current?.focus()
    return Object.keys(errs).length === 0
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (lockoutSec > 0) return
    if (!validate()) return

    setBusy(true)
    try {
      await api('/ward-api/auth/login', {
        body: {
          email: form.email.trim().toLowerCase(),
          password: form.password,
          remember: form.remember,
        },
      })
      router.replace(next || '/dashboard')
      router.refresh()
    } catch (e2) {
      const msg = (e2 as Error).message
      setErr(msg)
      if (e2 instanceof ApiError && e2.status === 429) {
        setFailedCount(5)
        setLockoutSec(60)
      } else if (e2 instanceof ApiError && e2.status === 401) {
        setFailedCount((c) => {
          const nextC = c + 1
          if (nextC >= 5) setLockoutSec(60)
          return nextC
        })
      }
      setBusy(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <div className="fixed left-4 top-4 z-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-line-strong hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Home
        </Link>
      </div>

      <div className="fixed right-4 top-4 z-20">
        <Button size="sm" variant="secondary" onClick={toggleTheme} aria-label="Toggle light and dark theme">
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5 text-amber-300" /> : <Moon className="h-3.5 w-3.5 text-slate-700" />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </Button>
      </div>

      <div className="w-full max-w-[440px] overflow-hidden rounded-3xl border border-line bg-panel shadow-2xl"><div style={{ background: 'linear-gradient(90deg,#2DD4BF,#38BDF8,#A78BFA)' }} className="h-1.5 w-full" /><div className="p-8">
        <div className="flex flex-col items-center text-center">
          <BrandMark className="h-11 w-11" />
          <div className="mt-3.5 flex items-center justify-center gap-2 text-white">
            <UlebiWordmark className="h-4 w-auto" />
          </div>
          <h1 className="mt-3 font-display text-xl font-semibold tracking-tight text-white">Welcome back</h1><p className="mt-1 text-sm text-slate-300">Sign in to the night-shift dashboard.</p>
          <p className="mt-1 text-xs text-slate-400">
            Use your hospital work email to open the ward dashboard.
          </p>
        </div>

        {/* First time here? Use this account Box */}
        <div className="mt-5 rounded-xl border border-sky-500/35 bg-sky-500/10 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-sky-300">
              <KeyRound className="h-3 w-3" /> First time here? Use this account
            </span>
            <button
              type="button"
              onClick={() => fillFirstLogin(FIRST_LOGIN_EMAIL, FIRST_LOGIN_PASSWORD)}
              className="rounded border border-sky-400/40 bg-sky-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-sky-200 hover:bg-sky-500/30"
            >
              Fill it in for me
            </button>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2 font-mono text-[11px]">
            <div>
              <span className="text-slate-400">Email: </span>
              <span className="font-semibold text-white">{FIRST_LOGIN_EMAIL}</span>
            </div>
            <div>
              <span className="text-slate-400">Pass: </span>
              <span className="font-semibold text-white">{FIRST_LOGIN_PASSWORD}</span>
            </div>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          {lockoutSec > 0 && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-rose-500/60 bg-rose-500/15 p-3 text-xs text-rose-200"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <div>
                <div className="font-semibold">Too many tries — please wait</div>
                <div className="mt-0.5 font-mono text-[11px]">Retry in {lockoutSec}s</div>
              </div>
            </div>
          )}

          {err && lockoutSec === 0 && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-500/50 bg-rose-500/12 p-3 text-xs text-rose-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{err}</span>
            </div>
          )}

          <div>
            <label htmlFor="ulebi-login-email" className="mb-1.5 block text-xs font-medium text-slate-300">
              Work email
            </label>
            <input
              id="ulebi-login-email"
              ref={emailRef}
              className={cx(inputCls, 'font-mono text-xs', fieldErrors.email && 'border-rose-500')}
              type="email"
              autoComplete="email"
              placeholder="admin@ulebi.com"
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value })
                if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined })
              }}
              autoFocus
            />
            {fieldErrors.email && <p className="mt-1 font-mono text-[11px] text-rose-300">{fieldErrors.email}</p>}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="ulebi-login-password" className="text-xs font-medium text-slate-300">
                Password
              </label>
              <span className="font-mono text-[10px] text-slate-500">At least 8 characters</span>
            </div>
            <div className="relative">
              <input
                id="ulebi-login-password"
                ref={passRef}
                className={cx(inputCls, 'pr-9 font-mono text-xs', fieldErrors.password && 'border-rose-500')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => {
                  setForm({ ...form, password: e.target.value })
                  if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined })
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.password && <p className="mt-1 font-mono text-[11px] text-rose-300">{fieldErrors.password}</p>}
          </div>

          <div className="flex items-center justify-between text-xs pt-0.5">
            <label className="flex cursor-pointer items-center gap-2 text-slate-400 hover:text-slate-200">
              <input
                type="checkbox"
                checked={form.remember}
                onChange={(e) => setForm({ ...form, remember: e.target.checked })}
                className="accent-sky-400"
              />
              <span>Keep me signed in on this computer</span>
            </label>
            {failedCount > 0 && failedCount < 5 && (
              <span className="font-mono text-[10px] text-amber-300">{5 - failedCount} attempts left</span>
            )}
          </div>

          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={lockoutSec > 0} className="w-full justify-center">
            <span>Sign in</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 border-t border-line pt-4 font-mono text-[10px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>Ulebi · Night-shift ward dashboard</span>
        </div>
      </div>
      </div>
    </main>
  )
}
