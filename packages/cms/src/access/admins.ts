import type { Account } from '@new-cms/cms/identity/composition';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import { effectiveSuperCount } from './adapters/postgres/authorization-store.ts';
import { allResources, resource } from './adapters/postgres/resource-store.ts';
import { auditChange, createRunner, idempotent } from './runtime.ts';
import type { AccessRuntime, Admin, Role } from './types.ts';
import { parse, requirePatch } from './validation.ts';

export function adminProjection(account: Account, role: Role): Admin {
  const { invitationDelivery: _delivery, ...admin } = account;
  return { ...admin, roleCode: role.code };
}

async function activeRole(tx: SqlExecutor, roleId: string) {
  const role = await resource(tx, { table: 'roles', id: roleId });
  if (role.status !== 'active') fail('invalid_input');
  return role;
}

async function loadAdmin(runtime: AccessRuntime, tx: SqlExecutor, adminId: string) {
  const account = await runtime.identity.account(tx, adminId);
  if (!account) fail('not_found');
  const role = await resource(tx, { table: 'roles', id: account.roleId });
  return { ...adminProjection(account, role), invitationDelivery: account.invitationDelivery };
}

async function listAdmins(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'admins.list', mode: 'shared' },
    async ({ tx }) => {
      const page = await runtime.identity.listAccounts(
        tx,
        parse(runtime.schemas['admins.list'], input),
      );
      const roles = new Map((await allResources(tx, 'roles')).map((role) => [role.id, role]));
      const rows = page.rows.map((account) => {
        const role = roles.get(account.roleId);
        if (!role) fail('internal_error');
        return adminProjection(account, role);
      });
      return { ...page, rows };
    },
  );
}

async function getAdmin(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)({ ctx, operationId: 'admins.get', mode: 'shared' }, ({ tx }) => {
    const target = parse(runtime.schemas['admins.get'], input);
    return loadAdmin(runtime, tx, target.id);
  });
}

interface InvitationReference {
  adminId: string;
  deliveryId: string;
}

async function invitationResult(
  runtime: AccessRuntime,
  tx: SqlExecutor,
  reference: InvitationReference,
) {
  const { invitationDelivery: _latest, ...admin } = await loadAdmin(runtime, tx, reference.adminId);
  const delivery = await runtime.identity.delivery(tx, reference.deliveryId);
  if (!delivery) fail('internal_error');
  return { admin, delivery: { id: delivery.id, status: delivery.status } };
}

async function createAdmin(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  let dispatch: (() => void) | undefined;
  const result = await createRunner(runtime)(
    { ctx, operationId: 'admins.create', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['admins.create'], input);
      const reference = await idempotent(
        state,
        { runtime, operationId: 'admins.create', input: values },
        async () => {
          await activeRole(state.tx, values.roleId);
          const account = await runtime.identity.createAccount(state.tx, values);
          const issue = await runtime.identity.issueInvitation(state.tx, account.id, ctx);
          dispatch = () => issue.dispatch();
          await auditChange(
            state,
            {
              operationId: 'admins.create',
              targetType: 'admin',
              targetId: account.id,
              detail: { roleId: account.roleId },
            },
            runtime,
          );
          return { adminId: account.id, deliveryId: issue.delivery.id };
        },
      );
      return invitationResult(runtime, state.tx, reference);
    },
  );
  dispatch?.();
  return result;
}

async function inviteAdmin(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  let dispatch: (() => void) | undefined;
  const result = await createRunner(runtime)(
    { ctx, operationId: 'admins.invite', mode: 'exclusive' },
    async (state) => {
      const target = parse(runtime.schemas['admins.invite'], input);
      const reference = await idempotent(
        state,
        { runtime, operationId: 'admins.invite', input: target },
        async () => {
          const issue = await runtime.identity.issueInvitation(state.tx, target.id, ctx);
          dispatch = () => issue.dispatch();
          await auditChange(
            state,
            {
              operationId: 'admins.invite',
              targetType: 'admin',
              targetId: target.id,
              detail: { deliveryId: issue.delivery.id },
            },
            runtime,
          );
          return { adminId: target.id, deliveryId: issue.delivery.id };
        },
      );
      const value = await invitationResult(runtime, state.tx, reference);
      return { adminId: value.admin.id, delivery: value.delivery };
    },
  );
  dispatch?.();
  return result;
}

async function updateAdmin(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'admins.update', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['admins.update'], input);
      requirePatch(values);
      if (
        values.id === state.actor.id &&
        (values.roleId !== undefined || values.status !== undefined)
      )
        fail('protected_resource');
      if (values.roleId !== undefined) await activeRole(state.tx, values.roleId);
      const before = await runtime.identity.account(state.tx, values.id);
      if (!before) fail('not_found');
      const account = await runtime.identity.updateAccount(state.tx, {
        id: values.id,
        version: values.version,
        ...(values.displayName !== undefined ? { displayName: values.displayName } : {}),
        ...(values.roleId !== undefined ? { roleId: values.roleId } : {}),
        ...(values.status !== undefined ? { status: values.status } : {}),
      });
      if ((await effectiveSuperCount(state.tx)) === 0) fail('last_super_admin');
      if (account.version !== before.version)
        await auditChange(
          state,
          {
            operationId: 'admins.update',
            targetType: 'admin',
            targetId: account.id,
            detail: {
              roleId: account.roleId,
              status: account.status,
              displayName: account.displayName,
            },
          },
          runtime,
        );
      const role = await resource(state.tx, { table: 'roles', id: account.roleId });
      return adminProjection(account, role);
    },
  );
}

export function createAdminApi(runtime: AccessRuntime) {
  return {
    listAdmins: (ctx: RequestContext, input: unknown) => listAdmins(runtime, ctx, input),
    getAdmin: (ctx: RequestContext, input: unknown) => getAdmin(runtime, ctx, input),
    createAdmin: (ctx: RequestContext, input: unknown) => createAdmin(runtime, ctx, input),
    inviteAdmin: (ctx: RequestContext, input: unknown) => inviteAdmin(runtime, ctx, input),
    updateAdmin: (ctx: RequestContext, input: unknown) => updateAdmin(runtime, ctx, input),
  };
}
