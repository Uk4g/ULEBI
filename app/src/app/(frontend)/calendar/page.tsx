import { AppShell } from '@/components/wardni/AppShell'
import { requirePageUser } from '@/lib/wardni/page-auth'
import { CalendarView } from './CalendarView'

export const metadata = { title: 'Activity Calendar & Timeline — ULEBI' }

export default async function CalendarPage() {
  await requirePageUser('/calendar')
  return (
    <AppShell>
      <CalendarView />
    </AppShell>
  )
}
