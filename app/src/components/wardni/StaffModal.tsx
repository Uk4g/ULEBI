'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Edit3, Shield, Trash2, UserCheck, UserPlus, X } from 'lucide-react'
import { api } from './client'
import { useWard } from './WardProvider'
import { Button, ConfirmModal, ErrorText, Field, inputCls, Modal, cx, timeAgo } from './ui'
import type { AccessRequestDTO, StaffRole } from '@/lib/wardni/types'

export type StaffMemberDTO = {
  id: string
  name: string
  email: string
  role: StaffRole
  tokens?: number
  spendUsd?: number
  requests?: number
}

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Admin',
  charge_nurse: 'Charge Nurse',
  nurse: 'Nurse',
}

export function StaffModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snap, refresh, pushToast } = useWard()
  const [staff, setStaff] = useState<StaffMemberDTO[]>([])
  const [requests, setRequests] = useState<AccessRequestDTO[]>([])
  const [form, setForm] = useState<{ name: string; email: string; password: string; role: StaffRole }>({
    name: '',
    email: '',
    password: '',
    role: 'nurse',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ name: string; role: StaffRole }>({ name: '', role: 'nurse' })
  const [confirmDelete, setConfirmDelete] = useState<StaffMemberDTO | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api<{ staff: StaffMemberDTO[]; accessRequests?: AccessRequestDTO[] }>('/ward-api/staff')
      setStaff(r.staff || [])
      setRequests(r.accessRequests || [])
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setErr('')
      void load()
    }
  }, [open, load])

  const create = async () => {
    if (!form.name.trim() || !form.email.trim()) return setErr('Full name and email are required.')
    if (form.password.length < 8) return setErr('Temporary password must be at least 8 characters.')
    setErr('')
    setBusy(true)
    try {
      await api('/ward-api/staff', { body: form })
      setForm({ name: '', email: '', password: '', role: 'nurse' })
      await load()
      await refresh()
      pushToast({ tone: 'ok', title: 'Staff account created', detail: `Added ${form.name} (${ROLE_LABELS[form.role]}).` })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async (id: string) => {
    setErr('')
    setBusy(true)
    try {
      await api(`/ward-api/staff/${encodeURIComponent(id)}`, { method: 'PATCH', body: editDraft })
      setEditingId(null)
      await load()
      await refresh()
      pushToast({ tone: 'ok', title: 'Account updated', detail: `Updated ${editDraft.name} (${ROLE_LABELS[editDraft.role]}).` })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirmDelete) return
    setErr('')
    setBusy(true)
    try {
      await api(`/ward-api/staff/${encodeURIComponent(confirmDelete.id)}`, { method: 'DELETE' })
      setConfirmDelete(null)
      await load()
      await refresh()
      pushToast({ tone: 'info', title: 'Account removed', detail: `Removed ${confirmDelete.name} from workstation accounts.` })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const approveRequest = async (req: AccessRequestDTO) => {
    setErr('')
    setBusy(true)
    try {
      await api('/ward-api/staff', {
        body: {
          name: req.name,
          email: req.email,
          password: 'UlebiTemp#2026',
          role: req.requestedRole,
          approveRequestId: req.id,
        },
      })
      await load()
      await refresh()
      pushToast({
        tone: 'ok',
        title: `Approved ${req.name}`,
        detail: `Account created as ${ROLE_LABELS[req.requestedRole]} (temp password: UlebiTemp#2026).`,
      })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const dismissRequest = async (id: string) => {
    try {
      await api('/ward-api/staff', { body: { dismissRequestId: id } })
      await load()
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        wide
        title="Workstation Staff Accounts (Admin Only)"
        description="Manage workstation accounts, assign roles (Admin, Charge Nurse, Nurse), approve access requests, and review per-account token & spend telemetry."
        footer={
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          {requests.length > 0 && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-200">
                  Pending Access &amp; Password Reset Requests ({requests.length})
                </span>
              </div>
              <div className="space-y-2">
                {requests.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs">
                    <div>
                      <span className="font-semibold text-white">{r.name}</span>{' '}
                      <span className="font-mono text-[11px] text-slate-400">({r.email})</span>
                      <span className="ml-2 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-accent">
                        {r.type === 'reset' ? 'PASSWORD RESET' : `REQUESTED: ${ROLE_LABELS[r.requestedRole].toUpperCase()}`}
                      </span>
                      <span className="ml-2 font-mono text-[10px] text-slate-500">{timeAgo(r.requestedAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {r.type === 'signup' && (
                        <Button size="sm" variant="primary" loading={busy} onClick={() => void approveRequest(r)}>
                          <UserCheck className="h-3.5 w-3.5" /> Approve
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => void dismissRequest(r.id)}>
                        <X className="h-3.5 w-3.5" /> Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-line bg-well">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-3.5 py-2.5">Staff Member</th>
                  <th className="px-3.5 py-2.5">Role</th>
                  <th className="px-3.5 py-2.5 text-right">AI Calls</th>
                  <th className="px-3.5 py-2.5 text-right">Tokens</th>
                  <th className="px-3.5 py-2.5 text-right">Spend</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {staff.map((s) => {
                  const isEditing = editingId === s.id
                  return (
                    <tr key={s.id} className="hover:bg-white/[0.02]">
                      <td className="px-3.5 py-2.5">
                        {isEditing ? (
                          <input
                            className={cx(inputCls, 'py-1 text-xs')}
                            value={editDraft.name}
                            onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                          />
                        ) : (
                          <div>
                            <div className="font-semibold text-white">{s.name}</div>
                            <div className="font-mono text-[10px] text-slate-500">{s.email}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {isEditing ? (
                          <select
                            aria-label="Edit staff role"
                            className={cx(inputCls, 'py-1 text-xs')}
                            value={editDraft.role}
                            onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value as StaffRole })}
                          >
                            <option value="admin">Admin</option>
                            <option value="charge_nurse">Charge Nurse</option>
                            <option value="nurse">Nurse</option>
                          </select>
                        ) : (
                          <span
                            className={cx(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold',
                              s.role === 'admin'
                                ? 'border-accent/40 bg-accent/10 text-accent'
                                : s.role === 'charge_nurse'
                                  ? 'border-sky-400/40 bg-sky-500/10 text-sky-200'
                                  : 'border-line-strong bg-white/5 text-slate-300',
                            )}
                          >
                            <Shield className="h-2.5 w-2.5" /> {ROLE_LABELS[s.role] || s.role}
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono text-slate-300">{(s.requests ?? 0).toLocaleString()}</td>
                      <td className="px-3.5 py-2.5 text-right font-mono text-slate-300">{(s.tokens ?? 0).toLocaleString()}</td>
                      <td className="px-3.5 py-2.5 text-right font-mono font-semibold text-emerald-300">${(s.spendUsd ?? 0).toFixed(4)}</td>
                      <td className="px-3.5 py-2.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button size="sm" variant="primary" loading={busy} onClick={() => void saveEdit(s.id)} aria-label="Save account changes">
                                <Check className="h-3.5 w-3.5" /> Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancel edit">
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Edit ${s.name}`}
                                onClick={() => {
                                  setEditingId(s.id)
                                  setEditDraft({ name: s.name, role: s.role })
                                }}
                              >
                                <Edit3 className="h-3.5 w-3.5" /> Edit
                              </Button>
                              {s.id !== snap?.me.id && (
                                <Button size="sm" variant="danger" aria-label={`Remove ${s.name}`} onClick={() => setConfirmDelete(s)}>
                                  <Trash2 className="h-3.5 w-3.5" /> Remove
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-raised p-4 sm:grid-cols-2">
            <div className="sm:col-span-2 font-mono text-[10px] font-bold uppercase tracking-wider text-accent">
              + Add Workstation Staff Account
            </div>
            <Field label="Full Name">
              <input className={inputCls} placeholder="e.g. Sara Mansouri, RN" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email / Staff ID">
              <input className={inputCls} type="email" placeholder="name@ulebi.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Temporary Password" hint="Minimum 8 characters.">
              <input className={inputCls} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Role">
              <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}>
                <option value="nurse">Nurse (View, Acknowledge, Triage)</option>
                <option value="charge_nurse">Charge Nurse (+ Roster Order, Escalate, Synthesize)</option>
                <option value="admin">Admin (+ Staff Accounts, Budget Limit, API Keys)</option>
              </select>
            </Field>
            <div className="sm:col-span-2 flex justify-end">
              <Button variant="primary" loading={busy} onClick={create}>
                <UserPlus className="h-3.5 w-3.5" /> Add Account
              </Button>
            </div>
          </div>
          <ErrorText>{err}</ErrorText>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => void remove()}
        loading={busy}
        title={`Remove ${confirmDelete?.name || 'Account'}?`}
        description={`Are you sure you want to remove ${confirmDelete?.name} (${confirmDelete?.email}) from ULEBI workstation accounts?`}
        confirmLabel="Remove Account"
        variant="danger"
      />
    </>
  )
}
