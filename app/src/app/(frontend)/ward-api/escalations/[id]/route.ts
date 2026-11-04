import { getPayloadClient } from '@/lib/payload'
import { acknowledgeEscalation, skipToNextNurse } from '@/lib/wardni/engine'
import { fail, handle, json, readJson, requireStaff } from '@/lib/wardni/http'

export const POST = handle(async (req, ctx) => {
  const user = await requireStaff(req)
  const { id } = await ctx.params
  const body = await readJson(req, 4 * 1024)
  const payload = await getPayloadClient()
  if (body.action === 'ack') {
    await acknowledgeEscalation(payload, id, user.name, { id: user.id, role: user.role })
    return json({ ok: true })
  }
  if (body.action === 'next') {
    await skipToNextNurse(payload, id, user.name, { id: user.id, role: user.role })
    return json({ ok: true })
  }
  return fail(400, 'Unknown action.')
})
