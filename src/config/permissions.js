/**
 * Roles are sugar over permission strings. A permission is "<resource>:<action>"
 * and either half may be "*". Adding a role later is a data change here, not a
 * refactor of every route.
 */
export const RESOURCES = [
  'pages', 'services', 'cases', 'articles', 'categories',
  'lawyers', 'vacancies', 'gallery', 'media', 'enquiries', 'settings', 'navigation', 'admins',
];

export const ROLES = ['super_admin', 'admin', 'editor'];

export const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: [
    'pages:*', 'services:*', 'cases:*', 'articles:*', 'categories:*',
    'lawyers:*', 'vacancies:*', 'gallery:*', 'media:*', 'enquiries:*', 'settings:*', 'navigation:*',
  ],
  editor: [
    'articles:*', 'cases:*', 'vacancies:*', 'gallery:*', 'media:*',
    'enquiries:read', 'services:read', 'lawyers:read', 'categories:read',
  ],
};

function matches(granted, required) {
  if (granted === '*') return true;
  const [gRes, gAct = '*'] = granted.split(':');
  const [rRes, rAct] = required.split(':');
  if (gRes !== '*' && gRes !== rRes) return false;
  return gAct === '*' || gAct === rAct;
}

export function permissionsFor(admin) {
  const fromRole = ROLE_PERMISSIONS[admin.role] || [];
  return [...new Set([...fromRole, ...(admin.permissions || [])])];
}

export function can(admin, required) {
  if (!admin || admin.isActive === false) return false;
  return permissionsFor(admin).some((g) => matches(g, required));
}
