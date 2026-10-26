import { z } from 'zod';
import type { Permission } from '../../contracts/access';

export interface RoleValues {
  name: string;
  description: string | null;
  status: 'active' | 'disabled';
}

export const roleValuesSchema = z.object({
  name: z.string().trim().min(1).max(128),
  description: z.string().max(512).nullable(),
  status: z.enum(['active', 'disabled']),
});

export const createRoleSchema = roleValuesSchema.omit({ status: true }).extend({
  code: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/)
    .refine((code) => code !== 'super_admin'),
});

export function roleValues(role: RoleValues): RoleValues {
  return { name: role.name, description: role.description, status: role.status };
}

export function metadataChanges(before: RoleValues, after: RoleValues) {
  return {
    ...(before.name === after.name ? {} : { name: after.name }),
    ...(before.description === after.description ? {} : { description: after.description }),
    ...(before.status === after.status ? {} : { status: after.status }),
  };
}

export function sameGrants(first: readonly string[], second: readonly string[]): boolean {
  return (
    first.length === second.length &&
    new Set(first).size === first.length &&
    first.every((id) => second.includes(id))
  );
}

export function blockedGrantIds(
  ids: readonly string[],
  permissions: readonly Permission[],
): string[] {
  return ids.filter(
    (id) => permissions.find((permission) => permission.id === id)?.status !== 'active',
  );
}

export function roleFormValues(form: FormData): RoleValues {
  const name = form.get('name');
  const description = form.get('description');
  return {
    name: typeof name === 'string' ? name : '',
    description: typeof description === 'string' && description !== '' ? description : null,
    status: form.get('status') === 'disabled' ? 'disabled' : 'active',
  };
}
