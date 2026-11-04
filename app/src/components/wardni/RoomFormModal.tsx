'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { api } from './client'
import { useWard } from './WardProvider'
import { Button, ConfirmModal, ErrorText, Field, inputCls, Modal } from './ui'
import type { RoomDTO } from '@/lib/wardni/types'

export function RoomFormModal({
  open,
  onClose,
  room,
  withCamera = true,
  onSaved,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  room?: RoomDTO | null
  withCamera?: boolean
  onSaved?: (room: RoomDTO) => void
  onDeleted?: (roomId: string) => void
}) {
  const { refresh, pushToast, effectiveRole } = useWard()
  const [name, setName] = useState('')
  const [ctx, setCtx] = useState('')
  const [camUrl, setCamUrl] = useState('')
  const [camToken, setCamToken] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(room?.name || '')
    setCtx(room?.clinicalContext || '')
    setCamUrl(room?.camUrl || '')
    setCamToken('')
    setErr('')
  }, [open, room])

  const save = async () => {
    if (!name.trim()) return setErr('Room name is required.')
    const finalCtx = ctx.trim() || 'General care · Standard monitoring'
    setBusy(true)
    setErr('')
    try {
      const body: Record<string, unknown> = { name, clinicalContext: finalCtx }
      if (withCamera) {
        body.camUrl = camUrl
        if (camToken) body.camToken = camToken
      }
      const r = room
        ? await api<{ room: RoomDTO }>(`/ward-api/rooms/${encodeURIComponent(room.id)}`, { method: 'PATCH', body })
        : await api<{ room: RoomDTO }>('/ward-api/rooms', { body })
      await refresh()
      pushToast({
        tone: 'ok',
        title: room ? `Updated ${r.room.name}` : `Added ${r.room.name}`,
        detail: 'Room configuration saved and logged to the ward audit trail.',
      })
      onSaved?.(r.room)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!room) return
    setBusy(true)
    setErr('')
    try {
      await api(`/ward-api/rooms/${encodeURIComponent(room.id)}`, { method: 'DELETE' })
      await refresh()
      pushToast({
        tone: 'info',
        title: `Removed ${room.name}`,
        detail: 'Room deleted and any active nurse call chain closed.',
      })
      setConfirmDelete(false)
      onDeleted?.(room.id)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const canDelete = Boolean(room && (effectiveRole === 'admin' || effectiveRole === 'charge_nurse'))

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={room ? `Edit ${room.name}` : 'Add Patient Room'}
        description="Configure the room name, clinical risk profile, and optional IP camera stream."
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {canDelete && (
                <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete Room
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" loading={busy} onClick={save}>
                {room ? 'Save Room' : 'Add Room'}
              </Button>
            </div>
          </div>
        }
      >
        <Field label="Room Name">
          <input className={inputCls} placeholder="e.g. Room 204 · Bed A" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Clinical Risk Profile" hint="e.g. Post-op hip day 1, high fall risk · Strict NPO">
          <textarea className={inputCls} rows={3} value={ctx} onChange={(e) => setCtx(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              'Post-op hip day 1 · High fall risk',
              'Confusion / Dementia · Bed-exit risk',
              'NPO · Fall risk · Post-stroke',
              'General care · Standard monitoring',
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setCtx(preset)}
                className="rounded-md border border-line-strong bg-well px-2 py-1 font-mono text-[10px] text-slate-300 transition hover:border-white/40 hover:text-white"
              >
                + {preset}
              </button>
            ))}
          </div>
        </Field>
        {withCamera && (
          <div className="space-y-3 rounded-xl border border-line bg-raised p-3.5">
            <div className="text-xs font-semibold text-white">Room Camera Stream (Optional)</div>
            <Field label="Camera Stream URL" hint="HLS (.m3u8), MJPEG or MP4 over http(s). Relayed through the server; credentials in the URL are moved to the token.">
              <input className={`${inputCls} font-mono text-xs`} placeholder="https://camera.example/room204.m3u8" value={camUrl} onChange={(e) => setCamUrl(e.target.value)} />
            </Field>
            <Field label="Camera Token" hint={room?.hasCamToken ? 'A token is stored on the server. Leave blank to keep it.' : 'Stored server-side only; never sent to browsers.'}>
              <input className={`${inputCls} font-mono text-xs`} type="password" value={camToken} onChange={(e) => setCamToken(e.target.value)} />
            </Field>
          </div>
        )}
        <ErrorText>{err}</ErrorText>
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        loading={busy}
        title={`Delete ${room?.name || 'Room'}?`}
        description="Deleting this room will permanently remove its configuration and close any active nurse escalation chain."
        confirmLabel="Delete Room"
        variant="danger"
      />
    </>
  )
}
