import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import { assertJsonBudget } from '../fields/data-budget.ts';
import { objectValue } from '../fields/json-value.ts';
import type { DocumentData } from '../definition.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

const snapshotSchema = z.strictObject({
  actorId: z.uuid(),
  delegationId: z.uuid().nullable(),
  collection: z.string(),
  locale: z.string(),
  behaviorHash: z.string(),
  expiresAt: z.number().int().positive(),
  data: z.custom<DocumentData>(objectValue),
});

function signature(runtime: ContentRuntime, payload: string): Buffer {
  return createHmac('sha256', runtime.policy.rateLimitSecret)
    .update('cms:editor-initial-snapshot:v1\0')
    .update(payload)
    .digest();
}

export function initialSnapshot(
  state: ContentState,
  runtime: ContentRuntime,
  data: DocumentData,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      actorId: state.actor.id,
      delegationId: state.actor.delegation?.id ?? null,
      collection: state.collection.key,
      locale: state.locale,
      behaviorHash: runtime.registry.behaviorHash,
      expiresAt: Date.now() + runtime.policy.sessionTtlMs,
      data,
    }),
  ).toString('base64url');
  return `${payload}.${signature(runtime, payload).toString('base64url')}`;
}

export function readInitialSnapshot(
  state: ContentState,
  runtime: ContentRuntime,
  token: string,
): DocumentData {
  if (Buffer.byteLength(token) > runtime.limits.maxResponseBytes) fail('capacity_exceeded');
  const [payload, signed, extra] = token.split('.');
  if (!payload || !signed || extra !== undefined) fail('invalid_input');
  const expected = signature(runtime, payload);
  const received = Buffer.from(signed, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    fail('invalid_input');
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    fail('invalid_input');
  }
  const result = snapshotSchema.safeParse(raw);
  if (!result.success) fail('invalid_input');
  const value = result.data;
  requireSnapshotAuthority(state, runtime, value);
  assertJsonBudget(value.data, {
    maxDepth: runtime.limits.maxFieldDepth * 2 + runtime.limits.maxRichTextDepth * 2 + 1,
    maxBytes: runtime.limits.maxDataBytes,
    maxNodes: runtime.limits.maxDataBytes,
  });
  return value.data;
}

function requireSnapshotAuthority(
  state: ContentState,
  runtime: ContentRuntime,
  value: z.infer<typeof snapshotSchema>,
): void {
  if (
    value.actorId !== state.actor.id ||
    value.delegationId !== (state.actor.delegation?.id ?? null) ||
    value.collection !== state.collection.key ||
    value.locale !== state.locale ||
    value.behaviorHash !== runtime.registry.behaviorHash ||
    value.expiresAt <= Date.now()
  )
    fail('version_conflict');
}
