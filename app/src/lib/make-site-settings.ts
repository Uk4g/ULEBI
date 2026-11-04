export type MakeSiteSettings = {
  title?: string
  description?: string
  language?: string
  robots?: {
    index?: boolean
  }
  icons?: {
    icon?: string
  }
  openGraph?: {
    image?: string
  }
  analytics?: {
    googleAnalyticsId?: string
  }
  customScripts?: {
    headStart?: string
    headEnd?: string
    bodyStart?: string
    bodyEnd?: string
  }
  accessibility?: {
    addBypassLinks?: boolean
  }
}

// Self-hosted static site settings.
export const makeSiteSettings: MakeSiteSettings = {
  title: 'ULEBI — Clinical Night-Shift Workstation',
  description:
    'AI-assisted clinical night-shift monitoring and nurse-call triage. SAM tracks, Spark ranks, nurses decide.',
  language: 'en',
}

export function sanitizeHtmlAttribute(value: string | undefined): string {
  return value?.replace(/[^a-zA-Z0-9_-]/g, '') || ''
}
