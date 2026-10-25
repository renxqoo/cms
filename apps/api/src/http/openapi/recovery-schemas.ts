import { z } from 'zod';
import { recoveryPageSchema } from '@new-cms/cms/access';
import { outputSchema } from './output-schema.ts';
import { inputProperties } from './input-schema.ts';
import type { InputSchema } from './input-schema.ts';
import type { Schema } from './schema.ts';

export function recoveryResponseSchemas(): Record<string, Schema> {
  return { RecoveryPage: outputSchema('RecoveryPage', recoveryPageSchema) };
}

function resourceName(branch: InputSchema): string {
  return z.object({ const: z.string() }).parse(branch.properties?.['resource']).const;
}

function queryParameter(name: string, branches: InputSchema[]) {
  const applicable = branches.filter((branch) => Object.hasOwn(branch.properties ?? {}, name));
  const variants = new Map(
    applicable.map((branch) => {
      const value = branch.properties?.[name];
      return [JSON.stringify(value), value];
    }),
  );
  const values = [...variants.values()];
  const scope =
    name === 'collectionKey'
      ? ' Requires scopeKind=collection; it filters resources and never changes global authorization.'
      : '';
  return {
    name,
    in: 'query',
    required: branches.every((branch) => branch.required?.includes(name)),
    schema: values.length === 1 ? values[0] : { anyOf: values },
    description: `Applies to resource=${applicable.map(resourceName).join('|')}.${scope}`,
  };
}

export function recoveryOperationInput(schema: z.ZodType) {
  const input = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  const branches: InputSchema[] = input.oneOf ?? input.anyOf ?? [input];
  return {
    parameters: Object.keys(inputProperties(input)).map((name) => queryParameter(name, branches)),
    description:
      'Recovery reads require an active super administrator. Send one resource discriminator and only filters applicable to that resource. Query scope filters resources while authorization remains global. Duplicate parameters and invalid scope combinations return invalid_input with fieldErrors. GET and HEAD do not read request bodies or require an idempotency key.',
    'x-query-schema': {
      ...input,
      dependentSchemas: {
        collectionKey: {
          required: ['scopeKind'],
          properties: { scopeKind: { const: 'collection' } },
        },
      },
    },
  };
}
