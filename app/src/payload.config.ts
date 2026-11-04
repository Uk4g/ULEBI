import path from 'path'
import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { en as adminLanguage } from '@payloadcms/translations/languages/en'
import { fileURLToPath } from 'url'
import { Admins } from './collections/Admins'
import { Media } from './collections/Media'
import { Folders } from './collections/Folders'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { Nurses } from './collections/Nurses'
import { Rooms } from './collections/Rooms'
import { WardEvents } from './collections/WardEvents'
import { Escalations } from './collections/Escalations'
import { WardSettings } from './globals/WardSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Self-hosted configuration using a local SQLite database file (wardni.db).
// PAYLOAD_SECRET must be set in production; see .env.example.
export default buildConfig({
  secret: process.env.PAYLOAD_SECRET as string,
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || 'file:./wardni.db',
    },
    // Schema is created by the included migration (src/migrations/),
    // run once with: pnpm payload migrate
  }),
  editor: lexicalEditor({}),
  admin: {
    user: Admins.slug,
    constrainWidth: true,
    dashboard: {
      widgets: [],
      defaultLayout: [
        { widgetSlug: 'activity', width: 'full' },
        { widgetSlug: 'collections', width: 'full' },
      ],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  i18n: {
    fallbackLanguage: 'en',
    supportedLanguages: { 'en': adminLanguage },
  },
  collections: [Admins, Media, Folders, Tags, Users, Nurses, Rooms, WardEvents, Escalations],
  globals: [WardSettings],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  localization: {
    locales: [{ code: 'en', label: 'English' }],
    fallback: true,
    defaultLocale: 'en',
  },
  plugins: [mcpPlugin({})],
})
