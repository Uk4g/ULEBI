import { AppShell } from '@/components/wardni/AppShell'
import { requirePageUser } from '@/lib/wardni/page-auth'
import { TasksView } from './TasksView'

export const metadata = { title: 'Bedside pads — ULEBI' }

export default async function TasksPage() {
  await requirePageUser('/tasks')
  return (
    <AppShell>
      <TasksView />
    </AppShell>
  )
}
