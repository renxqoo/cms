import { z } from 'zod';

const id = z.uuid();
const time = z.iso.datetime();

export const loginResponseSchema = z.object({ expiresAt: time });
export const emptyResponseSchema = z.undefined();
export const resetAcceptedSchema = z.object({ accepted: z.literal(true) });

export const meSchema = z.object({
  id,
  version: z.number().int().positive(),
  createdAt: time,
  updatedAt: time,
  email: z.email(),
  displayName: z.string().nullable(),
  roleId: id,
  roleCode: z.string(),
  status: z.enum(['active', 'disabled', 'archived']),
  activation: z.enum(['pending', 'activated']),
  lastLoginAt: time.nullable(),
  role: z.object({
    id,
    code: z.string(),
    name: z.string(),
    status: z.enum(['active', 'disabled']),
    isSuper: z.boolean(),
  }),
});

export type Me = z.infer<typeof meSchema>;

export const allowedOperationSchema = z.object({
  operationId: z.string(),
  scopeKind: z.enum(['global', 'collection']),
  collectionKey: z.string().nullable(),
});

export type AllowedOperation = z.infer<typeof allowedOperationSchema>;

export const allowedOperationsSchema = z.object({
  rows: z.array(allowedOperationSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export interface VisibleNavigation {
  id: string;
  type: 'group' | 'page' | 'action';
  name: string;
  path: string | null;
  icon: string | null;
  children: VisibleNavigation[];
}

const visibleNavigationSchema: z.ZodType<VisibleNavigation> = z.object({
  id,
  type: z.enum(['group', 'page', 'action']),
  name: z.string(),
  path: z.string().nullable(),
  icon: z.string().nullable(),
  children: z.lazy(() => z.array(visibleNavigationSchema)),
});

export const myNavigationSchema = z.object({ rows: z.array(visibleNavigationSchema) });
