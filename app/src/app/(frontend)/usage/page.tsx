import { AppShell } from '@/components/wardni/AppShell'
import { requirePageUser } from '@/lib/wardni/page-auth'
import { UsageView } from './UsageView'

export const metadata = { title: 'Usage & Costs — ULEBI' }

export default async function UsagePage() {
  await requirePageUser('/usage')
  return (
    <AppShell>
      <UsageView />
    </AppShell>
  )
}
