import { validParameterReference } from './parameter-validation.ts';
import { field, group, localizedRequired, rows, select, text } from './fields.ts';
export function parameterReference() {
  return group(
    'parameterReference',
    [parameterFields(), scenarios(), text('defaultScenarioKey', 80, false)],
    {
      validate: {
        version: 'parameter-reference.v1',
        run: (value, context) => context.mode === 'draft' || validParameterReference(value),
      },
    },
  );
}
function parameterFields() {
  return rows(
    'fields',
    [
      text('name', 100, false),
      localizedRequired('label', 256),
      select('type', ['text', 'textarea', 'select', 'number', 'boolean', 'url', 'array', 'object']),
      field('required', 'boolean', { defaultValue: false }),
      text('placeholder', 2000),
      field('defaultValue', 'json'),
      rows('options', [localizedRequired('label', 256), text('value', 512, false)], 100),
      field('min', 'number'),
      field('max', 'number'),
      field('step', 'number'),
      text('description', 2000),
    ],
    100,
  );
}
function scenarios() {
  return rows(
    'scenarios',
    [
      text('key', 80, false),
      localizedRequired('title', 256),
      text('description', 2000),
      field('values', 'json'),
      rows(
        'inputConstraints',
        [
          text('field', 100, false),
          field('required', 'boolean'),
          field('allowedValues', 'json'),
          field('min', 'number'),
          field('max', 'number'),
        ],
        100,
      ),
    ],
    100,
  );
}
