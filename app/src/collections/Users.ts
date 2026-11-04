import type { Access, CollectionConfig } from 'payload'
import { isWardAdminField, isWardAdminOrCms } from '../access/wardni'

const selfOrWardAdmin: Access = ({ req }) => {
  if (req.user?.collection === 'admins') return true
  if (req.user?.collection !== 'users') return false
  if ((req.user as { role?: string }).role === 'admin') return true
  return { id: { equals: req.user.id } }
}

/** Ward workstation accounts (nurses, charge nurses, ward admins). Separate from CMS `admins`. */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Workstation Account', plural: 'Workstation Accounts' },
  admin: { useAsTitle: 'name', group: 'Ward', defaultColumns: ['name', 'email', 'role'] },
  auth: {
    // A night shift is 12h+; sessions are DB-backed so they survive server restarts.
    tokenExpiration: 60 * 60 * 16,
    maxLoginAttempts: 5,
    lockTime: 60 * 1000,
    cookies: { sameSite: 'Lax' },
  },
  access: {
    admin: () => false,
    create: isWardAdminOrCms,
    read: selfOrWardAdmin,
    update: selfOrWardAdmin,
    delete: isWardAdminOrCms,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'nurse',
      options: [
        { label: 'Ward Admin', value: 'admin' },
        { label: 'Charge Nurse', value: 'charge_nurse' },
        { label: 'Nurse', value: 'nurse' },
      ],
      access: { create: isWardAdminField, update: isWardAdminField },
      admin: { position: 'sidebar' },
    },
  ],
}
