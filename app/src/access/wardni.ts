import type { Access, FieldAccess } from 'payload'

// Ward workstation staff (app users) vs. CMS admins (Payload Admin panel).
export const isWardStaff: Access = ({ req }) => req.user?.collection === 'users'
export const isCmsAdmin: Access = ({ req }) => req.user?.collection === 'admins'
export const isWardStaffOrCms: Access = ({ req }) =>
  req.user?.collection === 'users' || req.user?.collection === 'admins'

export const isWardAdmin: Access = ({ req }) =>
  req.user?.collection === 'users' && (req.user as { role?: string }).role === 'admin'

export const isWardAdminOrCms: Access = ({ req }) =>
  req.user?.collection === 'admins' ||
  (req.user?.collection === 'users' && (req.user as { role?: string }).role === 'admin')

export const isWardAdminField: FieldAccess = ({ req }) =>
  req.user?.collection === 'users' && (req.user as { role?: string }).role === 'admin'

// Server-only secrets: never exposed through REST/GraphQL/Local API reads; written via trusted server code.
export const serverOnlyField: FieldAccess = () => false
