import type { AdminComponentRegistration } from '@new-cms/cms/content/generate';
import { modelFieldComponent } from './model-field-component.ts';

export const adminComponents: readonly AdminComponentRegistration[] = [
  modelFieldComponent,
  { id: 'cms/character-count', version: '1', slots: ['Field', 'Description', 'afterInput'] },
  { id: 'cms/monospace', version: '1', slots: ['Cell'] },
  {
    id: 'cms/section',
    version: '1',
    slots: ['Header', 'List', 'Edit', 'beforeList', 'afterList', 'beforeEdit', 'afterEdit'],
  },
];
