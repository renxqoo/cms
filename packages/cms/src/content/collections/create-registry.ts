import { normalizeNativeFields } from './native-fields.ts';
import { normalizeDrafts } from './draft-config.ts';
import { normalizeAuthorship } from '../authorship/config.ts';
import { validateNodeRegistrations } from '../fields/rich-text-nodes.ts';
import { validateDataShape } from '../fields/validate-shape.ts';
import { createHash } from 'node:crypto';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CollectionDefinition, ContentLimits, ContentRegistry } from '../definition.ts';
import type { AdminComponentRegistration } from '../collections/admin-types.ts';
import { adminComponentRegistry } from './admin-components.ts';
import { collectionSchema } from './config-schema.ts';
import { validateDefinition, validateRelations } from './validate-definition.ts';
import { prepareHierarchyCollections } from './hierarchy-config.ts';
import { validateHierarchy } from './validate-hierarchy.ts';
import {
  validatePresetConstraints,
  normalizePresetParameterFields,
} from '../queries/preset-metadata.ts';

function freeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function canonical(value: unknown): unknown {
  if (typeof value === 'function') return '[versioned function]';
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function definitionFingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
export function createRegistry(input: {
  collections: readonly CollectionDefinition[];
  limits: ContentLimits;
  operations?: readonly Pick<OperationDefinition, 'id' | 'scopeKind'>[];
  adminComponents?: readonly AdminComponentRegistration[];
}): ContentRegistry {
  const definitions: CollectionDefinition[] = [];
  const keys = new Set<string>();
  const identities = new Set<string>();
  for (const raw of normalizeDefinitions(input.collections)) {
    const parsed = collectionSchema.safeParse(raw);
    if (!parsed.success) fail('invalid_input');
    const collection = parsed.data;
    if (!isCollectionDefinition(collection)) fail('invalid_input');
    if (keys.has(collection.key) || identities.has(collection.id)) fail('invalid_input');
    keys.add(collection.key);
    identities.add(collection.id);
    validateOperationKeys(collection, input.operations ?? []);
    validateDefinition(collection, input.limits);
    validatePresetConstraints(collection, input.limits);
    validateNodeRegistrations(collection.richTextNodes ?? []);
    validateDataShape({
      collection,
      data: {},
      mode: 'draft',
      locale: collection.locales.default,
      limits: input.limits,
      applyDefaults: true,
    });
    for (const previous of collection.previousSchemas ?? []) {
      validateDefinition(previous, input.limits, true);
      validateNodeRegistrations(previous.richTextNodes ?? []);
    }
    definitions.push(freeze(collection));
  }
  validateRelations(definitions, input.limits);
  validateHierarchy(definitions, input.limits);
  const adminComponents = adminComponentRegistry({
    registrations: input.adminComponents ?? [],
    collections: definitions,
    maximum: input.limits.maxFields,
  });
  return registryResult(definitions, adminComponents);
}

function normalizeDefinitions(collections: readonly CollectionDefinition[]) {
  return prepareHierarchyCollections(
    collections
      .map(parseDefinition)
      .map(normalizeAuthorship)
      .map(normalizeDrafts)
      .map(normalizeNativeFields)
      .map(normalizePresetParameterFields),
  );
}

function registryResult(
  definitions: CollectionDefinition[],
  adminComponents: readonly AdminComponentRegistration[],
): ContentRegistry {
  const list = Object.freeze(definitions.toSorted((a, b) => a.id.localeCompare(b.id)));
  const byKey = new Map(list.map((collection) => [collection.key, collection]));
  return Object.freeze({
    list,
    behaviorHash: definitionFingerprint({ collections: list, adminComponents }),
    adminComponents: freeze(adminComponents),
    get(key: string) {
      const collection = byKey.get(key);
      if (!collection) fail('not_found');
      return collection;
    },
  });
}

function isCollectionDefinition(value: unknown): value is CollectionDefinition {
  return collectionSchema.safeParse(value).success;
}

function validateOperationKeys(
  collection: CollectionDefinition,
  operations: readonly Pick<OperationDefinition, 'id' | 'scopeKind'>[],
): void {
  const allowed = new Set(
    operations
      .filter((operation) => operation.scopeKind === 'collection')
      .map((operation) => operation.id),
  );
  if (Object.keys(collection.access ?? {}).some((key) => !allowed.has(key))) fail('invalid_input');
}

function parseDefinition(raw: CollectionDefinition): CollectionDefinition {
  const parsed = collectionSchema.safeParse(raw);
  if (!parsed.success || !isCollectionDefinition(parsed.data)) fail('invalid_input');
  return parsed.data;
}
