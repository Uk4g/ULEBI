import { AppShell } from '@/components/wardni/AppShell'
import { requirePageUser } from '@/lib/wardni/page-auth'
import { Dashboard } from '../Dashboard'

export const metadata = { title: 'Ward Dashboard — ULEBI' }

/** Gated: signed-out visitors are sent to /login?next=/dashboard and come back here after signing in. */
export default async function DashboardPage() {
  await requirePageUser('/dashboard')
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  )
}
