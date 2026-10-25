import { requestApi } from '../../api/client';
import { adminDetailSchema, adminSchema, invitationCreatedSchema } from '../../contracts/access';
import { revokesIdentity } from './admin-input';
import type { AdminPatch } from './admin-input';
import { patchMatches } from './admin-editor-state';
import type { AdminEditorContext } from './admin-editor-state';

export async function saveAdmin(context: AdminEditorContext, body: AdminPatch) {
  const { active, setState, baseline } = context;
  if (active.current || !context.canSave || context.state.error?.uncertain) return;
  const controller = new AbortController();
  active.current = controller;
  setState((previous) => ({
    ...previous,
    phase: 'saving',
    error: null,
    inspectionError: null,
    success: null,
    inspected: false,
    confirmation: null,
    submittedPatch: body,
    lastOperation: 'save',
  }));
  const result = await requestApi({
    operation: 'admins.update',
    params: { id: baseline.id },
    body,
    response: adminSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted || active.current !== controller) return;
  active.current = null;
  context.reportResult(result);
  if (!result.ok) return setState((previous) => ({ ...previous, phase: 'idle', error: result }));
  const revokes = revokesIdentity(body);
  setState((previous) => ({
    ...previous,
    confirmed: { ...baseline, ...result.data },
    base: null,
    draft: {},
    phase: 'idle',
    success: 'saved',
    revoked: previous.revoked || revokes,
    invitation: revokes ? null : previous.invitation,
    invitationSource: revokes ? null : previous.invitationSource,
  }));
  context.onChanged();
}

export async function inviteAdmin(context: AdminEditorContext) {
  const { active, setState, baseline, inviteIntent, state } = context;
  if (
    active.current ||
    !context.canInvite ||
    baseline.status !== 'active' ||
    baseline.activation !== 'pending'
  )
    return;
  if (state.error?.uncertain && state.lastOperation !== 'invite') return;
  if (!inviteIntent.current || inviteIntent.current.settled)
    inviteIntent.current = { key: crypto.randomUUID(), settled: false };
  const controller = new AbortController();
  active.current = controller;
  setState((previous) => ({
    ...previous,
    phase: 'inviting',
    error: null,
    inspectionError: null,
    success: null,
    lastOperation: 'invite',
  }));
  const result = await requestApi({
    operation: 'admins.invite',
    params: { id: baseline.id },
    body: {},
    idempotencyKey: inviteIntent.current.key,
    response: invitationCreatedSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted || active.current !== controller) return;
  active.current = null;
  context.reportResult(result);
  if (!result.ok) return setState((previous) => ({ ...previous, phase: 'idle', error: result }));
  inviteIntent.current.settled = true;
  setState((previous) => ({
    ...previous,
    phase: 'idle',
    success: 'inviteSent',
    invitation: result.data,
    invitationSource: context.admin,
    revoked: false,
  }));
  context.onChanged();
}

export async function inspectAdmin(context: AdminEditorContext) {
  const { active, setState, state, baseline } = context;
  if (active.current || !context.canRead) return;
  const controller = new AbortController();
  active.current = controller;
  setState((previous) => ({ ...previous, phase: 'checking', inspectionError: null }));
  const result = await requestApi({
    operation: 'admins.get',
    params: { id: baseline.id },
    response: adminDetailSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted || active.current !== controller) return;
  active.current = null;
  context.reportResult(result);
  if (!result.ok)
    return setState((previous) => ({ ...previous, phase: 'idle', inspectionError: result }));
  const matched =
    state.error?.uncertain === true &&
    state.lastOperation === 'save' &&
    state.submittedPatch !== null &&
    patchMatches(state.submittedPatch, result.data);
  const revokes = state.submittedPatch !== null && revokesIdentity(state.submittedPatch);
  setState((previous) => ({
    ...previous,
    phase: 'idle',
    confirmed: result.data,
    inspected: true,
    error: matched ? null : previous.error,
    draft: matched ? {} : previous.draft,
    base: matched ? null : previous.base,
    success: matched ? 'verified' : previous.success,
    revoked: previous.revoked || (matched && revokes),
    invitation: matched && revokes ? null : previous.invitation,
    invitationSource: matched && revokes ? null : previous.invitationSource,
  }));
}
