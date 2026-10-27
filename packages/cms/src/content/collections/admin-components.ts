import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import { allFieldDefinitions } from '../fields/structure.ts';
import type { CollectionDefinition } from '../definition.ts';
import type { AdminComponentRegistration } from '../collections/admin-types.ts';

import {
  adminComponentReferenceSchema,
  adminComponentListSchema,
  componentIdSchema,
  componentId,
  componentReferences,
} from './admin-component-reference.ts';
export const fieldComponentsSchema = z.strictObject({
  Field: adminComponentReferenceSchema.optional(),
  Label: adminComponentReferenceSchema.optional(),
  Description: adminComponentReferenceSchema.optional(),
  Error: adminComponentReferenceSchema.optional(),
  Cell: adminComponentReferenceSchema.optional(),
  Filter: adminComponentReferenceSchema.optional(),
  Diff: adminComponentReferenceSchema.optional(),
  RowLabel: adminComponentReferenceSchema.optional(),
  Block: adminComponentReferenceSchema.optional(),
  beforeInput: adminComponentListSchema.optional(),
  afterInput: adminComponentListSchema.optional(),
});
export const collectionComponentsSchema = z.strictObject({
  Header: adminComponentReferenceSchema.optional(),
  List: adminComponentReferenceSchema.optional(),
  Edit: adminComponentReferenceSchema.optional(),
  Description: adminComponentReferenceSchema.optional(),
  beforeList: adminComponentListSchema.optional(),
  afterList: adminComponentListSchema.optional(),
  beforeEdit: adminComponentListSchema.optional(),
  afterEdit: adminComponentListSchema.optional(),
  beforeListTable: adminComponentListSchema.optional(),
  afterListTable: adminComponentListSchema.optional(),
  listMenuItems: adminComponentListSchema.optional(),
  ListActions: adminComponentListSchema.optional(),
  NoResults: adminComponentReferenceSchema.optional(),
  beforeDocumentControls: adminComponentListSchema.optional(),
  BeforeDocumentMeta: adminComponentListSchema.optional(),
  editMenuItems: adminComponentListSchema.optional(),
  PreviewButton: adminComponentReferenceSchema.optional(),
  PublishButton: adminComponentReferenceSchema.optional(),
  SaveButton: adminComponentReferenceSchema.optional(),
  SaveDraftButton: adminComponentReferenceSchema.optional(),
  Status: adminComponentReferenceSchema.optional(),
  UnpublishButton: adminComponentReferenceSchema.optional(),
  Upload: adminComponentReferenceSchema.optional(),
  View: adminComponentReferenceSchema.optional(),
  ViewActions: adminComponentListSchema.optional(),
  Icon: adminComponentReferenceSchema.optional(),
  SmallIcon: adminComponentReferenceSchema.optional(),
});
const callbackSchema = z.strictObject({
  version: z.string().min(1).max(128),
  run: z.custom<(...args: never[]) => unknown>(
    (value) =>
      typeof value === 'function' &&
      ['[object Function]', '[object AsyncFunction]'].includes(
        Object.prototype.toString.call(value),
      ),
  ),
});
export const adminComponentSlotSchema = z.enum([
  'Field',
  'Label',
  'Description',
  'Error',
  'Cell',
  'Filter',
  'Diff',
  'RowLabel',
  'Block',
  'beforeInput',
  'afterInput',
  'Header',
  'List',
  'Edit',
  'beforeList',
  'afterList',
  'beforeEdit',
  'afterEdit',
  'beforeListTable',
  'afterListTable',
  'listMenuItems',
  'ListActions',
  'NoResults',
  'beforeDocumentControls',
  'BeforeDocumentMeta',
  'editMenuItems',
  'PreviewButton',
  'PublishButton',
  'SaveButton',
  'SaveDraftButton',
  'Status',
  'UnpublishButton',
  'Upload',
  'View',
  'ViewActions',
  'Icon',
  'SmallIcon',
]);
const registrationSchema = z.strictObject({
  id: componentIdSchema,
  version: z.string().min(1).max(128),
  slots: z.array(adminComponentSlotSchema).min(1),
  validateProps: callbackSchema.optional(),
  resolveProps: callbackSchema.optional(),
});
function validateReferences(
  components: object | undefined,
  registrations: ReadonlyMap<string, AdminComponentRegistration>,
): void {
  for (const [slot, value] of Object.entries(components ?? {})) {
    const configured = componentReferences(value);
    for (const reference of configured) {
      const id = componentId(reference);
      if (id === undefined) continue;
      const registration = registrations.get(id);
      if (!registration?.slots.some((allowed) => allowed === slot)) fail('invalid_input');
      if (
        typeof reference === 'object' &&
        Object.keys(reference.props ?? {}).length > 0 &&
        !registration.validateProps
      )
        fail('invalid_input');
    }
  }
}

export function adminComponentRegistry(input: {
  registrations: readonly AdminComponentRegistration[];
  collections: readonly CollectionDefinition[];
  maximum: number;
}): readonly AdminComponentRegistration[] {
  if (input.registrations.length > input.maximum) fail('capacity_exceeded');
  const parsed = z.array(registrationSchema).safeParse(input.registrations);
  if (!parsed.success || new Set(parsed.data.map((item) => item.id)).size !== parsed.data.length)
    fail('invalid_input');
  const registrations = new Map(
    input.registrations.map((registration) => [registration.id, registration]),
  );
  for (const registration of registrations.values()) validateRegistration(registration);
  for (const collection of input.collections)
    validateCollectionReferences(collection, registrations);
  return input.registrations;
}

function identifiers(components: object | undefined): string[] {
  return Object.values(components ?? {}).flatMap((value) =>
    componentReferences(value).flatMap((reference) => {
      const id = componentId(reference);
      return id ? [id] : [];
    }),
  );
}
export function registeredComponentVersions(
  registrations: readonly AdminComponentRegistration[],
  components: readonly (object | undefined)[],
): Record<string, string> {
  const used = new Set(components.flatMap(identifiers));
  return Object.fromEntries(
    registrations
      .filter((registration) => used.has(registration.id))
      .map(({ id, version }) => [id, version]),
  );
}

function validateRegistration(registration: AdminComponentRegistration): void {
  if (registration.resolveProps && !registration.validateProps) fail('invalid_input');
  if (new Set(registration.slots).size !== registration.slots.length) fail('invalid_input');
}
function validateCollectionReferences(
  collection: CollectionDefinition,
  registrations: ReadonlyMap<string, AdminComponentRegistration>,
): void {
  validateReferences(collection.admin?.components, registrations);
  const fields = [
    ...collection.fields,
    ...Object.values(collection.queryPresetConstraints ?? {}).flatMap((constraints) =>
      (constraints ?? []).flatMap((constraint) => constraint.fields ?? []),
    ),
  ];
  for (const field of allFieldDefinitions(fields)) {
    validateReferences(field.admin?.components, registrations);
    for (const block of field.blocks ?? [])
      validateReferences(block.admin?.components, registrations);
  }
  validateViews(collection, registrations);
  const { hierarchy } = collection;
  if (hierarchy && typeof hierarchy === 'object')
    validateReferences(hierarchy.admin?.components, registrations);
}

function validateViews(
  collection: CollectionDefinition,
  registrations: ReadonlyMap<string, AdminComponentRegistration>,
) {
  for (const view of collection.admin?.views ?? [])
    validateReferences({ View: view.component, ViewActions: view.actions }, registrations);
  const views = collection.admin?.views ?? [];
  if (
    new Set(views.map((view) => `${view.scope}:${view.path}`)).size !== views.length ||
    new Set(views.map((view) => view.id)).size !== views.length
  )
    fail('invalid_input');
}
