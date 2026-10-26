import { expect, it } from 'vitest';
import { validateDraftApiBindings } from '../draft-bindings.ts';
const context = { modelId: 'A/Model', defaultBindingKey: null };
it('allows incomplete draft structure while preserving all supplied execution constraints', () => {
  for (const apiBindings of [
    [],
    [{}],
    [{ key: 'chat' }],
    [{ profileKey: 'core.chat' }],
    [{ profileKey: 'core.chat', scenarios: [{}] }],
    [{ profileKey: 'core.chat', scenarios: [{ key: 'hi', flowKey: 'chat.json' }] }],
    [
      {
        profileKey: 'core.chat',
        scenarios: [
          {
            flowKey: 'chat.json',
            requestValues: { messages: [{ role: 'user', content: 'Hi' }], max_tokens: 10 },
          },
        ],
      },
    ],
  ])
    expect(validateDraftApiBindings({ ...context, apiBindings })).toBe(true);
});
it('rejects malformed drafts, duplicate identities, disabled flows and request injection', () => {
  for (const apiBindings of [
    null,
    [{ key: 'a' }, { key: 'a' }],
    [{ profileKey: 'core.chat', enabledFlowKeys: ['image.generate'] }],
    [{ profileKey: 'core.chat', scenarios: [{ key: 'a' }, { key: 'a' }] }],
    [
      {
        profileKey: 'core.chat',
        enabledFlowKeys: ['chat.json'],
        scenarios: [{ flowKey: 'chat.sse', requestValues: {} }],
      },
    ],
    [
      {
        profileKey: 'core.chat',
        scenarios: [{ flowKey: 'chat.json', requestValues: { model: 'wrong' } }],
      },
    ],
  ])
    expect(validateDraftApiBindings({ ...context, apiBindings })).toBe(false);
  expect(
    validateDraftApiBindings({ ...context, defaultBindingKey: 'missing', apiBindings: [] }),
  ).toBe(false);
});
