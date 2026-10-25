import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ShellProvider, useShell } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import { AdvancedInputsShowcase } from '../advanced-inputs-showcase';
import type { CodeEditorProps } from '@new-cms/ui/forms';
import type * as Forms from '@new-cms/ui/forms';

vi.mock('@new-cms/ui/forms', async (original) => ({
  ...(await original<typeof Forms>()),
  CodeEditor(settings: CodeEditorProps) {
    return (
      <textarea
        aria-label={settings.label}
        value={settings.value}
        readOnly={settings.readOnly}
        style={{ colorScheme: settings.theme }}
        onChange={(event) => settings.onChange(event.currentTarget.value)}
      />
    );
  },
}));

function Preferences() {
  const setLocale = useShell((state) => state.setLocale);
  const setTheme = useShell((state) => state.setTheme);
  return (
    <>
      <button onClick={() => setLocale('en')}>English</button>
      <button onClick={() => setTheme('dark')}>Dark</button>
    </>
  );
}

function example() {
  render(
    <ShellProvider initial={parsePreferences({})}>
      <AdvancedInputsShowcase />
      <Preferences />
    </ShellProvider>,
  );
}

it('updates all five date modes, clears a value and keeps the read-only preview synchronized', async () => {
  example();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '日期（UTC）' }));
  await user.click(screen.getByRole('button', { name: '2026-10-27' }));
  expect(screen.getByRole('button', { name: '日期（UTC）' })).toHaveTextContent('2026-10-27');
  await user.click(screen.getByRole('button', { name: '月与日（UTC）' }));
  await user.click(screen.getByRole('button', { name: '2026-10-28' }));
  expect(screen.getByRole('button', { name: '月与日（UTC）' })).toHaveTextContent('10-28');
  await user.click(screen.getByRole('button', { name: '日期与时间（UTC）' }));
  await user.click(screen.getByRole('button', { name: '2026-10-27' }));
  expect(screen.getByRole('button', { name: '日期与时间（UTC）' })).toHaveTextContent(
    '2026-10-27 08:30',
  );
  fireEvent.change(screen.getByLabelText('月份（UTC）'), { target: { value: '2026-12' } });
  fireEvent.change(screen.getByLabelText('时分（UTC）'), { target: { value: '10:45' } });
  expect(screen.getByLabelText('当前日期值')).toHaveTextContent('2026-12-01T00:00:00.000Z');
  expect(screen.getByLabelText('当前日期值')).toHaveTextContent('2026-10-26T10:45:00.000Z');
  await user.click(screen.getByRole('button', { name: '清空日期（UTC）' }));
  expect(screen.getByLabelText('当前日期值')).toHaveTextContent('"default": null');
  await user.click(screen.getByRole('button', { name: '限定日期范围（10 月 25—28 日）' }));
  await user.click(screen.getByRole('button', { name: '2026-10-28' }));
  expect(screen.getByRole('button', { name: '只读日期' })).toHaveTextContent('2026-10-28');
  expect(screen.getByRole('button', { name: '只读日期' })).toBeDisabled();
});

it('preserves code and date edits while switching language and theme or toggling read-only', async () => {
  example();
  const user = userEvent.setup();
  const code = screen.getByRole('textbox', { name: 'JSON 代码' });
  fireEvent.change(code, { target: { value: 'local edited code' } });
  fireEvent.change(screen.getByLabelText('月份（UTC）'), { target: { value: '2027-02' } });
  await user.click(screen.getByRole('button', { name: '设为只读' }));
  expect(code).toHaveAttribute('readonly');
  await user.click(screen.getByRole('button', { name: 'English' }));
  await user.click(screen.getByRole('button', { name: 'Dark' }));
  expect(screen.getByRole('textbox', { name: 'JSON code' })).toHaveValue('local edited code');
  expect(screen.getByRole('textbox', { name: 'JSON code' })).toHaveStyle({ colorScheme: 'dark' });
  expect(screen.getByLabelText('Month (UTC)')).toHaveValue('2027-02');
  expect(screen.getByRole('textbox', { name: 'Read-only code preview' })).toHaveValue(
    'export const cms = "OneAster";',
  );
  expect(screen.getByRole('textbox', { name: 'Read-only code preview' })).toHaveAttribute(
    'readonly',
  );
  await user.click(screen.getByRole('button', { name: 'Allow editing' }));
  expect(screen.getByRole('textbox', { name: 'JSON code' })).not.toHaveAttribute('readonly');
  await user.click(screen.getByRole('button', { name: 'Clear Date (UTC)' }));
  expect(screen.getByRole('button', { name: 'Date (UTC)' })).toHaveTextContent('Choose a date');
});
