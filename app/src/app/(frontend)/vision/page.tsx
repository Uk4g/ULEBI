import { AppShell } from '@/components/wardni/AppShell'
import { requirePageUser } from '@/lib/wardni/page-auth'
import { VisionView } from './VisionView'

export const metadata = { title: 'Vision — ULEBI' }

export default async function VisionPage() {
  await requirePageUser('/vision')
  return (
    <AppShell>
      <VisionView />
    </AppShell>
  )
}
