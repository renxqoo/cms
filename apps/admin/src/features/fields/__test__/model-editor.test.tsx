import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Harness, node, services } from './support';
import type * as Forms from '@new-cms/ui/forms';

vi.mock('@new-cms/ui/forms', async (original) => ({
  ...(await original<typeof Forms>()),
  CodeEditor: ({
    value,
    onChange,
    label,
    readOnly,
  }: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    readOnly: boolean;
  }) => (
    <textarea
      aria-label={label}
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

function configured(name: string, kind: string) {
  return {
    layout: [node(name, { type: 'json', components: { Field: 'cms/model-field' } })],
    componentProps: { [`${name}#${name}:Field:cms/model-field`]: { kind } },
  };
}

it('model publication languages can be selected without writing a JSON array', () => {
  render(
    <Harness
      {...configured('contentLocales', 'locales')}
      services={{
        ...services(),
        collections: [{ id: 'models', label: 'Models', locales: ['en', 'zh'] }],
      }}
      initial={{ contentLocales: ['en'] }}
    />,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'zh' }));
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
    contentLocales: ['en', 'zh'],
  });
});

it('model sample provenance edits individual fields while preserving the public object shape', () => {
  render(
    <Harness
      {...configured('provenance', 'provenance')}
      initial={{ provenance: { kind: 'model-output', sourceLabel: 'Original' } }}
    />,
  );
  fireEvent.change(screen.getByLabelText(/^Source name/u), { target: { value: 'Verified' } });
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
    provenance: { kind: 'model-output', sourceLabel: 'Verified' },
  });
});

it('read-only model JSON fields keep their nested inputs read-only', () => {
  render(
    <Harness
      {...configured('provenance', 'provenance')}
      readOnly
      initial={{ provenance: { kind: 'model-output', sourceLabel: 'Original' } }}
    />,
  );
  expect(screen.getByLabelText(/^Source name/u)).toHaveAttribute('readonly');
  expect(screen.getByRole('combobox', { name: /^Source kind/u })).toBeDisabled();
});

it('clearing optional model provenance fields removes them instead of storing invalid null or empty values', () => {
  render(
    <Harness
      {...configured('provenance', 'provenance')}
      initial={{
        provenance: {
          kind: 'model-output',
          sourceLabel: 'Source',
          sourceUrl: 'https://example.org/source',
          createdAt: '2026-10-27T00:00:00.000Z',
        },
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText('Source URL'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Created at'), { target: { value: '' } });
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
    provenance: { kind: 'model-output', sourceLabel: 'Source' },
  });
});

it('model request message editing never saves editor row identifiers in the API body', () => {
  const request = configured('requestValues', 'request');
  render(
    <Harness
      {...request}
      componentProps={{
        'requestValues#requestValues:Field:cms/model-field': {
          kind: 'request',
          schema: JSON.stringify({
            type: 'object',
            required: ['messages', 'max_tokens'],
            properties: {
              messages: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  required: ['role', 'content'],
                  properties: {
                    role: { type: 'string', enum: ['user', 'assistant'] },
                    content: { type: 'string' },
                  },
                },
              },
              max_tokens: { type: 'integer', minimum: 1, maximum: 65536 },
            },
          }),
        },
      }}
      initial={{
        requestValues: { messages: [{ role: 'user', content: 'Hello' }], max_tokens: 64 },
      }}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: /^content/u }), {
    target: { value: 'Changed' },
  });
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
    requestValues: { messages: [{ role: 'user', content: 'Changed' }], max_tokens: 64 },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/u }));
  expect(screen.getAllByRole('textbox', { name: /^content/u })).toHaveLength(2);
});

it('model default selectors use existing keys and expose missing references without replacing them', () => {
  render(
    <Harness
      {...configured('defaultBindingKey', 'bindingKey')}
      initial={{
        apiBindings: [{ key: 'chat' }, { key: 'media' }],
        defaultBindingKey: 'removed',
      }}
    />,
  );
  const select = screen.getByRole('combobox', { name: 'defaultBindingKey' });
  expect(within(select).getByRole('option', { name: 'removed (missing)' })).toBeInTheDocument();
  fireEvent.change(select, { target: { value: 'chat' } });
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toMatchObject({
    defaultBindingKey: 'chat',
  });
});

it('model source support lists edit strings and retain list validation', () => {
  render(
    <Harness {...configured('supports', 'strings')} initial={{ supports: ['Context window'] }} />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'supports 1' }), {
    target: { value: 'Image size' },
  });
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
    supports: ['Image size'],
  });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/u }));
  expect(screen.getByLabelText('Invalid')).not.toHaveTextContent('{}');
  fireEvent.change(screen.getByRole('textbox', { name: 'supports 2' }), {
    target: { value: 'Release date' },
  });
  expect(screen.getByLabelText('Invalid')).toHaveTextContent('{}');
});

it('invalid model JSON stays visible and blocks switching away until it is repaired', () => {
  render(
    <Harness
      {...configured('provenance', 'provenance')}
      initial={{ provenance: { kind: 'model-output', sourceLabel: 'Source' } }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /^JSON$/u }));
  const json = screen.getByRole('textbox', { name: 'provenance' });
  fireEvent.change(json, { target: { value: '{' } });
  expect(screen.getByRole('button', { name: /^Form$/u })).toBeDisabled();
  expect(screen.getByLabelText('Invalid')).not.toHaveTextContent('{}');
  fireEvent.change(json, { target: { value: '{"kind":"model-output","sourceLabel":"Repaired"}' } });
  fireEvent.click(screen.getByRole('button', { name: /^Form$/u }));
  expect(screen.getByLabelText(/^Source name/u)).toHaveValue('Repaired');
  expect(screen.getByLabelText('Invalid')).toHaveTextContent('{}');
});

it('changing an integration profile clears incompatible flow choices while preserving example input', () => {
  const row = '019aad44-1df0-7000-8000-000000000001';
  render(
    <Harness
      layout={[
        node('apiBindings', {
          type: 'array',
          children: [
            node('profileKey', {
              type: 'select',
              constraints: { options: ['core.chat', 'core.image-tasks'] },
            }),
          ],
          components: { Field: 'cms/model-field' },
        }),
      ]}
      componentProps={{
        'apiBindings#apiBindings:Field:cms/model-field': {
          kind: 'bindings',
          derivations: [
            {
              profileKey: 'core.chat',
              flowKey: 'chat.json',
              inputModalities: ['text'],
              outputModalities: ['text'],
              capabilities: [],
            },
            {
              profileKey: 'core.image-tasks',
              flowKey: 'image.generate',
              inputModalities: ['text'],
              outputModalities: ['image'],
              capabilities: [],
            },
          ],
        },
      }}
      initial={{
        apiBindings: [
          {
            id: row,
            profileKey: 'core.chat',
            enabledFlowKeys: ['chat.json'],
            scenarios: [
              { key: 'hello', flowKey: 'chat.json', requestValues: { prompt: 'Keep this draft' } },
            ],
          },
        ],
      }}
    />,
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'profileKey' }), {
    target: { value: 'core.image-tasks' },
  });
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toMatchObject({
    apiBindings: [
      {
        profileKey: 'core.image-tasks',
        enabledFlowKeys: [],
        scenarios: [{ key: 'hello', flowKey: null, requestValues: { prompt: 'Keep this draft' } }],
      },
    ],
  });
});
