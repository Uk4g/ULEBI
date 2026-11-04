'use client'

import { useState } from 'react'
import { Shield, UserPlus, Users } from 'lucide-react'
import { useWard } from '@/components/wardni/WardProvider'
import { StaffModal } from '@/components/wardni/StaffModal'
import { Button, Panel, clockTime } from '@/components/wardni/ui'

export function StaffView() {
  const { snap, effectiveRole } = useWard()
  const [staffModalOpen, setStaffModalOpen] = useState(false)
  const isAdmin = effectiveRole === 'admin'

  if (!snap) return <div className="h-96 animate-pulse rounded-[12px] border border-line bg-panel" />

  return (
    <div className="space-y-5">
      <Panel
        eyebrow="Workstation Access & Shift Roster"
        title="Staff Accounts, Role Permissions & Audit Trail"
        actions={
          isAdmin && (
            <Button size="sm" variant="primary" onClick={() => setStaffModalOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" /> Manage Workstation Accounts
            </Button>
          )
        }
        bodyClassName="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-line bg-well p-4">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-white">
              <Shield className="h-4 w-4 text-accent" /> Admin Role
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Full control: manage Workstation Staff Accounts, approve sign-up requests, edit Budget Limits &amp; Model Pricing, and configure Meta API keys.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-well p-4">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-white">
              <Users className="h-4 w-4 text-sky-400" /> Charge Nurse Role
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Shift coordination: reorder the Shift Roster, add/remove roster nurses, change Step Timeout, skip to Next nurse, and run Shift Synthesis.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-well p-4">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-white">
              <Users className="h-4 w-4 text-emerald-400" /> Nurse Role
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Bedside care: acknowledge active nurse calls, run Vision/Voice/Pad checks, mark rooms Stable, and query the AI Assistant.
            </p>
          </div>
        </div>

        {/* Recent Audit Trail */}
        <div className="overflow-x-auto rounded-xl border border-line bg-well">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-3.5 py-2.5">Timestamp (1s)</th>
                <th className="px-3.5 py-2.5">Actor</th>
                <th className="px-3.5 py-2.5">Role</th>
                <th className="px-3.5 py-2.5">Action</th>
                <th className="px-3.5 py-2.5">Target</th>
                <th className="px-3.5 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(snap.auditLogs || []).map((a) => (
                <tr key={a.id}>
                  <td className="px-3.5 py-2 font-mono text-[11px] text-slate-400">{clockTime(a.at)}</td>
                  <td className="px-3.5 py-2 font-semibold text-white">{a.actorName}</td>
                  <td className="px-3.5 py-2 font-mono text-[10px] uppercase text-accent">{a.actorRole}</td>
                  <td className="px-3.5 py-2 font-mono text-[11px] text-slate-200">{a.action}</td>
                  <td className="px-3.5 py-2 font-semibold text-white">{a.target}</td>
                  <td className="px-3.5 py-2 text-slate-300">{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <StaffModal open={staffModalOpen} onClose={() => setStaffModalOpen(false)} />
    </div>
  )
}
