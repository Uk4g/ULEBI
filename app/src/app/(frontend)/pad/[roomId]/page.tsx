import type { Metadata } from 'next'
import { BedsidePad } from '@/components/wardni/BedsidePad'

export const metadata: Metadata = { title: 'Bedside pad — ULEBI', robots: { index: false, follow: false } }

/** Patient-facing kiosk. Authorized by the room's secret link key, not a staff login. */
export default async function PadPage({ params, searchParams }: { params: Promise<{ roomId: string }>; searchParams: Promise<{ k?: string }> }) {
  const { roomId } = await params
  const { k } = await searchParams
  return (
    <main className="mx-auto max-w-5xl p-4">
      <BedsidePad roomId={roomId} padKey={k || ''} kiosk />
    </main>
  )
}
