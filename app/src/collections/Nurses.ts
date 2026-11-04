import type { CollectionConfig } from 'payload'
import { isWardStaffOrCms } from '../access/wardni'

/** Shift roster used by the escalation engine's call order. */
export const Nurses: CollectionConfig = {
  slug: 'nurses',
  labels: { singular: 'Roster Nurse', plural: 'Shift Roster' },
  admin: { useAsTitle: 'name', group: 'Ward', defaultColumns: ['name', 'role', 'onDuty', 'callOrder'] },
  access: { read: isWardStaffOrCms, create: isWardStaffOrCms, update: isWardStaffOrCms, delete: isWardStaffOrCms },
  defaultSort: 'callOrder',
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 80 },
    { name: 'role', type: 'text', defaultValue: 'Ward RN', maxLength: 60 },
    { name: 'onDuty', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
    { name: 'callOrder', type: 'number', defaultValue: 0, index: true, admin: { position: 'sidebar' } },
  ],
}
