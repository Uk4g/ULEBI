import { AppShell } from '@/components/wardni/AppShell'
import { requirePageUser } from '@/lib/wardni/page-auth'
import { StaffView } from './StaffView'

export const metadata = { title: 'Staff & Shift Roster — ULEBI' }

export default async function StaffPage() {
  await requirePageUser('/staff')
  return (
    <AppShell>
      <StaffView />
    </AppShell>
  )
}
