import { buildSnapshot } from '@/lib/wardni/engine'
import { handle, json, requireStaff } from '@/lib/wardni/http'

export const dynamic = 'force-dynamic'

/** Polled by every workstation (~2s). Also drives deadline-based escalation advancement. */
export const GET = handle(async (req) => {
  const user = await requireStaff(req)
  return json(await buildSnapshot(user))
})
