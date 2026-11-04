'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Bell,
  BookOpen,
  BellOff,
  BellRing,
  Calendar,
  ChevronDown,
  Clock,
  DollarSign,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Mic,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Send,
  Settings,
  Siren,
  Sparkles,
  Sun,
  Tablet,
  Trash2,
  UserPlus,
  Users,
  Video,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react'
import { api } from './client'
import { wardAudio } from './audio'
import { useAudioState, useWard, WardProvider } from './WardProvider'
import { Button, ConfirmModal, cx, Modal, clockTime, inputCls, LevelBadge, EngineTag } from './ui'
import { StaffModal } from './StaffModal'
import type { ApiStatus, StaffRole } from '@/lib/wardni/types'

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Ward Dashboard', short: 'Work', group: 'Triage & Clinical', icon: LayoutDashboard },
  { href: '/vision', label: 'Vision Tracking', short: 'Vision', group: 'Triage & Clinical', icon: Video },
  { href: '/voice', label: 'Bedside Voice', short: 'Voice', group: 'Triage & Clinical', icon: Mic },
  { href: '/tasks', label: 'Bedside Pads', short: 'Pads', group: 'Triage & Clinical', icon: Tablet },
  { href: '/guide', label: 'How to Use', short: 'Guide', group: 'Triage & Clinical', icon: BookOpen },
  { href: '/usage', label: 'Usage & Costs', short: 'Usage', group: 'Operations', icon: DollarSign },
  { href: '/calendar', label: 'Activity Calendar', short: 'Calendar', group: 'Operations', icon: Calendar },
  { href: '/staff', label: 'Staff', short: 'Staff', group: 'Operations', icon: Users },
] as const

const ROLE_DISPLAY: Record<StaffRole, string> = {
  admin: 'Admin',
  charge_nurse: 'Charge Nurse',
  nurse: 'Nurse',
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <WardProvider>
      <Shell>{children}</Shell>
    </WardProvider>
  )
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-raised text-white', className)}>
      <svg viewBox="0 0 100 100" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path fillRule="evenodd" d="M75.0,78.5L74.6,78.9L74.4,78.9L74.0,79.2L73.8,79.2L73.4,79.6L73.2,79.6L72.9,80.0L72.7,80.0L72.5,80.2L72.3,80.2L71.9,80.6L71.7,80.6L71.5,80.8L71.3,80.8L71.1,81.0L70.9,81.0L70.5,81.4L70.3,81.4L70.1,81.6L70.0,81.6L69.8,81.8L69.6,81.8L69.2,82.2L69.0,82.2L68.8,82.3L68.6,82.3L68.4,82.5L68.2,82.5L68.0,82.7L67.8,82.7L67.6,82.9L67.4,82.9L67.0,83.3L66.9,83.3L66.7,83.5L66.5,83.5L66.3,83.7L66.1,83.7L65.9,83.9L65.7,83.9L65.5,84.1L65.3,84.1L65.1,84.3L64.9,84.3L64.7,84.5L64.5,84.5L64.3,84.7L64.1,84.7L63.9,84.9L63.8,84.9L63.6,85.1L63.4,85.1L63.0,85.4L62.8,85.4L62.6,85.6L62.4,85.6L62.2,85.8L62.0,85.8L61.8,86.0L61.6,86.0L61.0,86.4L60.7,86.4L60.5,86.6L60.7,86.8L61.0,86.8L61.2,87.0L61.8,87.0L62.0,86.8L62.6,86.8L62.8,86.6L63.0,86.6L63.2,86.4L63.6,86.4L63.8,86.2L63.9,86.2L64.1,86.0L64.3,86.0L64.5,85.8L64.7,85.8L64.9,85.6L65.1,85.6L65.7,85.3L66.1,85.3L66.3,85.1L66.5,85.1L66.7,84.9L66.9,84.9L67.2,84.5L67.4,84.5L67.6,84.3L67.8,84.3L68.2,83.9L68.4,83.9L68.8,83.5L69.0,83.5L69.2,83.3L69.4,83.3L69.8,82.9L70.0,82.9L70.3,82.5L70.5,82.5L71.1,82.0L71.3,82.0L72.1,81.2L72.3,81.2Z M16.3,71.1L17.5,73.1L21.5,77.5L21.7,77.5L22.9,78.7L23.1,78.7L24.8,80.2L26.0,80.8L27.5,82.0L33.0,84.7L33.3,84.7L33.5,84.9L33.9,84.9L34.1,85.1L34.5,85.1L35.9,85.6L36.4,85.6L37.2,86.0L37.8,86.0L38.0,86.2L38.8,86.2L39.0,86.4L39.7,86.4L39.9,86.6L40.7,86.6L40.9,86.8L41.3,86.8L39.7,86.0L39.3,86.0L38.6,85.4L35.7,84.1L35.3,83.7L30.4,81.4L30.0,81.0L27.9,80.0L27.5,79.6L26.2,79.1L25.8,78.7L25.2,78.5L24.8,78.1L23.3,77.3L22.9,76.9L20.9,75.8L19.6,74.6L19.4,74.6L17.1,72.3L17.1,72.1L16.3,71.3Z M88.4,60.7L88.2,60.8L88.0,61.4L87.6,61.8L87.0,63.2L86.6,63.6L86.2,64.5L85.8,64.9L85.6,65.5L85.3,65.9L85.1,66.5L84.7,66.9L84.7,67.0L83.5,68.6L83.5,68.8L83.3,69.0L83.3,69.2L83.1,69.4L83.1,69.6L82.9,69.8L82.9,70.0L82.7,70.1L82.7,70.3L82.5,70.5L82.5,70.7L82.3,70.9L82.3,71.1L82.2,71.3L81.4,73.1L81.0,73.4L81.0,73.6L80.8,73.8L80.4,74.8L80.0,75.2L79.6,76.2L79.2,76.5L79.2,76.7L78.9,77.1L78.9,77.3L78.5,77.7L78.5,77.9L78.1,78.3L78.1,78.5L77.5,79.1L77.5,79.2L76.7,80.0L76.7,80.2L76.5,80.4L77.3,79.6L77.3,79.4L79.6,77.1L79.6,76.9L80.8,75.8L80.8,75.6L81.6,74.8L81.6,74.6L82.2,74.0L82.2,73.8L82.9,73.1L82.9,72.9L83.5,72.3L83.5,72.1L84.7,70.5L84.7,70.3L85.8,68.2L85.8,67.8L86.2,67.2L86.2,66.9L86.6,66.3L86.6,65.9L86.8,65.7L86.8,65.5L87.0,65.3L87.0,64.9L87.4,64.3L87.4,63.8L87.6,63.6L87.6,63.2L87.8,63.0L87.8,62.4L88.0,62.2L88.0,61.6L88.2,61.4L88.2,60.8Z M70.1,60.1L69.8,60.5L68.8,62.6L68.4,63.0L67.8,64.1L65.7,66.9L64.3,68.2L64.3,68.4L60.7,71.7L57.9,73.6L53.9,75.6L53.5,75.6L52.9,76.0L52.5,76.0L50.0,76.9L48.5,77.1L47.5,77.5L46.5,77.5L46.3,77.7L43.2,77.7L43.2,77.9L48.3,80.4L48.5,80.2L50.0,79.8L50.6,79.4L51.5,79.2L52.1,78.9L52.5,78.9L57.7,76.2L59.5,75.0L62.6,72.3L62.8,72.3L65.7,69.2L67.8,65.9L69.0,63.6L69.0,63.2Z M11.6,57.4L11.5,57.6L11.5,57.7L11.3,57.9L11.3,58.9L11.5,59.1L11.5,59.5L11.6,59.7L11.6,59.9L11.8,60.1L11.8,60.3L12.0,60.5L12.0,60.8L12.2,61.0L12.2,61.2L12.4,61.4L12.4,61.6L12.6,61.8L12.6,62.2L12.8,62.4L12.8,62.6L13.0,62.8L13.0,63.0L13.2,63.2L13.2,63.4L13.4,63.6L13.4,63.8L13.6,63.9L13.6,64.1L14.0,64.5L14.0,64.7L14.2,64.9L14.2,65.1L14.6,65.5L14.6,65.7L14.9,66.1L14.9,66.3L15.3,66.7L15.3,66.9L15.7,67.2L15.7,67.4L16.1,67.8L16.1,68.0L16.7,68.6L16.7,68.8L17.3,69.4L17.3,69.6L17.8,70.1L17.8,70.3L18.0,70.5L18.0,70.3L17.7,70.0L17.7,69.8L17.5,69.6L17.5,69.4L17.3,69.2L17.3,69.0L17.1,68.8L17.1,68.6L16.9,68.4L16.9,68.2L16.7,68.0L16.7,67.8L16.5,67.6L16.5,67.4L16.3,67.2L16.3,67.0L16.1,66.9L16.1,66.7L15.9,66.5L15.9,66.3L15.7,66.1L15.7,65.9L15.5,65.7L15.5,65.5L15.3,65.3L15.3,65.1L14.9,64.7L14.9,64.5L14.7,64.3L14.7,64.1L14.6,63.9L14.6,63.8L14.4,63.6L14.4,63.4L14.2,63.2L14.2,62.8L14.0,62.6L14.0,62.4L13.8,62.2L13.8,62.0L13.6,61.8L13.6,61.6L13.4,61.4L13.4,61.0L13.2,60.8L13.2,60.7L13.0,60.5L13.0,60.3L12.8,60.1L12.8,59.9L12.6,59.7L12.6,59.3L12.4,59.1L12.4,58.9L12.2,58.7L12.2,58.3L12.0,58.1L12.0,57.9L11.8,57.7L11.8,57.6Z M13.6,54.1L23.1,74.2L61.6,94.9L74.8,89.3L85.4,80.6L91.3,72.7L93.8,67.4L96.1,59.5L95.9,57.4L93.4,52.1L91.5,55.6L92.2,59.3L90.5,65.3L83.9,76.7L78.9,81.8L72.3,86.4L62.0,90.9L26.2,71.7L22.1,64.9L22.3,64.3L30.4,70.5L39.0,73.4L50.0,73.4L58.3,70.3L50.2,72.3L42.3,72.1L35.7,70.3L28.1,66.1L23.3,61.6L19.0,56.2L16.1,50.0Z M21.7,40.3L20.9,41.3L19.2,44.6L19.2,45.7L19.4,45.9L19.6,47.5L19.8,47.7L20.9,51.5L22.7,55.0L25.6,59.5L26.8,60.7L26.8,60.8L29.9,63.8L32.2,65.5L34.9,66.9L35.3,67.2L37.8,68.4L34.7,66.5L33.0,64.9L32.8,64.9L28.1,60.1L25.6,56.4L25.0,55.2L25.0,54.8L24.0,53.1L24.0,52.7L23.5,51.7L23.5,51.4L23.1,50.8L22.9,49.4L22.7,49.2L22.7,48.5L22.3,47.5L22.3,46.7L22.1,46.5L22.1,45.7L21.9,45.5L21.9,44.6L21.7,44.4L21.7,42.8L21.5,42.6L21.5,40.7Z M61.6,31.2L65.9,33.9L68.0,36.1L68.2,36.1L71.1,39.2L74.2,43.6L76.3,48.3L76.7,49.4L76.7,50.0L76.9,50.2L76.9,50.8L77.1,51.0L77.1,51.5L77.3,51.7L77.3,52.3L77.5,52.5L77.5,53.5L77.7,53.7L77.9,55.6L78.1,55.8L78.1,59.9L78.3,60.1L79.6,57.9L80.8,55.4L80.6,55.2L80.2,52.5L78.9,48.5L76.5,43.8L74.0,40.1L71.1,37.0L67.6,34.3L67.0,34.1L65.7,33.1L63.8,32.2L63.4,32.2Z M82.3,30.2L82.3,30.4L82.5,30.6L82.5,30.8L82.7,31.0L82.7,31.2L82.9,31.4L82.9,31.6L83.1,31.8L83.1,32.0L83.3,32.2L83.3,32.4L83.5,32.6L83.5,32.8L83.7,33.0L83.7,33.1L83.9,33.3L83.9,33.5L84.1,33.7L84.1,34.1L84.3,34.3L84.3,34.5L84.5,34.7L84.5,34.9L84.7,35.1L84.7,35.3L84.9,35.5L84.9,35.7L85.1,35.9L85.1,36.1L85.3,36.2L85.3,36.4L85.4,36.6L85.4,36.8L85.6,37.0L85.6,37.4L85.8,37.6L85.8,37.8L86.0,38.0L86.0,38.2L86.2,38.4L86.2,38.8L86.4,39.0L86.4,39.2L86.6,39.3L86.6,39.5L86.8,39.7L86.8,39.9L87.0,40.1L87.0,40.3L87.2,40.5L87.2,40.9L87.4,41.1L87.4,41.3L87.6,41.5L87.6,41.7L87.8,41.9L87.8,42.1L88.0,42.3L88.0,42.6L88.2,42.8L88.4,42.6L88.4,42.4L88.5,42.3L88.5,42.1L88.7,41.9L88.7,41.7L88.5,41.5L88.5,40.9L88.4,40.7L88.4,40.5L88.2,40.3L88.2,39.9L88.0,39.7L88.0,39.5L87.8,39.3L87.8,39.2L87.6,39.0L87.6,38.8L87.4,38.6L87.4,38.2L87.2,38.0L87.2,37.8L87.0,37.6L87.0,37.4L86.8,37.2L86.8,37.0L86.6,36.8L86.6,36.6L86.4,36.4L86.4,36.2L86.2,36.1L86.2,35.9L86.0,35.7L86.0,35.5L85.8,35.3L85.8,35.1L85.4,34.7L85.4,34.5L85.1,34.1L85.1,33.9L84.7,33.5L84.7,33.3L84.3,33.0L84.3,32.8L83.9,32.4L83.9,32.2L83.5,31.8L83.5,31.6L82.7,30.8L82.7,30.6Z M23.1,20.4L19.8,23.7L19.8,23.8L18.2,25.6L18.2,25.8L17.7,26.4L17.7,26.6L17.1,27.1L17.1,27.3L16.5,27.9L16.5,28.1L15.7,29.1L15.7,29.3L15.5,29.5L15.5,29.7L15.1,30.0L15.1,30.2L14.9,30.4L14.9,30.6L14.7,30.8L14.7,31.0L14.6,31.2L14.6,31.4L14.4,31.6L14.4,31.8L13.4,33.5L13.4,33.9L13.0,34.5L13.0,34.9L12.8,35.1L12.8,35.5L12.6,35.7L12.6,36.1L12.4,36.2L12.4,36.6L12.2,36.8L12.2,37.4L12.0,37.6L12.0,38.0L11.8,38.2L11.8,38.8L11.6,39.0L11.6,39.3L11.8,39.2L11.8,39.0L12.0,38.8L12.0,38.6L12.2,38.4L12.6,37.4L13.0,37.0L13.2,36.4L14.0,35.5L14.2,34.9L14.6,34.5L14.7,33.9L15.1,33.5L15.1,33.3L15.5,33.0L15.9,32.0L16.3,31.6L16.3,31.4L16.5,31.2L16.5,31.0L16.7,30.8L17.1,29.9L17.5,29.5L17.5,29.3L17.7,29.1L17.7,28.9L17.8,28.7L18.2,27.7L18.6,27.3L18.6,27.1L18.8,26.9L18.8,26.8L19.0,26.6L19.0,26.4L19.2,26.2L19.2,26.0L19.4,25.8L19.4,25.6L19.6,25.4L20.0,24.4L20.4,24.0L20.4,23.8L20.8,23.5L20.8,23.3L21.3,22.7L21.3,22.5L22.1,21.7L22.1,21.5Z M57.0,22.1L51.9,19.8L51.2,20.2L49.8,20.4L49.6,20.6L48.1,20.9L47.5,21.3L47.1,21.3L43.8,22.9L43.4,23.3L41.9,24.0L38.2,26.8L35.5,29.5L35.5,29.7L33.9,31.4L33.0,32.8L31.0,36.2L31.0,36.6L30.4,37.6L29.9,39.7L30.8,37.6L32.0,36.1L32.2,35.5L34.3,32.8L37.2,29.9L41.7,26.6L45.4,24.6L45.7,24.6L46.3,24.2L46.7,24.2L48.1,23.7L48.6,23.7L49.4,23.3L50.0,23.3L50.2,23.1L50.8,23.1L51.7,22.7L53.5,22.5L53.7,22.3Z M42.6,14.9L22.3,26.2L3.7,58.1L5.3,64.9L8.4,72.1L16.7,82.9L26.0,89.9L38.8,94.9L48.3,90.7L43.8,88.7L38.8,91.1L27.9,86.6L21.9,82.5L16.7,77.5L13.0,72.5L10.1,66.9L7.6,59.1L24.8,29.5L30.6,26.0L26.9,33.0L25.2,39.2L25.2,47.1L27.3,53.9L26.4,50.0L26.4,44.6L28.7,34.7L31.4,29.7L34.9,25.4L39.3,21.3L46.3,17.1Z M59.9,13.8L61.0,14.4L61.4,14.7L65.9,16.9L66.3,17.3L67.2,17.7L67.6,18.0L70.5,19.4L70.9,19.8L71.9,20.2L72.3,20.6L73.6,21.1L74.0,21.5L75.0,21.9L75.4,22.3L76.9,23.1L77.3,23.5L78.7,24.2L80.0,25.4L80.2,25.4L84.5,29.5L82.9,27.7L82.9,27.5L81.2,25.8L81.2,25.6L77.9,22.3L77.7,22.3L76.9,21.5L76.7,21.5L74.6,19.8L73.8,19.4L73.2,18.8L72.7,18.6L71.3,17.7L66.9,15.5L66.5,15.5L65.3,14.9L64.1,14.7L63.4,14.4L62.6,14.4L62.4,14.2L61.6,14.2L61.4,14.0Z M39.5,13.4L38.6,13.4L38.4,13.6L37.8,13.6L37.6,13.8L37.2,13.8L37.0,14.0L36.6,14.0L36.4,14.2L36.1,14.2L35.9,14.4L35.7,14.4L35.5,14.6L35.1,14.6L34.9,14.7L34.7,14.7L34.5,14.9L34.3,14.9L34.1,15.1L33.9,15.1L33.3,15.5L33.0,15.5L32.6,15.9L32.4,15.9L32.2,16.1L32.0,16.1L31.8,16.3L31.6,16.3L31.2,16.7L31.0,16.7L30.8,16.9L30.6,16.9L30.2,17.3L30.0,17.3L29.7,17.7L29.5,17.7L28.7,18.4L28.5,18.4L27.9,19.0L27.7,19.0L26.8,20.0L26.6,20.0L24.4,22.1L24.6,21.9L24.8,21.9L25.2,21.5L25.4,21.5L25.6,21.3L25.8,21.3L26.2,20.9L26.4,20.9L26.6,20.8L26.8,20.8L27.1,20.4L27.3,20.4L27.5,20.2L27.7,20.2L28.1,19.8L28.3,19.8L28.5,19.6L28.7,19.6L29.1,19.2L29.3,19.2L29.7,18.8L29.9,18.8L30.0,18.6L30.2,18.6L30.4,18.4L30.6,18.4L30.8,18.2L31.0,18.2L31.4,17.8L31.6,17.8L31.8,17.7L32.0,17.7L32.2,17.5L32.4,17.5L32.6,17.3L32.8,17.3L33.0,17.1L33.1,17.1L33.3,16.9L33.5,16.9L33.9,16.5L34.1,16.5L34.3,16.3L34.5,16.3L34.7,16.1L34.9,16.1L35.1,15.9L35.3,15.9L35.5,15.7L35.7,15.7L35.9,15.5L36.1,15.5L36.2,15.3L36.4,15.3L36.8,14.9L37.0,14.9L37.2,14.7L37.4,14.7L37.6,14.6L37.8,14.6L38.2,14.2L38.4,14.2L38.6,14.0L38.8,14.0L39.2,13.6L39.3,13.6Z M61.4,5.1L52.1,9.5L56.0,11.6L60.8,9.1L70.3,12.8L77.5,17.5L83.1,22.9L87.0,28.1L90.5,35.1L92.2,41.5L75.4,70.5L69.0,74.6L68.6,74.2L72.7,67.8L74.6,60.5L74.6,53.5L72.7,46.7L73.4,56.2L71.5,64.7L66.3,73.4L60.5,78.9L53.5,83.1L57.0,85.3L77.5,74.0L96.3,41.9L94.2,34.1L91.6,28.5L84.5,18.6L74.2,10.5Z M3.7,41.1L6.8,48.1L8.7,44.6L7.6,41.5L8.7,36.8L12.0,29.5L15.7,24.0L25.8,14.9L32.6,11.3L38.4,9.3L74.2,28.9L77.7,35.3L70.1,29.9L61.0,26.4L51.9,26.2L45.7,27.7L42.4,29.5L50.0,27.5L56.6,27.5L63.0,29.1L68.8,31.8L76.2,37.8L80.8,43.8L83.9,50.4L86.4,46.1L77.3,26.2L38.4,5.1L25.8,10.3L15.3,18.6L8.7,27.5Z" />
      </svg>
    </span>
  )
}

export function UlebiWordmark({ className = 'h-3.5 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 268.7 60.0" className={className} fill="currentColor" aria-label="ULEBI">
      <path fillRule="evenodd" d="M196.9,36.1L197.5,35.0L217.0,35.0L217.3,35.4L218.4,35.4L220.5,37.5L220.5,37.8L220.8,38.2L220.8,38.9L221.2,39.2L221.2,41.6L220.8,42.0L220.8,42.7L219.1,44.4L218.7,44.4L218.4,44.8L217.7,44.8L217.3,45.1L216.3,45.1L216.0,45.5L197.9,45.5L197.2,44.8L197.2,43.4L196.9,43.0Z M123.9,21.5L124.3,56.9L142.3,57.3L168.0,56.9L173.2,46.8L173.6,44.8L139.6,44.4L139.9,35.4L167.0,35.0L167.0,23.2L139.9,23.2L139.6,15.9L132.6,18.0Z M245.5,1.7L245.5,11.1L245.1,12.1L258.3,7.6L259.4,7.9L256.9,9.3L248.6,18.4L245.1,20.8L245.1,25.0L245.5,25.3L245.5,57.3L260.7,56.9L261.1,56.6L261.1,18.4L260.7,18.0L261.1,2.0L260.7,1.7Z M181.9,1.7L181.9,13.5L213.2,13.2L217.0,14.5L218.7,16.3L219.1,19.4L217.3,21.8L213.9,23.2L197.5,23.2L196.9,22.5L196.5,15.6L181.6,21.5L181.6,56.9L221.5,56.9L228.8,54.8L234.4,50.7L237.1,44.1L236.4,37.1L233.3,32.3L227.1,28.4L232.3,23.9L234.4,17.0L233.7,12.1L229.8,6.2L223.6,3.1L217.3,1.7Z M123.9,13.5L124.3,13.9L140.9,13.9L141.3,13.5L160.4,13.5L160.7,13.9L166.3,13.9L167.0,13.2L168.4,10.4L168.4,9.7L169.4,7.6L170.1,6.9L172.5,1.7L132.6,1.7L131.2,3.4L130.5,4.8L129.5,5.9L129.5,6.2L124.3,11.8L123.9,12.5Z M72.2,2.0L72.2,56.9L73.9,57.3L111.8,56.9L117.0,46.8L117.7,44.8L117.3,44.4L114.2,44.8L81.2,44.8L80.9,44.4L85.0,42.3L87.5,39.9L87.1,36.8L87.5,35.7L87.5,2.0L87.1,1.7L72.9,1.7Z M8.0,1.7L8.0,37.1L10.0,45.1L11.8,48.2L16.3,52.7L20.5,55.5L28.8,58.0L38.2,58.3L42.7,57.6L48.6,55.5L53.1,52.7L58.7,46.1L61.4,38.2L61.8,2.0L46.1,1.7L46.1,33.3L45.1,38.5L43.7,41.3L40.2,44.1L37.8,44.8L31.6,44.8L28.4,43.4L25.3,40.6L23.2,35.4L22.9,1.7Z" />
    </svg>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const {
    snap,
    conn,
    apiModalOpen,
    setApiModalOpen,
    theme,
    toggleTheme,
    effectiveRole,
    roleOverride,
    setRoleOverride,
    toasts,
    dismissToast,
    pushToast,
    setTimelineJumpIso,
  } = useWard()

  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [staffOpen, setStaffOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [readNotifIds, setReadNotifIds] = useState<Set<string>>(new Set())

  const isAdmin = effectiveRole === 'admin'
  const currentNav = NAV_ITEMS.find((n) => pathname.startsWith(n.href)) || NAV_ITEMS[0]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setSidebarExpanded((s) => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const lockStation = async () => {
    await api('/ward-api/auth/logout', { method: 'POST', body: { clearSessionKeys: true } }).catch(() => undefined)
    router.replace('/login')
  }

  const activeEscCount = (snap?.escalations || []).filter((e) => e.active).length
  const unreadEvents = (snap?.events || []).filter((e) => (e.level === 'RED' || e.level === 'YELLOW') && !readNotifIds.has(e.id))
  const unreadCount = unreadEvents.length + activeEscCount

  useEffect(() => {
    const onScroll = () => {
      const bar = document.getElementById('scroll-progress-bar')
      if (!bar) return
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      const pct = Math.min(100, Math.max(0, (window.scrollY / max) * 100))
      bar.style.width = `${pct}%`
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="flex min-h-screen bg-ink text-slate-100">
      <div id="scroll-progress-bar" aria-hidden />
      {/* Level 1: Narrow Icon Rail matching Plane Wiki / Cycles (Screenshots 2 & 3) */}
      <aside
        aria-label="Primary icon rail"
        className="sticky top-0 z-40 hidden h-screen w-[52px] shrink-0 flex-col items-center justify-between border-r border-line bg-well py-3 sm:flex"
      >
        <div className="flex flex-col items-center gap-3">
          <Link href="/" title="ULEBI" aria-label="ULEBI Home">
            <BrandMark />
          </Link>

          {NAV_ITEMS.slice(0, 5).map((item) => {
            const Icon = item.icon
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                className="group flex flex-col items-center gap-0.5"
              >
                <span
                  className={cx(
                    'relative flex h-8 w-8 items-center justify-center rounded-lg transition',
                    active ? 'bg-raised text-white' : 'text-slate-500 group-hover:bg-white/5 group-hover:text-slate-300',
                  )}
                >
                  <Icon className="h-4 w-4 stroke-[1.75]" />
                  {item.href === '/dashboard' && activeEscCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-crit" />
                  )}
                </span>
                <span className={cx('text-[9px]', active ? 'text-white font-medium' : 'text-slate-500')}>{item.short}</span>
              </Link>
            )
          })}
        </div>

        <div className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title="Shortcuts & Docs"
            aria-label="Open Help"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-white"
          >
            <HelpCircle className="h-4 w-4 stroke-[1.75]" />
          </button>
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            title={`${snap?.me.name || 'Staff'} (${ROLE_DISPLAY[effectiveRole]})`}
            aria-label="Open Profile"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-raised text-[11px] font-medium text-white"
          >
            {(snap?.me.name || 'S').slice(0, 1).toUpperCase()}
          </button>
        </div>
      </aside>

      {/* Level 2: Expanded Sidebar matching Plane Wiki / Cycles (Screenshots 2 & 3) */}
      {sidebarExpanded && (
        <aside
          aria-label="Expanded ward navigation"
          className="sticky top-0 z-30 hidden h-screen w-56 shrink-0 flex-col justify-between border-r border-line bg-well px-3 py-3 lg:flex"
        >
          <SidebarContent
            pathname={pathname}
            activeEscCount={activeEscCount}
            accessReqCount={snap?.accessRequests?.length || 0}
            me={snap?.me}
            effectiveRole={effectiveRole}
            apiState={snap?.api}
            onCollapse={() => setSidebarExpanded(false)}
            onLock={lockStation}
            onOpenAccount={() => setAccountOpen(true)}
          />
        </aside>
      )}

      {/* Mobile Sidebar Drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" onMouseDown={() => setMobileDrawerOpen(false)}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          <aside
            className="relative z-10 flex h-full w-60 flex-col justify-between border-r border-line bg-well px-3 py-3 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <SidebarContent
              pathname={pathname}
              activeEscCount={activeEscCount}
              accessReqCount={snap?.accessRequests?.length || 0}
              me={snap?.me}
              effectiveRole={effectiveRole}
              apiState={snap?.api}
              onCollapse={() => setMobileDrawerOpen(false)}
              onNavigate={() => setMobileDrawerOpen(false)}
              onLock={lockStation}
              onOpenAccount={() => {
                setMobileDrawerOpen(false)
                setAccountOpen(true)
              }}
            />
          </aside>
        </div>
      )}

      {/* Main Content Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar matching Plane Wiki & Cycles (Screenshots 2 & 3) */}
        <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-2.5 px-4 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Open navigation menu"
                onClick={() => setMobileDrawerOpen(true)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-white lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              {!sidebarExpanded && (
                <button
                  type="button"
                  aria-label="Expand sidebar"
                  onClick={() => setSidebarExpanded(true)}
                  className="hidden h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-white lg:inline-flex"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              )}
              <h1 className="text-xs font-medium text-slate-300">{currentNav.label}</h1>
            </div>

            {/* Centered Search Bar matching Plane Wiki & Cycles */}
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="hidden min-h-[30px] w-72 items-center justify-between rounded-lg border border-line bg-panel px-3 py-1 text-xs text-slate-500 transition hover:border-line-strong hover:text-slate-300 md:flex"
            >
              <span className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5" />
                <span>Search</span>
              </span>
              <kbd className="font-mono text-[10px] text-slate-500">⌘K</kbd>
            </button>

            {/* Right Top Bar Controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <ApiPill status={snap?.api} onClick={() => setApiModalOpen(true)} />

              <AudioControl />

              <Button
                size="sm"
                variant="secondary"
                onClick={() => toggleTheme()}
                aria-label="Toggle Daylight and Night-Shift theme"
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                <span className="hidden xl:inline">{theme === 'dark' ? 'Daylight' : 'Night-Shift'}</span>
              </Button>

              <Button size="sm" variant="secondary" onClick={() => setApiModalOpen(true)}>
                <KeyRound className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Meta API Keys</span>
              </Button>

              {isAdmin && (
                <Button size="sm" variant="secondary" onClick={() => setStaffOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Staff Accounts</span>
                </Button>
              )}

              {/* Notifications Bell */}
              <div className="relative">
                <Button size="sm" variant="ghost" onClick={() => setNotifOpen((o) => !o)} aria-label="Notifications">
                  <Bell className="h-3.5 w-3.5" />
                  {unreadCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-crit" />}
                </Button>
                {notifOpen && (
                  <div
                    className="absolute right-0 top-full z-50 mt-2 w-72 rounded-[12px] border border-line bg-panel p-3 shadow-2xl"
                    onMouseLeave={() => setNotifOpen(false)}
                  >
                    <div className="mb-2 flex items-center justify-between border-b border-line pb-2">
                      <span className="text-xs font-medium text-white">Notifications</span>
                      <button
                        type="button"
                        onClick={() => {
                          setReadNotifIds(new Set((snap?.events || []).map((e) => e.id)))
                          pushToast({ tone: 'info', title: 'Marked all read' })
                        }}
                        className="text-[11px] text-slate-400 hover:text-white"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-56 space-y-1.5 overflow-y-auto">
                      {unreadEvents.slice(0, 6).map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false)
                            setTimelineJumpIso(ev.createdAt)
                            router.push('/calendar')
                          }}
                          className="block w-full rounded-lg border border-line bg-well p-2 text-left text-xs hover:border-line-strong"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-white">{ev.roomName}</span>
                            <span className="font-mono text-[10px] text-slate-500">{clockTime(ev.createdAt)}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-400">{ev.headline}</div>
                        </button>
                      ))}
                      {activeEscCount === 0 && unreadEvents.length === 0 && (
                        <div className="py-5 text-center text-xs text-slate-500">You are caught up</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Button size="sm" variant="ghost" onClick={() => setHelpOpen(true)} aria-label="Help">
                <HelpCircle className="h-3.5 w-3.5" />
              </Button>

              <UserMenu
                roleOverride={roleOverride}
                setRoleOverride={setRoleOverride}
                effectiveRole={effectiveRole}
                onStaff={() => setStaffOpen(true)}
                onApiSettings={() => setApiModalOpen(true)}
                onAccountSettings={() => setAccountOpen(true)}
                onLock={lockStation}
              />
            </div>
          </div>

          <AlarmBanner />

          {conn === 'lost' && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-200"
            >
              <WifiOff className="h-4 w-4" /> Connection lost — retrying automatically…
            </div>
          )}
        </header>

        <main className="mx-auto w-full max-w-[1560px] flex-1 px-6 pb-28 pt-6">{children}</main>
      </div>

      {/* Section 7: Bottom-Center Floating AI Composer matching Reference 4 */}
      <FloatingAssistant
        onOpenTimeline={(iso) => {
          setTimelineJumpIso(iso)
          router.push('/calendar')
        }}
      />

      {/* Toast Notifications */}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[65] flex max-w-xs flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-start justify-between gap-3 rounded-[10px] border border-line-strong bg-panel px-3.5 py-2.5 text-xs text-slate-200 shadow-xl"
          >
            <div>
              <div className="font-medium text-white">{t.title}</div>
              {t.detail && <div className="mt-0.5 text-[11px] text-slate-400">{t.detail}</div>}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="text-slate-500 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <ApiModal open={apiModalOpen} onClose={() => setApiModalOpen(false)} />
      <StaffModal open={staffOpen} onClose={() => setStaffOpen(false)} />
      <CommandPaletteModal
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onOpenApi={() => setApiModalOpen(true)}
        onOpenStaff={() => setStaffOpen(true)}
        onLock={lockStation}
      />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AccountSettingsModal open={accountOpen} onClose={() => setAccountOpen(false)} />
      {conn === 'signed-out' && <SignedOutOverlay />}
    </div>
  )
}

function SidebarContent({
  pathname,
  activeEscCount,
  accessReqCount,
  me,
  effectiveRole,
  apiState,
  onCollapse,
  onNavigate,
  onLock,
  onOpenAccount,
}: {
  pathname: string
  activeEscCount: number
  accessReqCount: number
  me?: { id: string; name: string; email: string; role: StaffRole }
  effectiveRole: StaffRole
  apiState?: ApiStatus
  onCollapse: () => void
  onNavigate?: () => void
  onLock: () => void
  onOpenAccount: () => void
}) {
  const groups = ['Triage & Clinical', 'Operations'] as const
  return (
    <>
      <div className="space-y-4">
          {/* Clinical Architecture Banner */}
          <div className="rounded-xl border border-line bg-well p-3.5 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <span className={cx('h-2 w-2 rounded-full', apiState?.state === 'LIVE' ? 'bg-emerald-400' : 'bg-amber-400')} />
                How the ward stays safe
              </span>
              <span className={cx('font-mono text-[10px]', apiState?.state === 'LIVE' ? 'text-emerald-400' : 'text-amber-400')}>
                {apiState?.state === 'LIVE' ? '● AI connected' : '● Safety rules on (AI off)'}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-300">
              <strong>What keeps the ward safe when the AI is off?</strong> Ulebi still watches with its built-in safety rules — for falls, calls for help, and the emergency button. The AI can only make an alert more urgent, never less.
            </p>
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-slate-400 border-t border-line/60 pt-2">
              <span className="rounded bg-raised px-2 py-0.5 border border-line text-white">Watching</span>
              <span>→</span>
              <span className="rounded bg-raised px-2 py-0.5 border border-line text-white">Second look</span>
              <span>→</span>
              <span className="rounded bg-raised px-2 py-0.5 border border-line text-white">Deciding</span>
              <span className="text-slate-600">|</span>
              <span className="rounded bg-raised px-2 py-0.5 border border-line text-white">Listening</span>
            </div>
          </div>
        <div className="flex items-center justify-between px-2">
          <span className="flex items-center gap-2 text-white"><BrandMark className="h-6 w-6" /><UlebiWordmark /></span>
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse sidebar"
            className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-white"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {groups.map((grp) => (
          <div key={grp} className="space-y-0.5">
            <div className="px-2 pb-1 text-[11px] font-medium text-slate-500">{grp}</div>
            {NAV_ITEMS.filter((i) => i.group === grp).map((item) => {
              const Icon = item.icon
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cx(
                    'flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition',
                    active ? 'bg-raised text-white font-medium' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-3.5 w-3.5 shrink-0 stroke-[1.75]" />
                    <span>{item.label}</span>
                  </span>
                  {item.href === '/dashboard' && activeEscCount > 0 && (
                    <span className="rounded bg-crit px-1.5 py-0.2 font-mono text-[10px] font-medium text-white">{activeEscCount}</span>
                  )}
                  {item.href === '/staff' && accessReqCount > 0 && (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.2 font-mono text-[10px] text-amber-300">{accessReqCount}</span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* Bottom User Row matching Reference 4 */}
      <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-2.5 py-2">
        <button type="button" onClick={onOpenAccount} className="flex min-w-0 items-center gap-2 text-left">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised text-[10px] font-medium text-white">
            {(me?.name || 'S').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-white">{me?.name || 'Nurse Sara'}</div>
            <div className="truncate text-[10px] text-slate-500">{ROLE_DISPLAY[effectiveRole]}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={onLock}
          title="Lock Station"
          aria-label="Lock Station"
          className="rounded p-1 text-slate-500 hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  )
}

function AudioControl() {
  const s = useAudioState()
  const unlocked = s[0] === '1'
  const tones = s[1] === '1'
  const audio = wardAudio()
  if (!unlocked) {
    return (
      <Button size="sm" variant="secondary" onClick={() => audio.unlock()}>
        <BellRing className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Alert Tones</span>
      </Button>
    )
  }
  return (
    <Button size="sm" variant="ghost" onClick={() => audio.setTones(!tones)} aria-label={`Alert Tones ${tones ? 'on' : 'off'}`}>
      {tones ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-slate-500" />}
      <span className="hidden lg:inline">Tones {tones ? 'On' : 'Off'}</span>
    </Button>
  )
}

function ApiPill({ status, onClick }: { status?: ApiStatus; onClick: () => void }) {
  const state = status?.state || 'CHECKING'
  const dot =
    state === 'LIVE' ? 'bg-emerald-400' : state === 'INVALID_API' || state === 'UNREACHABLE' ? 'bg-rose-500' : 'bg-amber-400'
  const label =
    state === 'LIVE'
      ? 'Meta AI · 4 Models Live'
      : state === 'INVALID_API'
      ? 'Meta AI · Invalid Key'
      : state === 'UNREACHABLE'
      ? 'Meta AI · Offline'
      : state === 'CHECKING'
      ? 'Meta AI · Checking…'
      : 'Meta AI · Connect Key'
  return (
    <button
      type="button"
      onClick={onClick}
      title="Open AI connection settings"
      className="flex min-h-[30px] items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1 text-xs text-slate-300 transition hover:border-line-strong hover:text-white"
    >
      <span className={cx('h-2 w-2 rounded-full', dot)} />
      <span className="font-medium">{label}</span>
      {state !== 'LIVE' && (
        <span className="hidden xl:inline text-[10px] text-amber-400/80 font-mono border-l border-line pl-2">Rules Active</span>
      )}
    </button>
  )
}

function UserMenu({
  roleOverride,
  setRoleOverride,
  effectiveRole,
  onStaff,
  onApiSettings,
  onAccountSettings,
  onLock,
}: {
  roleOverride: StaffRole | null
  setRoleOverride: (r: StaffRole | null) => void
  effectiveRole: StaffRole
  onStaff: () => void
  onApiSettings: () => void
  onAccountSettings: () => void
  onLock: () => void
}) {
  const { snap, pushToast } = useWard()
  const [open, setOpen] = useState(false)
  const me = snap?.me
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open profile menu"
        className="flex min-h-[30px] items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1 text-xs text-slate-300 hover:border-line-strong"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-raised text-[10px] font-medium text-white">
          {(me?.name || 'S').slice(0, 1).toUpperCase()}
        </span>
        <ChevronDown className="h-3 w-3 text-slate-500" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-[12px] border border-line bg-panel p-2 shadow-2xl"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="border-b border-line px-2.5 py-2">
            <div className="truncate text-xs font-medium text-white">{me?.name}</div>
            <div className="truncate text-[11px] text-slate-500">{ROLE_DISPLAY[effectiveRole]}</div>
          </div>

          <div className="border-b border-line px-2.5 py-2">
            <div className="mb-1.5 text-[10px] text-slate-500">Switch Role View</div>
            <div className="grid grid-cols-3 gap-1">
              {(['admin', 'charge_nurse', 'nurse'] as StaffRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRoleOverride(r === me?.role ? null : r)
                    pushToast({ tone: 'info', title: `Viewing as ${ROLE_DISPLAY[r]}` })
                  }}
                  className={cx(
                    'rounded px-1.5 py-1 text-[10px] font-medium transition',
                    effectiveRole === r ? 'bg-white text-zinc-950' : 'bg-well text-slate-400 hover:text-white',
                  )}
                >
                  {r === 'admin' ? 'Admin' : r === 'charge_nurse' ? 'Charge' : 'Nurse'}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onAccountSettings()
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-300 hover:bg-white/5"
          >
            <Settings className="h-3.5 w-3.5 text-slate-500" /> Account settings
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onApiSettings()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-300 hover:bg-white/5"
          >
            <KeyRound className="h-3.5 w-3.5 text-slate-500" /> Meta API Keys
          </button>
          {effectiveRole === 'admin' && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onStaff()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-300 hover:bg-white/5"
            >
              <UserPlus className="h-3.5 w-3.5 text-slate-500" /> Staff Accounts
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onLock()
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-rose-300 hover:bg-rose-500/10"
          >
            <LogOut className="h-3.5 w-3.5" /> Lock Station
          </button>
        </div>
      )}
    </div>
  )
}

/** Bottom-Center Floating AI Composer matching Reference 4 (`Ask anything`) */
function FloatingAssistant({ onOpenTimeline }: { onOpenTimeline: (iso: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<
    { id: string; role: 'user' | 'assistant'; text: string; timelineTimestamp?: string | null; engine?: string }[]
  >([])

  const ask = async (questionText?: string) => {
    const q = (questionText ?? input).trim()
    if (!q || busy) return
    setInput('')
    setExpanded(true)
    const userMsg = { id: `u-${Date.now()}`, role: 'user' as const, text: q }
    setMessages((prev) => [...prev, userMsg])
    setBusy(true)
    try {
      const r = await api<{ reply: string; timelineTimestamp?: string | null; engine?: string }>('/ward-api/ai/assistant', {
        body: { message: q },
      })
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: r.reply,
          timelineTimestamp: r.timelineTimestamp,
          engine: r.engine,
        },
      ])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: `Could not reach assistant: ${(e as Error).message}`,
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2">
      {expanded && messages.length > 0 && (
        <div className="mb-2 max-h-60 overflow-y-auto rounded-[14px] border border-line bg-panel p-3 shadow-2xl space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-line pb-1.5">
            <span className="text-[11px] font-medium text-slate-400">ULEBI AI Assistant</span>
            <button type="button" onClick={() => setExpanded(false)} className="text-slate-500 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {messages.map((m) => (
            <div
              key={m.id}
              className={cx(
                'rounded-lg px-3 py-2 leading-relaxed',
                m.role === 'user' ? 'ml-8 bg-raised text-white' : 'mr-4 bg-well text-slate-300 border border-line',
              )}
            >
              <div>{m.text}</div>
              {m.timelineTimestamp && (
                <div className="mt-2 flex items-center justify-between border-t border-line pt-1.5">
                  <EngineTag engine={m.engine} />
                  <Button size="sm" variant="secondary" onClick={() => onOpenTimeline(m.timelineTimestamp!)}>
                    <Clock className="h-3 w-3" /> Open timeline ({clockTime(m.timelineTimestamp)})
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Composer Box matching Reference 4 */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void ask()
        }}
        className="rounded-[16px] border border-line bg-panel px-3.5 py-2.5 shadow-2xl"
      >
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {['Which rooms escalated tonight?', 'Who is on duty?', 'Current spend'].map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => void ask(chip)}
              className="rounded-md bg-raised px-2 py-0.5 text-[11px] text-slate-400 hover:text-white"
            >
              {chip}
            </button>
          ))}
        </div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything"
          className="w-full bg-transparent py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
            <Sparkles className="h-3 w-3" /> ULEBI AI
          </span>
          <button
            type="submit"
            disabled={!input.trim() || busy}
            aria-label="Send question"
            className="rounded-lg p-1 text-slate-400 hover:text-white disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  )
}

function CommandPaletteModal({
  open,
  onClose,
  onOpenApi,
  onOpenStaff,
  onLock,
}: {
  open: boolean
  onClose: () => void
  onOpenApi: () => void
  onOpenStaff: () => void
  onLock: () => void
}) {
  const { snap, toggleTheme } = useWard()
  const router = useRouter()
  const [q, setQ] = useState('')

  useEffect(() => {
    if (open) setQ('')
  }, [open])

  const query = q.toLowerCase().trim()
  const pages = NAV_ITEMS.filter((n) => !query || n.label.toLowerCase().includes(query))
  const rooms = (snap?.rooms || []).filter((r) => !query || r.name.toLowerCase().includes(query))

  return (
    <Modal open={open} onClose={onClose} title="Search (⌘K)">
      <div className="space-y-3">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to rooms, pages, or actions…" className={inputCls} />
        <div className="max-h-64 space-y-2 overflow-y-auto text-xs">
          {pages.map((p) => {
            const Icon = p.icon
            return (
              <button
                key={p.href}
                type="button"
                onClick={() => {
                  onClose()
                  router.push(p.href)
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-slate-300 hover:bg-raised hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" /> {p.label}
                </span>
                <span className="text-[10px] text-slate-500">{p.group}</span>
              </button>
            )
          })}
          {rooms.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                localStorage.setItem('wardni_vision_room', r.id)
                onClose()
                router.push('/vision')
              }}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-slate-300 hover:bg-raised hover:text-white"
            >
              <span>{r.name}</span>
              <span className="text-[10px] text-slate-500">Room</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onClose()
              onOpenApi()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-slate-300 hover:bg-raised hover:text-white"
          >
            <KeyRound className="h-3.5 w-3.5" /> Meta API Keys
          </button>
          <button
            type="button"
            onClick={() => {
              onClose()
              toggleTheme()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-slate-300 hover:bg-raised hover:text-white"
          >
            <Sun className="h-3.5 w-3.5" /> Toggle Daylight / Night-Shift
          </button>
          <button
            type="button"
            onClick={() => {
              onClose()
              onOpenStaff()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-slate-300 hover:bg-raised hover:text-white"
          >
            <UserPlus className="h-3.5 w-3.5" /> Staff Accounts
          </button>
          <button
            type="button"
            onClick={() => {
              onClose()
              onLock()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-rose-300 hover:bg-rose-500/10"
          >
            <Lock className="h-3.5 w-3.5" /> Lock Station
          </button>
        </div>
      </div>
    </Modal>
  )
}

function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts & Workflow" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="space-y-2 text-xs text-slate-300">
        <div className="flex justify-between">
          <span>Command Palette</span>
          <kbd className="font-mono text-slate-400">⌘K / Ctrl+K</kbd>
        </div>
        <div className="flex justify-between">
          <span>Toggle Sidebar</span>
          <kbd className="font-mono text-slate-400">⌘B / Ctrl+B</kbd>
        </div>
        <div className="flex justify-between">
          <span>Close Modal</span>
          <kbd className="font-mono text-slate-400">Esc</kbd>
        </div>
      </div>
    </Modal>
  )
}

function AccountSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snap, refresh, pushToast } = useWard()
  const [idleMins, setIdleMins] = useState(30)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && snap?.idleLockMinutes != null) setIdleMins(snap.idleLockMinutes)
  }, [open, snap?.idleLockMinutes])

  const save = async () => {
    setBusy(true)
    try {
      await api('/ward-api/settings', { body: { idleLockMinutes: idleMins } })
      await refresh()
      pushToast({ tone: 'ok', title: 'Auto-lock updated' })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Account Settings"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="block text-xs text-slate-300">Idle Auto-Lock (Minutes)</span>
          <select className={inputCls} value={idleMins} onChange={(e) => setIdleMins(Number(e.target.value))}>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </label>
      </div>
    </Modal>
  )
}

type KeySourceMap = Record<'model' | 'sam' | 'spark' | 'voice' | 'wonder', 'session' | 'env' | 'unset' | string>

function plainError(msg: string): string {
  const m = (msg || '').toLowerCase()
  if (m.includes('401') || m.includes('invalid') || m.includes('unauthorized') || m.includes('rejected')) return 'The key was not accepted. Check the key and try again.'
  if (m.includes('timeout') || m.includes('timed out') || m.includes('504')) return 'Meta took too long to answer. Try again.'
  if (m.includes('unreachable') || m.includes('socket') || m.includes('network') || m.includes('econn') || m.includes('fetch failed')) return 'Could not reach Meta. Check the internet connection and try again.'
  if (m.includes('rules fallback')) return 'The AI is off, so the ward is running on its safety rules for now.'
  return msg || 'Something went wrong. Try again.'
}

function ApiModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snap, refresh, effectiveRole, pushToast } = useWard()
  const [busy, setBusy] = useState(false)
  const [busyAction, setBusyAction] = useState<'save' | 'verify' | 'clear' | null>(null)
  const [keyStatus, setKeyStatus] = useState<KeySourceMap | null>(null)
  const [modelKey, setModelKey] = useState('')
  const [samKey, setSamKey] = useState('')
  const [sparkKey, setSparkKey] = useState('')
  const [voiceKey, setVoiceKey] = useState('')
  const [wonderKey, setWonderKey] = useState('')
  const [showKeys, setShowKeys] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err' | 'info'; title: string; detail: string } | null>(null)
  const st = snap?.api
  const isAdmin = effectiveRole === 'admin'

  const loadKeys = async () => {
    try {
      const d = await api<{ keys: KeySourceMap }>('/ward-api/settings/keys', { method: 'GET' })
      setKeyStatus(d.keys)
    } catch {
      setKeyStatus(null)
    }
  }

  useEffect(() => {
    if (open) {
      setNotice(null)
      setModelKey('')
      setSamKey('')
      setSparkKey('')
      setVoiceKey('')
      setWonderKey('')
      void loadKeys()
    }
  }, [open])

  const verify = async () => {
    setBusy(true)
    setBusyAction('verify')
    try {
      const body: Record<string, string> = {}
      if (modelKey.trim()) body.modelApiKey = modelKey.trim()
      if (samKey.trim()) body.samApiKey = samKey.trim()
      if (sparkKey.trim()) body.sparkApiKey = sparkKey.trim()
      if (voiceKey.trim()) body.voiceApiKey = voiceKey.trim()
      if (wonderKey.trim()) body.wonderApiKey = wonderKey.trim()
      const d = await api<{ ok: boolean; keys?: KeySourceMap; status?: ApiStatus }>('/ward-api/ai/verify', { method: 'POST', body })
      if (d.keys) setKeyStatus(d.keys)
      await refresh()
      await loadKeys()
      if (d.ok && d.status?.state === 'LIVE') {
        setNotice({
          tone: 'ok',
          title: 'Connected — all checks passed',
          detail: 'Video watching and ranking are ready.',
        })
        pushToast({ tone: 'ok', title: 'AI connected' })
      } else {
        setNotice({
          tone: 'err',
          title: 'Not connected',
          detail: plainError(d.status?.lastError || ''),
        })
      }
    } catch (e) {
      // api() throws on HTTP/network failure — previously this left the panel
      // looking unchanged with no error shown ("does nothing").
      setNotice({ tone: 'err', title: 'Check failed — try again', detail: plainError((e as Error).message) })
    } finally {
      setBusy(false)
      setBusyAction(null)
    }
  }

  const saveKeys = async () => {
    const body: Record<string, string> = {}
    if (modelKey.trim()) body.modelApiKey = modelKey.trim()
    if (samKey.trim()) body.samApiKey = samKey.trim()
    if (sparkKey.trim()) body.sparkApiKey = sparkKey.trim()
    if (voiceKey.trim()) body.voiceApiKey = voiceKey.trim()
    if (wonderKey.trim()) body.wonderApiKey = wonderKey.trim()
    if (!Object.keys(body).length) {
      setNotice({ tone: 'err', title: 'Paste your Meta key first', detail: 'Paste the key above, then press Save and connect.' })
      return
    }
    setBusy(true)
    setBusyAction('save')
    try {
      const d = await api<{ ok: boolean; keys?: KeySourceMap; status?: ApiStatus }>('/ward-api/settings/keys', { method: 'POST', body })
      setModelKey('')
      setSamKey('')
      setSparkKey('')
      setVoiceKey('')
      setWonderKey('')
      if (d.keys) setKeyStatus(d.keys)
      await refresh()
      await loadKeys()
      if (d.ok && d.status?.state === 'LIVE') {
        setNotice({ tone: 'ok', title: 'Saved and connected', detail: 'All AI features are ready.' })
        pushToast({ tone: 'ok', title: 'AI connected' })
      } else {
        setNotice({
          tone: 'err',
          title: 'Not connected',
          detail: plainError(d.status?.lastError || ''),
        })
      }
    } catch (e) {
      setNotice({ tone: 'err', title: 'Could not save — try again', detail: plainError((e as Error).message) })
    } finally {
      setBusy(false)
      setBusyAction(null)
    }
  }

  const clearKeys = async () => {
    setBusy(true)
    setBusyAction('clear')
    try {
      const d = await api<{ ok: boolean; keys?: KeySourceMap; status?: ApiStatus }>('/ward-api/settings/keys', { method: 'POST', body: { clear: true } })
      if (d.keys) setKeyStatus(d.keys)
      await refresh()
      await loadKeys()
      setConfirmClearOpen(false)
      pushToast({ tone: 'info', title: 'AI disconnected' })
    } catch (e) {
      pushToast({ tone: 'err', title: (e as Error).message })
    } finally {
      setBusy(false)
      setBusyAction(null)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        wide
        title="AI connection"
        description="Connect Meta\u2019s AI. Your key is kept on the server only, never shown here."
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button variant="danger" onClick={() => setConfirmClearOpen(true)} disabled={busy || !isAdmin}>
              <Trash2 className="h-3.5 w-3.5" /> Disconnect AI
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button variant="secondary" loading={busyAction === 'verify'} onClick={verify} disabled={busy}>
                <RefreshCw className="h-3.5 w-3.5" /> Test connection
              </Button>
              <Button variant="primary" loading={busyAction === 'save'} onClick={saveKeys} disabled={busy || !isAdmin}>
                Save and connect
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {notice && (
            <div className="rounded-lg border border-line-strong bg-well p-3 text-xs">
              <div className="font-medium text-white">{notice.title}</div>
              <div className="mt-0.5 font-mono text-[11px] text-slate-400">{notice.detail}</div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-white">Your Meta key (one key for all features)</label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setShowKeys((s) => !s)} className="text-[11px] text-slate-400 hover:text-white">
                    {showKeys ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div className="relative">
                <input
                  type={showKeys ? 'text' : 'password'}
                  value={modelKey}
                  disabled={!isAdmin || busy}
                  onChange={(e) => setModelKey(e.target.value)}
                  placeholder="Paste your Meta key here…"
                  className={cx(inputCls, 'pr-9 font-mono text-xs')}
                />
                <button
                  type="button"
                  onClick={() => setShowKeys((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  aria-label="Toggle key visibility"
                >
                  {showKeys ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-xs text-slate-400 hover:text-white">
              {advanced ? 'Hide advanced keys' : 'Advanced: separate keys for each feature'}
            </button>

            {advanced && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <input type={showKeys ? 'text' : 'password'} value={samKey} onChange={(e) => setSamKey(e.target.value)} placeholder="SAM_API_KEY" className={cx(inputCls, 'font-mono text-xs')} />
                <input type={showKeys ? 'text' : 'password'} value={sparkKey} onChange={(e) => setSparkKey(e.target.value)} placeholder="SPARK_API_KEY" className={cx(inputCls, 'font-mono text-xs')} />
                <input type={showKeys ? 'text' : 'password'} value={voiceKey} onChange={(e) => setVoiceKey(e.target.value)} placeholder="VOICE_API_KEY" className={cx(inputCls, 'font-mono text-xs')} />
                <input type={showKeys ? 'text' : 'password'} value={wonderKey} onChange={(e) => setWonderKey(e.target.value)} placeholder="WONDER_API_KEY" className={cx(inputCls, 'font-mono text-xs')} />
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-line bg-well">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line font-mono text-[10px] uppercase text-slate-500">
                  <th className="px-3 py-2">What it does</th>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Speed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-mono text-[11px]">
                {[
                  { id: st?.voiceModel || 'muse-voice-transcribe-1.0', name: 'Listening — turns speech into text', k: 'voice' as const, ok: st?.voiceReady, statusText: st?.voiceReady ? 'Connected' : (st?.state === 'INVALID_API' || st?.state === 'UNREACHABLE' ? 'Problem' : 'Not connected'), lat: null },
                  { id: st?.samModel || 'sam-3.1', name: 'Watching — follows people on video', k: 'sam' as const, ok: st?.samVerified, statusText: st?.samVerified ? 'Connected' : (st?.samError ? 'Problem' : 'Not connected'), lat: st?.samLatencyMs },
                  { id: st?.wonderModel || 'muse-wonder-1.0', name: 'Second look — checks movement again, only when needed', k: 'wonder' as const, ok: st?.state === 'LIVE', statusText: st?.state === 'LIVE' ? (st?.wonderMode === 'off' ? 'Off' : 'Ready when needed') : 'Not connected', lat: null },
                  { id: st?.sparkModel || 'muse-spark-1.3', name: 'Deciding — ranks how urgent it is', k: 'spark' as const, ok: st?.sparkVerified, statusText: st?.sparkVerified ? 'Connected' : (st?.sparkError ? 'Problem' : 'Not connected'), lat: st?.sparkLatencyMs },
                ].map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 text-white">{m.name}<div className="text-[10px] text-slate-500">{m.id}</div></td>
                    <td className="px-3 py-2 text-slate-400">{keyStatus?.[m.k] === 'session' ? 'Saved' : keyStatus?.[m.k] === 'env' ? 'On server' : 'Not added'}</td>
                    <td className="px-3 py-2 text-slate-300">{m.statusText}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{m.lat != null ? `${m.lat}ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(st?.samError || st?.sparkError) && (
            <div className="rounded-lg border border-line bg-well p-3 text-[11px] text-slate-400">
              {st?.samError && <div>Watching: {plainError(st.samError)}</div>}
              {st?.sparkError && <div>Deciding: {plainError(st.sparkError)}</div>}
              <details className="mt-2">
                <summary className="cursor-pointer text-slate-500">Technical details (for support)</summary>
                <div className="mt-1 font-mono text-[11px]">
                  {st?.samError && <div>Watching: {st.samError}</div>}
                  {st?.sparkError && <div>Deciding: {st.sparkError}</div>}
                </div>
              </details>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={() => void clearKeys()}
        loading={busyAction === 'clear'}
        title="Disconnect the AI?"
        description="This disconnects all AI features until you add a key again."
        confirmLabel="Disconnect"
        variant="danger"
      />
    </>
  )
}

function AlarmBanner() {
  const { alarms, snoozedUntil, snooze, refresh } = useWard()
  const [busy, setBusy] = useState<string | null>(null)
  if (!alarms.length) return null
  const snoozed = snoozedUntil > Date.now()
  const ack = async (id: string) => {
    setBusy(id)
    try {
      await api(`/ward-api/escalations/${encodeURIComponent(id)}`, { method: 'POST', body: { action: 'ack' } })
      await refresh()
    } finally {
      setBusy(null)
    }
  }
  return (
    <div role="alert" aria-live="assertive" className="border-b border-rose-500/50 bg-rose-950/90 px-4 py-2">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-rose-100">
          <Siren className="h-4 w-4 text-rose-400 animate-alarm" />
          <span>Unanswered RED emergency alarm</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {alarms.map((a) => (
            <Button key={a.id} size="sm" variant="critical" loading={busy === a.id} onClick={() => ack(a.id)}>
              {a.roomName}: Acknowledge
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => snooze(2 * 60_000)} disabled={snoozed}>
            <BellOff className="h-3.5 w-3.5" /> {snoozed ? 'Snoozed' : 'Snooze 2m'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SignedOutOverlay() {
  const pathname = usePathname()
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/95 p-4 backdrop-blur">
      <div className="max-w-sm rounded-[12px] border border-line bg-panel p-6 text-center shadow-2xl">
        <AlertTriangle className="mx-auto h-6 w-6 text-slate-400" />
        <h2 className="mt-3 text-sm font-semibold text-white">Station Locked</h2>
        <p className="mt-1 text-xs text-slate-400">Sign in to resume monitoring.</p>
        <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="mt-4 inline-flex rounded-lg bg-white px-4 py-2 text-xs font-semibold text-zinc-950">
          Sign in
        </Link>
      </div>
    </div>
  )
}
