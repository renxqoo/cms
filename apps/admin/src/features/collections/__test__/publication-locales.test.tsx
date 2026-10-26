import { useState } from 'react';
import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { FieldRenderer } from '../../fields/field-renderer';
import type { FieldData } from '../../fields/types';
import { PublicationLocalesField } from '../publication-locales';
import { contentMessages } from '../messages';

function Harness({ readOnly = false }: { readOnly?: boolean }) {
  const [value, setValue] = useState<FieldData>({ contentLocales: ['en'] });
  return (
    <ShellProvider
      initial={{ locale: 'en', theme: 'dark', sidebarOpen: true, collapsedGroups: [] }}
    >
      <FieldRenderer
        idPrefix="languages"
        resetKey="first"
        locale="en"
        layout={[
          {
            id: 'content_locales',
            name: 'contentLocales',
            path: 'contentLocales',
            label: 'Publication languages',
            type: 'json',
            required: true,
            localized: false,
            write: 'allowed',
            constraints: {},
          },
        ]}
        value={value}
        onChange={setValue}
        onValidityChange={() => {}}
        services={{
          collections: [],
          searchReferences: () => Promise.resolve({ rows: [], total: 0, page: 1, pageSize: 20 }),
        }}
        readOnly={readOnly}
        renderControl={(props) =>
          props.node.path === 'contentLocales' ? (
            <PublicationLocalesField
              {...props}
              locales={['en', 'zh', 'fr']}
              t={contentMessages.en}
            />
          ) : undefined
        }
      />
      <output aria-label="Selected languages">{JSON.stringify(value['contentLocales'])}</output>
    </ShellProvider>
  );
}
it('selects explicit publication languages without requiring raw JSON edits', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: 'zh' }));
  expect(screen.getByLabelText('Selected languages')).toHaveTextContent('["en","zh"]');
});
it('retains selected languages in a read-only editor', () => {
  render(<Harness readOnly />);
  expect(screen.getByLabelText('Selected languages')).toHaveTextContent('["en"]');
  expect(screen.getByRole('combobox')).toBeDisabled();
});
