import type { CollectionConfig } from 'payload'
import { isWardStaffOrCms, serverOnlyField } from '../access/wardni'

export const Rooms: CollectionConfig = {
  slug: 'rooms',
  labels: { singular: 'Patient Room', plural: 'Patient Rooms' },
  admin: { useAsTitle: 'name', group: 'Ward', defaultColumns: ['name', 'clinicalContext', 'updatedAt'] },
  access: { read: isWardStaffOrCms, create: isWardStaffOrCms, update: isWardStaffOrCms, delete: isWardStaffOrCms },
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 80 },
    { name: 'clinicalContext', label: 'Clinical risk note', type: 'textarea', maxLength: 300 },
    { name: 'camUrl', label: 'Camera stream URL', type: 'text', maxLength: 600 },
    // Camera credentials and bedside pad key are secrets: never readable over the API.
    { name: 'camToken', type: 'text', access: { read: serverOnlyField, update: serverOnlyField, create: serverOnlyField }, admin: { hidden: true } },
    { name: 'padKey', type: 'text', index: true, access: { read: serverOnlyField, update: serverOnlyField, create: serverOnlyField }, admin: { hidden: true } },
    { name: 'hasCamToken', type: 'checkbox', defaultValue: false, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'negativeExclusions', type: 'text', defaultValue: 'medical staff, nurse, doctor, visitor', maxLength: 200 },
    { name: 'bedZone', type: 'json' },
    { name: 'visionClasses', type: 'json' },
    // Written only by the triage engine; a staff account must not be able to blank a room's RED verdict over REST.
    { name: 'latestBySource', type: 'json', admin: { readOnly: true }, access: { create: serverOnlyField, update: serverOnlyField } },
    { name: 'clearedAt', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
  ],
}
