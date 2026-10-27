import { useLayoutEffect, useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { FieldRenderer } from '../field-renderer';
import { Harness, node, services } from './support';

function EarlyInput() {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const input = container.current?.querySelector('input');
    if (!input) throw new Error('Missing editable field');
    fireEvent.change(input, { target: { value: 'too long' } });
  }, []);
  return (
    <div ref={container}>
      <Harness layout={[node('Limited', { constraints: { maxLength: 3 } })]} />
    </div>
  );
}
it('regression: the first invalid input before passive effects remains invalid instead of being cleared by initial reporting', async () => {
  await act(async () => {
    render(<EarlyInput />);
    await Promise.resolve();
  });
  expect(screen.getByLabelText('Limited')).toHaveValue('too long');
  expect(screen.getByLabelText('Invalid').textContent).toContain('fields/Limited');
  expect(screen.getByLabelText('Data').textContent).toBe('{}');
});

function LocaleDrafts({ english, resetKey }: { english: boolean; resetKey: string }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  function validity(key: string, error: string | null) {
    setErrors((before) => {
      const { [key]: _old, ...rest } = before;
      return error === null ? rest : { ...rest, [key]: error };
    });
  }
  return (
    <ShellProvider
      initial={{ locale: 'en', theme: 'dark', sidebarOpen: true, collapsedGroups: [] }}
    >
      {['en', 'zh']
        .filter((locale) => english || locale !== 'en')
        .map((locale) => (
          <FieldRenderer
            key={locale}
            idPrefix={locale}
            resetKey={locale === 'en' ? resetKey : 'stable'}
            locale={locale}
            layout={[node(locale, { type: 'number' })]}
            value={{}}
            services={services()}
            onChange={() => {}}
            onValidityChange={validity}
          />
        ))}
      <output aria-label="Locale errors">{JSON.stringify(errors)}</output>
    </ShellProvider>
  );
}
it('regression: replacing or removing one draft clears only its own errors and preserves another locale instance', () => {
  const view = render(<LocaleDrafts english resetKey="first" />);
  fireEvent.change(screen.getByLabelText('en'), { target: { value: '--' } });
  fireEvent.change(screen.getByLabelText('zh'), { target: { value: '--' } });
  expect(screen.getByLabelText('Locale errors').textContent).toContain('en/en');
  expect(screen.getByLabelText('Locale errors').textContent).toContain('zh/zh');
  view.rerender(<LocaleDrafts english resetKey="second" />);
  expect(screen.getByLabelText('en')).toHaveValue('');
  expect(screen.getByLabelText('Locale errors').textContent).not.toContain('en/en');
  expect(screen.getByLabelText('Locale errors').textContent).toContain('zh/zh');
  fireEvent.change(screen.getByLabelText('en'), { target: { value: '--' } });
  view.rerender(<LocaleDrafts english={false} resetKey="second" />);
  expect(screen.queryByLabelText('en')).toBeNull();
  expect(screen.getByLabelText('Locale errors').textContent).not.toContain('en/en');
  expect(screen.getByLabelText('Locale errors').textContent).toContain('zh/zh');
});

it('reports an invalid stored draft immediately and clears its error only after a valid correction', () => {
  render(
    <Harness
      layout={[node('Limited', { constraints: { maxLength: 3 } })]}
      initial={{ Limited: 'already too long' }}
    />,
  );
  expect(screen.getByLabelText('Limited')).toHaveValue('already too long');
  expect(screen.getByLabelText('Invalid').textContent).toContain('fields/Limited');
  fireEvent.change(screen.getByLabelText('Limited'), { target: { value: 'ok' } });
  expect(screen.getByLabelText('Invalid').textContent).toBe('{}');
  expect(screen.getByLabelText('Data').textContent).toBe('{"Limited":"ok"}');
});
