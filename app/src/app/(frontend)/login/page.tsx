import { redirect } from 'next/navigation'
import { appAuth } from '@/lib/app-auth'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — ULEBI' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
  if (await appAuth.getCurrentUser()) redirect(safeNext)
  return <LoginForm next={safeNext} />
}
