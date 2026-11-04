import { AppShell } from '@/components/wardni/AppShell'
import { requirePageUser } from '@/lib/wardni/page-auth'
import { GuideView } from './GuideView'

export const metadata = { title: 'How to Use ULEBI · Step-by-Step Guide — ULEBI' }

export default async function GuidePage() {
  await requirePageUser('/guide')
  return (
    <AppShell>
      <GuideView />
    </AppShell>
  )
}
