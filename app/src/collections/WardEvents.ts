import type { CollectionConfig } from 'payload'
import { isWardStaffOrCms, isCmsAdmin } from '../access/wardni'

/** Append-only triage verdicts from Vision, Voice and Task modules. */
export const WardEvents: CollectionConfig = {
  slug: 'ward-events',
  labels: { singular: 'Ward Event', plural: 'Ward Events' },
  admin: { useAsTitle: 'headline', group: 'Ward', defaultColumns: ['roomName', 'level', 'source', 'headline', 'createdAt'] },
  // Verdicts are written only by trusted server code (overrideAccess), never directly over the REST API, so a staff
  // account cannot forge or backfill events through /api/ward-events.
  access: { read: isWardStaffOrCms, create: isCmsAdmin, update: isCmsAdmin, delete: isCmsAdmin },
  defaultSort: '-createdAt',
  fields: [
    { name: 'room', type: 'relationship', relationTo: 'rooms', index: true },
    { name: 'roomName', type: 'text' },
    { name: 'source', type: 'select', required: true, options: ['SAM', 'VOICE', 'TASK', 'ADMIN'] },
    { name: 'level', type: 'select', required: true, index: true, options: ['RED', 'YELLOW', 'routine'] },
    { name: 'engine', type: 'select', defaultValue: 'spark', options: ['spark', 'rules', 'hardware', 'wonder'] },
    { name: 'failSafe', type: 'checkbox', defaultValue: false },
    { name: 'headline', type: 'text' },
    { name: 'reason', type: 'textarea' },
    { name: 'nurseAction', type: 'textarea' },
    { name: 'detail', type: 'text' },
    { name: 'latencyMs', type: 'number' },
    { name: 'tokens', type: 'text' },
  ],
}
