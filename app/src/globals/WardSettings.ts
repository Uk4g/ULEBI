import type { FieldAccess, GlobalConfig } from 'payload'
import { isWardStaffOrCms } from '../access/wardni'

const canEditTimeout: FieldAccess = ({ req }) =>
  req.user?.collection === 'admins' || (req.user?.collection === 'users' && (req.user as { role?: string }).role === 'admin')

export const WardSettings: GlobalConfig = {
  slug: 'ward-settings',
  label: 'Ward Settings',
  admin: { group: 'Ward' },
  access: { read: isWardStaffOrCms, update: isWardStaffOrCms },
  fields: [
    // How long each nurse has before the call moves on is a safety parameter: ward admins (or CMS admins) only.
    { name: 'escalationTimeoutSec', type: 'number', defaultValue: 45, min: 15, max: 300, access: { update: canEditTimeout } },
    { name: 'masterSummary', type: 'json' },
  ],
}
