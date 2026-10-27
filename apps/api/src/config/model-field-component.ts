import {
  describeProfileRequest,
  describeBindingCapabilities,
  profileKeys,
  profileFlows,
} from '@new-cms/cms/content/delivery';
import type { AdminComponentRegistration, DocumentData } from '@new-cms/cms/content/generate';

function object(value: DocumentData[string]): DocumentData {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export const modelFieldComponent: AdminComponentRegistration = {
  id: 'cms/model-field',
  version: '1',
  slots: ['Field'],
  validateProps: {
    version: 'model-field-props.v1',
    run: ({ props }) =>
      typeof props['kind'] === 'string' &&
      [
        'locales',
        'strings',
        'provenance',
        'request',
        'bindingKey',
        'scenarioKey',
        'multiline',
        'bindings',
      ].includes(props['kind']),
  },
  resolveProps: {
    version: 'model-field-request.v1',
    run: ({ props, data, siblingData, path }) => {
      if (props['kind'] === 'bindings')
        return {
          derivations: profileKeys.flatMap((profileKey) =>
            profileFlows[profileKey].map((flowKey) => ({
              profileKey,
              flowKey,
              ...describeBindingCapabilities({ profileKey, flowKeys: [flowKey] }),
            })),
          ),
        };
      if (props['kind'] !== 'request') return {};
      const bindings = Array.isArray(data['apiBindings']) ? data['apiBindings'] : [];
      const binding = bindings.map(object).find((row) => path?.split('.')[1] === row['id']);
      const profileKey = binding?.['profileKey'];
      const { flowKey } = siblingData;
      if (typeof profileKey !== 'string' || typeof flowKey !== 'string') return { schema: null };
      try {
        return { schema: JSON.stringify(describeProfileRequest({ profileKey, flowKey })) };
      } catch {
        return { schema: null };
      }
    },
  },
};
