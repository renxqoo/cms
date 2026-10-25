import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ApiResult } from '../../api/result';
import type { AdminDetail, InvitationCreated, RoleListItem } from '../../contracts/access';
import type { AdminEditValues, AdminErrors, AdminPatch } from './admin-input';

export interface AdminEditorState {
  confirmed: AdminDetail | null;
  base: AdminDetail | null;
  draft: Partial<AdminEditValues>;
  phase: 'idle' | 'saving' | 'inviting' | 'checking';
  error: Extract<ApiResult<unknown>, { ok: false }> | null;
  inspectionError: Extract<ApiResult<unknown>, { ok: false }> | null;
  errors: AdminErrors;
  inspected: boolean;
  success: 'saved' | 'unchanged' | 'verified' | 'inviteSent' | null;
  revoked: boolean;
  invitation: InvitationCreated | null;
  invitationSource: AdminDetail | null;
  confirmation: AdminPatch | null;
  submittedPatch: AdminPatch | null;
  lastOperation: 'save' | 'invite' | null;
}

export interface AdminEditorInput {
  admin: AdminDetail;
  principalId: string;
  roles: readonly RoleListItem[];
  canSave: boolean;
  canInvite: boolean;
  canRead: boolean;
  reportResult: (result: ApiResult<unknown>) => void;
  onChanged: () => void;
}

export interface AdminEditorContext extends AdminEditorInput {
  state: AdminEditorState;
  baseline: AdminDetail;
  observed: AdminDetail;
  active: RefObject<AbortController | null>;
  inviteIntent: RefObject<{ key: string; settled: boolean } | null>;
  setState: Dispatch<SetStateAction<AdminEditorState>>;
}

export function initialAdminEditor(): AdminEditorState {
  return {
    confirmed: null,
    base: null,
    draft: {},
    phase: 'idle',
    error: null,
    inspectionError: null,
    errors: {},
    inspected: false,
    success: null,
    revoked: false,
    invitation: null,
    invitationSource: null,
    confirmation: null,
    submittedPatch: null,
    lastOperation: null,
  };
}

export function patchMatches(patch: AdminPatch, admin: AdminDetail) {
  return (
    (patch.displayName === undefined || patch.displayName === admin.displayName) &&
    (patch.roleId === undefined || patch.roleId === admin.roleId) &&
    (patch.status === undefined || patch.status === admin.status)
  );
}
