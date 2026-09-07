export const rolePermissions = {
  owner: new Set(['edit', 'lock', 'comment', 'submit', 'approve', 'members']),
  director: new Set(['edit', 'lock', 'comment', 'submit', 'approve']),
  editor: new Set(['edit', 'lock', 'comment', 'submit']),
  reviewer: new Set(['comment']),
  viewer: new Set(),
};

const roleRank = { viewer: 0, reviewer: 1, editor: 2, director: 3, owner: 4 };

export function effectiveProjectRole(tokenRole, memberRole) {
  if (!(tokenRole in roleRank)) return 'viewer';
  if (!memberRole || !(memberRole in roleRank)) return tokenRole;
  return roleRank[memberRole] < roleRank[tokenRole] ? memberRole : tokenRole;
}

export function hasProjectPermission(tokenRole, memberRole, permission) {
  return rolePermissions[effectiveProjectRole(tokenRole, memberRole)]?.has(permission) ?? false;
}

export function hasRolePermission(role, permission) {
  return rolePermissions[role]?.has(permission) ?? false;
}

export function canInitializeProjectRoom(tokenRole) {
  return rolePermissions[tokenRole]?.has('edit') ?? false;
}
