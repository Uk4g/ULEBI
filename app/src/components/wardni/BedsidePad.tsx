'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bath, CircleCheck, CupSoda, GlassWater, HandHeart, Loader2, Siren, UtensilsCrossed } from 'lucide-react'
import { api, ApiError } from './client'
import { wardAudio } from './audio'
import { cx } from './ui'
import type { EscalationDTO, EventSummary, TaskId } from '@/lib/wardni/types'

type Lang = 'en' | 'fr' | 'ar'
type PadState = {
  room: { id: string; name: string }
  latestTask: EventSummary | null
  escalation: EscalationDTO | null
  acknowledged: EscalationDTO | null
}

const ICONS: Record<TaskId, typeof Siren> = {
  'EMERGENCY HELP': Siren,
  'BATHROOM ASSIST': Bath,
  WATER: GlassWater,
  DRINK: CupSoda,
  EAT: UtensilsCrossed,
  'PAIN / COMFORT': HandHeart,
}

type Strings = {
  tasks: Record<TaskId, [string, string]>
  note: string
  sending: string
  helpComing: string
  called: string
  allAlerted: string
  notified: string
  onTheWay: string
  retrying: string
  sent: string
  invalid: string
  stay: string
}

const T: Record<Lang, Strings> = {
  en: {
    tasks: {
      'EMERGENCY HELP': ['Help', 'Emergency'],
      'BATHROOM ASSIST': ['Bathroom', 'Help me get up'],
      WATER: ['Water', 'A glass of water'],
      DRINK: ['Drink', 'Juice, tea, other'],
      EAT: ['Eat', 'Meal or snack'],
      'PAIN / COMFORT': ['Pain / Comfort', 'Pain, blanket, position'],
    },
    note: 'Add a note (optional)',
    sending: 'Sending…',
    helpComing: 'Help is coming',
    called: 'has been called',
    allAlerted: 'All nurses on the ward have been alerted',
    notified: 'has been notified',
    onTheWay: 'is on the way',
    retrying: 'Connection problem — still trying to reach the nurses. If you can, call out for help.',
    sent: 'Request sent',
    invalid: 'This pad link is no longer valid. Please ask a nurse.',
    stay: 'Stay in bed. Do not get up alone.',
  },
  fr: {
    tasks: {
      'EMERGENCY HELP': ['Aide', 'Urgence'],
      'BATHROOM ASSIST': ['Toilettes', 'Aidez-moi à me lever'],
      WATER: ['Eau', "Un verre d'eau"],
      DRINK: ['Boisson', 'Jus, thé, autre'],
      EAT: ['Manger', 'Repas ou collation'],
      'PAIN / COMFORT': ['Douleur / Confort', 'Douleur, couverture, position'],
    },
    note: 'Ajouter une note (facultatif)',
    sending: 'Envoi…',
    helpComing: "L'aide arrive",
    called: 'a été appelé(e)',
    allAlerted: "Tout le personnel de l'unité est alerté",
    notified: 'a été prévenu(e)',
    onTheWay: 'arrive',
    retrying: "Problème de connexion — nouvel essai en cours. Si vous le pouvez, appelez à l'aide.",
    sent: 'Demande envoyée',
    invalid: "Ce lien n'est plus valide. Demandez à une infirmière.",
    stay: 'Restez au lit. Ne vous levez pas seul(e).',
  },
  ar: {
    tasks: {
      'EMERGENCY HELP': ['النجدة', 'طوارئ'],
      'BATHROOM ASSIST': ['الحمّام', 'ساعدني على النهوض'],
      WATER: ['ماء', 'كأس ماء'],
      DRINK: ['مشروب', 'عصير، شاي'],
      EAT: ['أكل', 'وجبة أو لمجة'],
      'PAIN / COMFORT': ['ألم / راحة', 'ألم، غطاء، وضعية'],
    },
    note: 'أضف ملاحظة (اختياري)',
    sending: 'جارٍ الإرسال…',
    helpComing: 'المساعدة في الطريق',
    called: 'تم استدعاؤه',
    allAlerted: 'تم تنبيه جميع الممرضين',
    notified: 'تم إبلاغه',
    onTheWay: 'في الطريق إليك',
    retrying: 'مشكلة في الاتصال — نعيد المحاولة. إن استطعت، اطلب المساعدة بصوت عالٍ.',
    sent: 'تم إرسال الطلب',
    invalid: 'هذا الرابط لم يعد صالحًا. اطلب من الممرض.',
    stay: 'ابقَ في السرير. لا تنهض وحدك.',
  },
}

const DEFAULT_ROLES: Record<TaskId, string> = {
  'EMERGENCY HELP': 'Default Role: Immediate RED alarm — pages all nurses',
  'BATHROOM ASSIST': 'Default Role: Pages nurse for safe bed-exit & toilet help',
  'PAIN / COMFORT': 'Default Role: Pages nurse for pain relief or repositioning',
  WATER: 'Default Role: Pages nurse to bring drinking water',
  DRINK: 'Default Role: Pages nurse for juice, tea, or warm beverage',
  EAT: 'Default Role: Pages nurse for meal tray or snack',
}

const ORDER: TaskId[] = ['EMERGENCY HELP', 'BATHROOM ASSIST', 'WATER', 'DRINK', 'EAT', 'PAIN / COMFORT']

export function BedsidePad({ roomId, padKey, kiosk = false }: { roomId: string; padKey: string; kiosk?: boolean }) {
  const [state, setState] = useState<PadState | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [lang, setLang] = useState<Lang>('en')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState<TaskId | null>(null)
  const [flash, setFlash] = useState('')
  const [emergencyPending, setEmergencyPending] = useState(false)
  const [emergencyFailing, setEmergencyFailing] = useState(false)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const t = T[lang]

  useEffect(() => {
    const saved = localStorage.getItem('wardni_pad_lang') as Lang | null
    if (saved && saved in T) setLang(saved)
  }, [])

  const load = useCallback(async () => {
    try {
      const r = await api<PadState>(`/ward-api/pad/${encodeURIComponent(roomId)}?k=${encodeURIComponent(padKey)}`)
      setState(r)
      setInvalid(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setInvalid(true)
    }
  }, [roomId, padKey])

  useEffect(() => {
    void load()
    const iv = setInterval(load, 3000)
    return () => {
      clearInterval(iv)
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [load])

  const sendEmergency = useCallback(
    async (noteText: string) => {
      try {
        await api(`/ward-api/pad/${encodeURIComponent(roomId)}`, { body: { k: padKey, task: 'EMERGENCY HELP', note: noteText } })
        setEmergencyFailing(false)
        setEmergencyPending(false)
        void load()
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          setInvalid(true)
          setEmergencyPending(false)
          return
        }
        // Keep retrying until the server confirms; never silently drop an emergency.
        setEmergencyFailing(true)
        wardAudio().tone('RED')
        retryRef.current = setTimeout(() => void sendEmergency(noteText), 3000)
      }
    },
    [roomId, padKey, load],
  )

  const press = async (task: TaskId) => {
    wardAudio().unlock()
    if (task === 'EMERGENCY HELP') {
      if (emergencyPending) return
      setEmergencyPending(true)
      const n = note
      setNote('')
      void sendEmergency(n)
      return
    }
    setSending(task)
    setFlash('')
    try {
      const res = await api<{ ok: boolean; calledNurse?: string; message?: string }>(`/ward-api/pad/${encodeURIComponent(roomId)}`, { body: { k: padKey, task, note } })
      setNote('')
      setFlash(res.calledNurse ? `Nurse notified: ${res.calledNurse}` : (res.message || t.sent))
      void load()
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setInvalid(true)
      else setFlash((e as Error).message)
    } finally {
      setSending(null)
    }
  }

  const esc = state?.escalation
  const ack = state?.acknowledged
  const redActive = emergencyPending || esc?.level === 'RED'
  const rtl = lang === 'ar'

  let statusLine: { tone: 'red' | 'amber' | 'ok' | 'none'; title: string; sub?: string } = { tone: 'none', title: '' }
  if (emergencyFailing) statusLine = { tone: 'red', title: t.helpComing, sub: t.retrying }
  else if (redActive) {
    statusLine = {
      tone: 'red',
      title: t.helpComing,
      sub: esc?.status === 'AUTOMATED_EMERGENCY_ALARM' ? t.allAlerted : esc?.assignedNurseName ? `${esc.assignedNurseName} ${t.called}. ${t.stay}` : t.stay,
    }
  } else if (esc) statusLine = { tone: 'amber', title: t.sent, sub: esc.queue?.length ? `${esc.assignedNurseName} ${t.notified}` : t.allAlerted }
  else if (ack) statusLine = { tone: 'ok', title: `${ack.acknowledgedBy} ${t.onTheWay}` }

  if (invalid) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-line bg-panel p-8 text-center text-lg text-slate-200" dir={rtl ? 'rtl' : 'ltr'}>
        {t.invalid}
      </div>
    )
  }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className={cx('flex flex-col gap-4', kiosk && 'min-h-[calc(100vh-2rem)]')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">ULEBI Bedside Pad · Patient → Nurse Auto-Dispatch</div>
          <div className="font-display text-2xl font-bold text-white">{state?.room.name || '…'}</div>
        </div>
        <div className="flex rounded-xl border border-line bg-panel p-1" role="group" aria-label="Language">
          {(['en', 'fr', 'ar'] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setLang(l)
                localStorage.setItem('wardni_pad_lang', l)
              }}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', lang === l ? 'bg-white text-slate-950' : 'text-slate-300')}
            >
              {l === 'en' ? 'EN' : l === 'fr' ? 'FR' : 'عربي'}
            </button>
          ))}
        </div>
      </div>

      {statusLine.tone !== 'none' && (
        <div
          role="status"
          aria-live="assertive"
          className={cx(
            'flex items-center gap-4 rounded-3xl border-2 px-6 py-5',
            statusLine.tone === 'red' && 'border-rose-500 bg-rose-600/25',
            statusLine.tone === 'amber' && 'border-amber-400/70 bg-amber-500/15',
            statusLine.tone === 'ok' && 'border-emerald-400/70 bg-emerald-500/15',
          )}
        >
          {statusLine.tone === 'red' ? <Siren className="h-10 w-10 shrink-0 animate-alarm text-rose-200" /> : <CircleCheck className="h-10 w-10 shrink-0 text-emerald-200" />}
          <div>
            <div className="font-display text-2xl font-bold text-white">{statusLine.title}</div>
            {statusLine.sub && <div className="mt-0.5 text-base text-slate-100">{statusLine.sub}</div>}
          </div>
        </div>
      )}

      <div className="grid flex-1 grid-cols-2 gap-4 md:grid-cols-3">
        {ORDER.map((id) => {
          const Icon = ICONS[id]
          const [label, sub] = t.tasks[id]
          const emergency = id === 'EMERGENCY HELP'
          return (
            <button
              key={id}
              type="button"
              onClick={() => press(id)}
              disabled={!emergency && sending !== null}
              className={cx(
                'group flex min-h-[150px] flex-col justify-between rounded-3xl border-2 p-5 text-start transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4',
                emergency
                  ? cx('col-span-2 border-rose-400 bg-crit text-white hover:bg-rose-400 focus-visible:ring-rose-300 md:col-span-1 md:row-span-2', redActive && 'animate-alarm')
                  : 'border-line-strong bg-raised text-white hover:border-accent/60 hover:bg-accent/10 focus-visible:ring-accent/40 disabled:opacity-60',
              )}
            >
              <Icon className={cx(emergency ? 'h-14 w-14' : 'h-10 w-10 text-accent')} strokeWidth={1.8} />
              <div>
                <div className={cx('font-display font-bold', emergency ? 'text-4xl' : 'text-2xl')}>{label}</div>
                <div className={cx('mt-0.5', emergency ? 'text-lg text-rose-100' : 'text-sm text-slate-400')}>
                  {sending === id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin" /> {t.sending}
                    </span>
                  ) : (
                    sub
                  )}
                </div>
                <div className={cx('mt-2 rounded-lg border px-2 py-1 font-mono text-[10px]', emergency ? 'border-white/30 bg-black/20 text-white' : 'border-line bg-well text-slate-300')}>
                  {DEFAULT_ROLES[id]}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 300))}
          placeholder={t.note}
          className="min-h-[52px] flex-1 rounded-2xl border border-line-strong bg-well px-4 text-base text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
        />
      </div>
      {flash && statusLine.tone === 'none' && <div className="text-center text-sm text-slate-300">{flash}</div>}
    </div>
  )
}
