import { z } from 'zod';

export const projectRoleSchema = z.enum(['owner', 'director', 'editor', 'reviewer', 'viewer']);
export type ProjectRole = z.infer<typeof projectRoleSchema>;

export const projectMemberSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
  role: projectRoleSchema,
  department: z.string().min(1).default('general'),
  active: z.boolean().default(true),
});
export type ProjectMember = z.infer<typeof projectMemberSchema>;

export const reviewCommentSchema = z.object({
  id: z.string().min(1),
  shotId: z.string().min(1),
  frame: z.number().int().nonnegative(),
  authorId: z.string().min(1),
  authorName: z.string().min(1),
  text: z.string().min(1),
  createdAt: z.string().min(1),
  resolvedAt: z.string().min(1).optional(),
  resolvedBy: z.string().min(1).optional(),
});
export type ReviewComment = z.infer<typeof reviewCommentSchema>;

const normalizedPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const frameAnnotationSchema = z.object({
  id: z.string().min(1),
  shotId: z.string().min(1),
  frame: z.number().int().nonnegative(),
  authorId: z.string().min(1),
  kind: z.enum(['point', 'box', 'freehand']),
  points: z.array(normalizedPointSchema).min(1),
  text: z.string().default(''),
  createdAt: z.string().min(1),
});
export type FrameAnnotation = z.infer<typeof frameAnnotationSchema>;

export const shotVersionRecordSchema = z.object({
  id: z.string().min(1),
  shotId: z.string().min(1),
  version: z.number().int().positive(),
  createdAt: z.string().min(1),
  createdBy: z.string().min(1),
  status: z.enum(['WIP', 'REVIEW', 'APPROVED']),
  snapshotHashSha256: z.string().regex(/^[0-9a-f]{64}$/),
  snapshotJson: z.string().min(2),
});
export type ShotVersionRecord = z.infer<typeof shotVersionRecordSchema>;

export const approvalEventSchema = z.object({
  id: z.string().min(1),
  shotId: z.string().min(1),
  from: z.enum(['WIP', 'REVIEW', 'APPROVED']),
  to: z.enum(['WIP', 'REVIEW', 'APPROVED']),
  actorId: z.string().min(1),
  actorName: z.string().min(1),
  at: z.string().min(1),
  note: z.string().optional(),
});
export type ApprovalEvent = z.infer<typeof approvalEventSchema>;

export const projectCollaborationStateSchema = z.object({
  revision: z.number().int().nonnegative().default(0),
  members: z.array(projectMemberSchema).default([]),
  comments: z.array(reviewCommentSchema).default([]),
  annotations: z.array(frameAnnotationSchema).default([]),
  versions: z.array(shotVersionRecordSchema).default([]),
  approvals: z.array(approvalEventSchema).default([]),
}).default({ revision: 0, members: [], comments: [], annotations: [], versions: [], approvals: [] });

export type ProjectCollaborationState = z.infer<typeof projectCollaborationStateSchema>;
