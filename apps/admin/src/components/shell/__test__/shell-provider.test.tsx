import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { parsePreferences } from '../../../config/preferences';
import { ShellProvider, useShell } from '../shell-provider';

afterEach(() => {
  cleanup();
  document.documentElement.className = '';
});

function PreferenceExample() {
  const t = useTranslations('shell');
  const locale = useShell((state) => state.locale);
  const theme = useShell((state) => state.theme);
  const setLocale = useShell((state) => state.setLocale);
  const setTheme = useShell((state) => state.setTheme);
  return (
    <>
      <p>{t('workbench')}</p>
      <input aria-label="Local draft" defaultValue="A draft" />
      <button onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>Language</button>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>Theme</button>
    </>
  );
}

it('language and theme changes preserve the local form and persist server-readable preferences', () => {
  render(
    <ShellProvider initial={parsePreferences({})}>
      <PreferenceExample />
    </ShellProvider>,
  );
  const input = screen.getByRole('textbox', { name: 'Local draft' });
  fireEvent.change(input, { target: { value: 'An unsaved draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Language' }));
  expect(screen.getByText('Component workbench')).toBeInTheDocument();
  expect(document.documentElement.lang).toBe('en');
  expect(document.cookie).toContain('oneaster-locale=en');
  fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
  expect(document.documentElement).toHaveClass('dark');
  expect(document.cookie).toContain('oneaster-theme=dark');
  expect(input).toHaveValue('An unsaved draft');
  fireEvent.click(screen.getByRole('button', { name: 'Language' }));
  fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
  expect(screen.getByText('组件工作台')).toBeInTheDocument();
  expect(document.documentElement).not.toHaveClass('dark');
});

it('initial server preferences produce matching content on the first render', () => {
  render(
    <ShellProvider initial={parsePreferences({ locale: 'en', theme: 'dark' })}>
      <PreferenceExample />
    </ShellProvider>,
  );
  expect(screen.getByText('Component workbench')).toBeInTheDocument();
  expect(document.documentElement.lang).toBe('en');
  expect(document.documentElement.style.colorScheme).toBe('dark');
});
