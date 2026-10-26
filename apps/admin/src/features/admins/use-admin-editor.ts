'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { editAdminInput, editValues, focusAdminError } from './admin-input';
import type { AdminEditValues } from './admin-input';
import { initialAdminEditor } from './admin-editor-state';
import type { AdminEditorContext, AdminEditorInput } from './admin-editor-state';
import { inspectAdmin, inviteAdmin, saveAdmin } from './admin-editor-actions';

export function useAdminEditor(input: AdminEditorInput) {
  const [state, setState] = useState(initialAdminEditor);
  const active = useRef<AbortController | null>(null);
  const inviteIntent = useRef<AdminEditorContext['inviteIntent']['current']>(null);
  useEffect(() => () => active.current?.abort(), []);
  const observed =
    state.confirmed && state.confirmed.version > input.admin.version
      ? state.confirmed
      : input.admin;
  const baseline = state.base ?? observed;
  const values = { ...editValues(baseline), ...state.draft };
  const locked = state.error?.uncertain === true || state.error?.error.code === 'version_conflict';
  const context: AdminEditorContext = {
    ...input,
    state,
    setState,
    active,
    inviteIntent,
    baseline,
    observed,
  };
  return {
    ...state,
    values,
    baseline,
    observed,
    delivery:
      state.invitation && input.admin === state.invitationSource
        ? state.invitation.delivery
        : observed.invitationDelivery,
    locked,
    dirty: editorDirty(state, baseline, values),
    change: <Key extends keyof AdminEditValues>(field: Key, value: AdminEditValues[Key]) =>
      changeAdminDraft(context, field, value),
    submit: (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      return prepareAdminSave(context, event.currentTarget);
    },
    confirm: () => confirmAdminSave(context),
    cancelConfirmation: () => cancelAdminConfirmation(context),
    invite: () => inviteAdmin(context),
    inspect: () => inspectAdmin(context),
    continueEditing: () => continueEditing(context),
  };
}

function editorDirty(
  state: AdminEditorContext['state'],
  baseline: AdminEditorContext['baseline'],
  values: AdminEditValues,
) {
  return (
    values.displayName !== (baseline.displayName ?? '') ||
    values.roleId !== baseline.roleId ||
    values.status !== baseline.status ||
    state.phase !== 'idle' ||
    state.confirmation !== null ||
    state.error?.uncertain === true ||
    state.error?.error.code === 'version_conflict'
  );
}

function changeAdminDraft<Key extends keyof AdminEditValues>(
  context: AdminEditorContext,
  field: Key,
  value: AdminEditValues[Key],
) {
  const { active, state, setState, baseline } = context;
  if (active.current || state.error?.uncertain || state.error?.error.code === 'version_conflict')
    return;
  setState((previous) => ({
    ...previous,
    base: previous.base ?? baseline,
    draft: { ...previous.draft, [field]: value },
    errors: { ...previous.errors, [field]: undefined },
    success: null,
  }));
}

async function confirmAdminSave(context: AdminEditorContext) {
  const patch = context.state.confirmation;
  if (!patch) return;
  if (
    patch.roleId !== undefined &&
    !context.roles.some((role) => role.id === patch.roleId && role.status === 'active')
  )
    return;
  await saveAdmin(context, patch);
}

function cancelAdminConfirmation(context: AdminEditorContext) {
  if (!context.active.current)
    context.setState((previous) => ({ ...previous, confirmation: null }));
}

function continueEditing(context: AdminEditorContext) {
  const { active, state, setState, observed } = context;
  if (
    !state.inspected ||
    active.current ||
    (state.error?.uncertain && state.lastOperation === 'invite')
  )
    return;
  setState((previous) => ({
    ...previous,
    base: observed,
    error: null,
    inspected: false,
    inspectionError: null,
  }));
}

async function prepareAdminSave(context: AdminEditorContext, form: HTMLFormElement) {
  const { active, state, setState, baseline } = context;
  if (
    active.current ||
    !context.canSave ||
    state.error?.uncertain ||
    state.error?.error.code === 'version_conflict'
  )
    return;
  const data = new FormData(form);
  if (state.draft.roleId !== undefined) data.set('roleId', state.draft.roleId);
  const values = editAdminInput({
    data,
    current: baseline,
    principalId: context.principalId,
    roles: context.roles,
  });
  setState((previous) => ({ ...previous, errors: values.errors }));
  if (!values.valid) return focusAdminError(form, values.errors);
  if (!values.changed)
    return setState((previous) => ({ ...previous, base: null, draft: {}, success: 'unchanged' }));
  if (values.revokes) return setState((previous) => ({ ...previous, confirmation: values.body }));
  return saveAdmin(context, values.body);
}
