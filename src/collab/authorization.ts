import type { ProjectRole } from '../domain/collaboration';

export type ProjectAction =
  | 'project:read'
  | 'project:edit'
  | 'shot:lock'
  | 'review:comment'
  | 'review:submit'
  | 'review:approve'
  | 'members:manage'
  | 'asset:register';

const permissions: Record<ProjectRole, ReadonlySet<ProjectAction>> = {
  owner: new Set(['project:read', 'project:edit', 'shot:lock', 'review:comment', 'review:submit', 'review:approve', 'members:manage', 'asset:register']),
  director: new Set(['project:read', 'project:edit', 'shot:lock', 'review:comment', 'review:submit', 'review:approve', 'asset:register']),
  editor: new Set(['project:read', 'project:edit', 'shot:lock', 'review:comment', 'review:submit', 'asset:register']),
  reviewer: new Set(['project:read', 'review:comment']),
  viewer: new Set(['project:read']),
};

export function can(role: ProjectRole, action: ProjectAction): boolean {
  return permissions[role].has(action);
}

export function requirePermission(role: ProjectRole, action: ProjectAction): void {
  if (!can(role, action)) throw new Error(`Role ${role} is not allowed to perform ${action}.`);
}
