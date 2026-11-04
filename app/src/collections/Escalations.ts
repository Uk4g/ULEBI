import type { CollectionConfig } from 'payload'
import { isWardStaffOrCms, isCmsAdmin } from '../access/wardni'

export const ESCALATION_STATUSES = [
  'INVITED',
  'ESCALATED_NEXT_NURSE',
  'UNASSIGNED_ALERT',
  'AUTOMATED_EMERGENCY_ALARM',
  'STATION_ATTENTION_REQUIRED',
  'ACKNOWLEDGED',
] as const

/** Nurse-call escalation chains. Exactly one active chain per room. */
export const Escalations: CollectionConfig = {
  slug: 'escalations',
  labels: { singular: 'Escalation', plural: 'Escalations' },
  admin: { useAsTitle: 'roomName', group: 'Ward', defaultColumns: ['roomName', 'level', 'status', 'assignedNurseName', 'updatedAt'] },
  access: { read: isWardStaffOrCms, create: isCmsAdmin, update: isCmsAdmin, delete: isCmsAdmin },
  defaultSort: '-updatedAt',
  fields: [
    { name: 'room', type: 'relationship', relationTo: 'rooms', index: true },
    { name: 'roomName', type: 'text' },
    { name: 'active', type: 'checkbox', defaultValue: true, index: true },
    { name: 'level', type: 'select', required: true, options: ['RED', 'YELLOW'] },
    { name: 'status', type: 'select', required: true, options: [...ESCALATION_STATUSES] },
    { name: 'source', type: 'text' },
    { name: 'headline', type: 'text' },
    { name: 'nurseAction', type: 'textarea' },
    // Call order snapshot taken when the chain starts, so roster edits never skip or repeat a nurse.
    { name: 'queue', type: 'json' },
    { name: 'queueIndex', type: 'number', defaultValue: -1 },
    { name: 'assignedNurseName', type: 'text' },
    { name: 'attempt', type: 'number', defaultValue: 1 },
    { name: 'timeoutSec', type: 'number' },
    { name: 'deadline', type: 'date', index: true },
    { name: 'repeatCount', type: 'number', defaultValue: 0 },
    { name: 'acknowledgedBy', type: 'text' },
    { name: 'acknowledgedAt', type: 'date' },
    { name: 'history', type: 'json' },
  ],
}
