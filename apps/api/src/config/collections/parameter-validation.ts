import { z } from 'zod';
import type { JsonValue } from '@new-cms/cms/content/generate';
import { validParameterKey, validParameterValue } from './parameter-value.ts';
function optionalMetadata<T extends z.ZodType>(schema: T, keys: readonly string[]) {
  return z.preprocess((value) => {
    const result = z.record(z.string(), z.unknown()).safeParse(value);
    if (!result.success) return value;
    return Object.fromEntries(
      Object.entries(result.data).filter(([key, entry]) => entry !== null || !keys.includes(key)),
    );
  }, schema);
}
const option = z.strictObject({
  id: z.uuid().optional(),
  label: z.string().max(256),
  value: z.string().max(512),
});
const parameter = optionalMetadata(
  z.strictObject({
    id: z.uuid().optional(),
    name: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/u)
      .refine(validParameterKey),
    label: z.string().max(256).optional(),
    description: z.string().max(2000).optional(),
    type: z.enum(['text', 'textarea', 'select', 'number', 'boolean', 'url', 'array', 'object']),
    required: z.boolean().optional(),
    placeholder: z.string().max(2000).optional(),
    defaultValue: z.unknown().optional(),
    options: z.array(option).max(100).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
  }),
  ['description', 'placeholder', 'defaultValue', 'min', 'max', 'step', 'required'],
);
const constraint = optionalMetadata(
  z.strictObject({
    id: z.uuid().optional(),
    field: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/u),
    required: z.boolean().optional(),
    allowedValues: z
      .array(z.union([z.string(), z.number(), z.boolean()]))
      .max(256)
      .optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  ['required', 'allowedValues', 'min', 'max'],
);
const reference = z.strictObject({
  fields: z.array(parameter).max(100),
  scenarios: z
    .array(
      optionalMetadata(
        z.strictObject({
          id: z.uuid().optional(),
          key: z
            .string()
            .min(1)
            .max(80)
            .refine((value) => value.trim().length > 0),
          title: z.string().max(256).optional(),
          description: z.string().max(2000).optional(),
          values: z.record(z.string(), z.unknown()),
          inputConstraints: z.array(constraint).max(100).optional(),
        }),
        ['description'],
      ),
    )
    .max(100)
    .optional(),
  defaultScenarioKey: z
    .string()
    .min(1)
    .max(80)
    .refine((value) => value.trim().length > 0)
    .nullable()
    .optional(),
});
type Parameter = z.infer<typeof parameter>;
type Constraint = z.infer<typeof constraint>;
type EffectiveParameter = Parameter & {
  allowedValues?: (string | number | boolean)[];
  stepBase?: number;
  disabled?: boolean;
};
function valueMatches(field: EffectiveParameter, value: unknown): boolean {
  if (field.disabled) return value === undefined;
  if (value !== undefined && !validParameterValue(value)) return false;
  if (
    value !== undefined &&
    field.allowedValues &&
    !field.allowedValues.some((allowed) => allowed === value)
  )
    return false;
  if (value === undefined) return field.required !== true;
  if (field.type === 'array') return Array.isArray(value) && validCount(field, value.length);
  if (field.type === 'object') return validObject(field, value);
  if (field.type === 'boolean') return typeof value === 'boolean';
  if (field.type === 'number') return validNumber(field, value);
  return validText(field, value);
}
function validObject(field: Parameter, value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    validCount(field, Object.keys(value).length)
  );
}
function validText(field: Parameter, value: unknown) {
  if (typeof value !== 'string') return false;
  if (field.required && value.trim() === '') return false;
  if (field.type === 'select') return field.options?.some((item) => item.value === value) === true;
  return field.type !== 'url' || validPublicUrl(value);
}
function validNumber(field: EffectiveParameter, value: unknown): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (
    (field.min !== undefined && value < field.min) ||
    (field.max !== undefined && value > field.max)
  )
    return false;
  if (field.step === undefined) return true;
  const steps = (value - (field.stepBase ?? field.min ?? 0)) / field.step;
  return Math.abs(steps - Math.round(steps)) <= Number.EPSILON * Math.max(1, Math.abs(steps)) * 8;
}
function validPublicUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !host.includes(':') &&
      !/^\d+(?:\.\d+){3}$/u.test(host) &&
      host.includes('.') &&
      !['.local', '.localhost', '.internal', '.test', '.example', '.invalid'].some((suffix) =>
        host.endsWith(suffix),
      )
    );
  } catch {
    return false;
  }
}
function checkField(field: Parameter): boolean {
  if (
    ['array', 'object'].includes(field.type) &&
    (field.step !== undefined ||
      [field.min, field.max].some(
        (bound) => bound !== undefined && (!Number.isInteger(bound) || bound < 0),
      ))
  )
    return false;
  if (field.min !== undefined && field.max !== undefined && field.min > field.max) return false;
  if (
    field.type === 'select' &&
    (!field.options?.length ||
      new Set(field.options.map((item) => item.value)).size !== field.options.length)
  )
    return false;
  return field.defaultValue === undefined || valueMatches(field, field.defaultValue);
}
export function validParameterReference(value: JsonValue): boolean {
  const result = reference.safeParse(value);
  if (!result.success) return false;
  const { data } = result;
  if (
    new Set(data.fields.map((item) => item.name)).size !== data.fields.length ||
    !data.fields.every(checkField)
  )
    return false;
  const scenarios = data.scenarios ?? [];
  const keys = scenarios.map((item) => item.key);
  if (
    new Set(keys).size !== keys.length ||
    (data.defaultScenarioKey && !keys.includes(data.defaultScenarioKey))
  )
    return false;
  return scenarios.every((scenario) => {
    const fields = effectiveFields(data.fields, scenario.inputConstraints ?? []);
    if (!fields) return false;
    return (
      Object.keys(scenario.values).every((name) => fields.some((item) => item.name === name)) &&
      fields.every((definition) =>
        valueMatches(
          definition,
          Object.hasOwn(scenario.values, definition.name)
            ? scenario.values[definition.name]
            : definition.defaultValue,
        ),
      )
    );
  });
}
function validCount(field: Parameter, count: number) {
  return (
    !(field.required && count === 0) &&
    (field.min === undefined || count >= field.min) &&
    (field.max === undefined || count <= field.max)
  );
}
function effectiveFields(
  fields: Parameter[],
  constraints: Constraint[],
): EffectiveParameter[] | null {
  if (
    new Set(constraints.map((item) => item.field)).size !== constraints.length ||
    constraints.some((item) => !fields.some((field) => field.name === item.field))
  )
    return null;
  const result: EffectiveParameter[] = [];
  for (const field of fields) {
    const override = constraints.find((item) => item.field === field.name);
    const effective = override ? effectiveField(field, override) : field;
    if (!effective) return null;
    result.push(effective);
  }
  return result;
}
function effectiveField(field: Parameter, override: Constraint): EffectiveParameter | null {
  if (!validOverride(field, override)) return null;
  const effective: EffectiveParameter = { ...field, stepBase: field.min ?? 0 };
  if (override.required !== undefined) effective.required = override.required;
  if (override.min !== undefined) effective.min = Math.max(field.min ?? -Infinity, override.min);
  if (override.max !== undefined) effective.max = Math.min(field.max ?? Infinity, override.max);
  if (effective.min !== undefined && effective.max !== undefined && effective.min > effective.max)
    return null;
  if (!applyChoices(effective, override) || !validRequired(effective)) return null;
  repairDefault(effective);
  return effective;
}
function validOverride(field: Parameter, override: Constraint) {
  if ((override.min !== undefined || override.max !== undefined) && field.type !== 'number')
    return false;
  return (
    !override.allowedValues ||
    new Set(override.allowedValues).size === override.allowedValues.length
  );
}
function applyChoices(field: EffectiveParameter, override: Constraint) {
  if (!override.allowedValues) return true;
  field.allowedValues = override.allowedValues;
  field.disabled = override.allowedValues.length === 0;
  if (field.type === 'select')
    field.options = field.options?.filter((item) => override.allowedValues?.includes(item.value));
  return override.allowedValues.every((value) => valueMatches(field, value));
}
function validRequired(field: EffectiveParameter) {
  if (!field.required) return true;
  if (field.disabled || (field.type === 'select' && !field.options?.length)) return false;
  return (
    field.type !== 'number' ||
    fallbackValues(field).some((value) => value !== undefined && valueMatches(field, value))
  );
}
function repairDefault(field: EffectiveParameter) {
  if (field.disabled) {
    delete field.defaultValue;
    return;
  }
  if (field.defaultValue === undefined || valueMatches(field, field.defaultValue)) return;
  const replacement = fallbackValues(field).find((value) => valueMatches(field, value));
  if (replacement === undefined) delete field.defaultValue;
  else field.defaultValue = replacement;
}
function fallbackValues(field: EffectiveParameter): unknown[] {
  const result: unknown[] = [
    field.defaultValue,
    ...(field.allowedValues ?? []),
    ...(field.options?.map((item) => item.value) ?? []),
  ];
  if (field.type === 'number') {
    const base = field.stepBase ?? field.min ?? 0;
    const floor = field.min ?? Math.min(0, field.max ?? 0);
    result.push(field.step ? base + Math.ceil((floor - base) / field.step) * field.step : floor);
  }
  if (field.type === 'boolean') result.push(false, true);
  if (!field.required) result.push(undefined);
  return result;
}
export function validProvenance(value: JsonValue): boolean {
  return z
    .strictObject({
      kind: z.enum(['illustration', 'model-output']),
      sourceLabel: z
        .string()
        .min(1)
        .max(256)
        .refine((entry) => entry.trim().length > 0),
      sourceUrl: z
        .url()
        .refine((url) => {
          const target = new URL(url);
          return target.protocol === 'https:' && !target.username && !target.password;
        })
        .optional(),
      createdAt: z.iso.datetime({ offset: true }).optional(),
    })
    .safeParse(value).success;
}
