import { z } from 'zod';
import type { AdminDetail, RoleListItem } from '../../contracts/access';
import { authEmailSchema } from '../auth/login-input';
import { formString } from '../auth/password-rules';

export interface AdminCreateValues {
  email: string;
  displayName: string | null;
  roleId: string;
}
export interface AdminEditValues {
  displayName: string;
  roleId: string;
  status: 'active' | 'disabled' | 'archived';
}
export interface AdminErrors {
  email?: 'emailInvalid' | undefined;
  displayName?: 'nameInvalid' | undefined;
  roleId?: 'roleInvalid' | 'ownProtected' | undefined;
  status?: 'statusInvalid' | 'ownProtected' | undefined;
}
export interface AdminPatch {
  version: number;
  displayName?: string | null;
  roleId?: string;
  status?: 'active' | 'disabled' | 'archived';
}

function activeRole(roles: readonly RoleListItem[], id: string) {
  return (
    z.uuid().safeParse(id).success &&
    roles.some((role) => role.id === id && role.status === 'active')
  );
}

export function createAdminInput(data: FormData, roles: readonly RoleListItem[]) {
  const email = authEmailSchema.safeParse(formString(data, 'email'));
  const name = formString(data, 'displayName');
  const roleId = formString(data, 'roleId');
  const errors: AdminErrors = {};
  if (!email.success) errors.email = 'emailInvalid';
  if (name.length > 64) errors.displayName = 'nameInvalid';
  if (!activeRole(roles, roleId)) errors.roleId = 'roleInvalid';
  const body: AdminCreateValues = {
    email: email.success ? email.data : '',
    displayName: name === '' ? null : name,
    roleId,
  };
  return { errors, body, valid: Object.keys(errors).length === 0 };
}

export function editValues(admin: AdminDetail): AdminEditValues {
  return { displayName: admin.displayName ?? '', roleId: admin.roleId, status: admin.status };
}

export function editAdminInput(input: {
  data: FormData;
  current: AdminDetail;
  principalId: string;
  roles: readonly RoleListItem[];
}) {
  const { current, data } = input;
  const values = editValues(current);
  values.displayName = formString(data, 'displayName');
  if (data.has('roleId')) values.roleId = formString(data, 'roleId');
  const status = data.has('status') ? formString(data, 'status') : current.status;
  const errors: AdminErrors = {};
  const body: AdminPatch = { version: current.version };
  if (values.displayName.length > 64) errors.displayName = 'nameInvalid';
  const displayName = values.displayName === '' ? null : values.displayName;
  if (displayName !== current.displayName) body.displayName = displayName;
  if (values.roleId !== current.roleId) {
    if (input.principalId === current.id) errors.roleId = 'ownProtected';
    else if (!activeRole(input.roles, values.roleId)) errors.roleId = 'roleInvalid';
    else body.roleId = values.roleId;
  }
  if (status !== current.status) {
    if (input.principalId === current.id) errors.status = 'ownProtected';
    else if (current.status === 'archived' || !isAdminStatus(status))
      errors.status = 'statusInvalid';
    else body.status = status;
  }
  return {
    errors,
    body,
    valid: Object.keys(errors).length === 0,
    changed: Object.keys(body).length > 1,
    revokes: revokesIdentity(body),
  };
}

function isAdminStatus(value: string): value is AdminEditValues['status'] {
  return value === 'active' || value === 'disabled' || value === 'archived';
}

export function focusAdminError(form: HTMLFormElement, errors: AdminErrors) {
  const [first] = Object.keys(errors);
  const field = first ? form.elements.namedItem(first) : null;
  if (field instanceof HTMLElement) field.focus();
}

export function revokesIdentity(patch: AdminPatch) {
  return patch.roleId !== undefined || patch.status !== undefined;
}
