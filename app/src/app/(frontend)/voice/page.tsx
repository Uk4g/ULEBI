import { AppShell } from '@/components/wardni/AppShell'
import { requirePageUser } from '@/lib/wardni/page-auth'
import { VoiceView } from './VoiceView'

export const metadata = { title: 'Bedside voice — ULEBI' }

export default async function VoicePage() {
  await requirePageUser('/voice')
  return (
    <AppShell>
      <VoiceView />
    </AppShell>
  )
}
