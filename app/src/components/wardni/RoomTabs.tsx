'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { roomLevel, type RoomDTO, type Source } from '@/lib/wardni/types'
import { Button, LEVEL_STYLES, cx } from './ui'

/** Remembers the selected room per module; falls back to the first room. */
export function useActiveRoom(rooms: RoomDTO[] | undefined, storageKey: string) {
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => {
    setActiveId(localStorage.getItem(storageKey))
  }, [storageKey])
  const list = rooms || []
  const room = list.find((r) => r.id === activeId) || list[0] || null
  const select = (id: string) => {
    setActiveId(id)
    localStorage.setItem(storageKey, id)
  }
  return { room, select }
}

export function RoomTabs({ rooms, activeId, onSelect, onAdd, source }: { rooms: RoomDTO[]; activeId?: string; onSelect: (id: string) => void; onAdd: () => void; source?: Source }) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-line">
      <div className="flex min-w-0 items-end gap-1 overflow-x-auto">
        {rooms.length === 0 && <div className="mb-2 rounded-lg border border-dashed border-line-strong px-3 py-1.5 font-mono text-[11px] text-slate-500">0 rooms</div>}
        {rooms.map((r) => {
          const lvl = source ? r.latestBySource?.[source]?.level || 'STANDBY' : roomLevel(r)
          const active = r.id === activeId
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              className={cx(
                'flex shrink-0 items-center gap-2 rounded-t-xl border border-b-0 px-3.5 py-2 text-xs font-semibold transition',
                active ? 'border-accent/40 bg-panel text-white' : 'border-line bg-panel/50 text-slate-400 hover:text-white',
              )}
            >
              <span className={cx('h-2 w-2 rounded-full', LEVEL_STYLES[lvl].dot, lvl === 'RED' && 'animate-alarm')} />
              {r.name}
            </button>
          )
        })}
      </div>
      <Button size="sm" variant="primary" className="mb-2 shrink-0" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" /> Add room
      </Button>
    </div>
  )
}
