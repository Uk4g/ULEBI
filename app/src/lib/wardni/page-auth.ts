import { redirect } from 'next/navigation'
import { appAuth } from '@/lib/app-auth'

/** Server-side guard for workstation pages. */
export async function requirePageUser(path: string) {
  const user = await appAuth.getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(path)}`)
  return user
}
