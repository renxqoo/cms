import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ForgotPage, {
  generateMetadata as forgotMetadata,
} from '../../../app/(auth)/forgot-password/page';
import InvitePage, {
  generateMetadata as inviteMetadata,
} from '../../../app/(auth)/accept-invitation/page';
import ResetPage, {
  generateMetadata as resetMetadata,
} from '../../../app/(auth)/reset-password/page';
import { safeLoginNext } from '../login-navigation';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';

const state = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: state.locale }) }),
}));
afterEach(() => {
  state.locale = 'en';
});

it('renders recovery route entries without accepting a token from server props', () => {
  const forgot = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>{ForgotPage()}</ShellProvider>,
  );
  expect(forgot).toContain('Forgot password');
  expect(forgot).toContain('disabled=');
  expect(forgot).toContain('method="post"');
  const invite = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>{InvitePage()}</ShellProvider>,
  );
  expect(invite).toContain('Set your account password');
  expect(invite).toContain('Reading the secure link');
  const reset = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>{ResetPage()}</ShellProvider>,
  );
  expect(reset).toContain('Reset password');
  expect(reset).toContain('Reading the secure link');
});

it('localizes all recovery route metadata before client hydration', async () => {
  expect(await forgotMetadata()).toEqual({ title: 'OneAster — Forgot password' });
  expect(await inviteMetadata()).toEqual({ title: 'OneAster — Set your account password' });
  expect(await resetMetadata()).toEqual({ title: 'OneAster — Reset password' });
  state.locale = 'zh';
  expect(await forgotMetadata()).toEqual({ title: 'OneAster — 找回密码' });
  expect(await inviteMetadata()).toEqual({ title: 'OneAster — 设置账户密码' });
  expect(await resetMetadata()).toEqual({ title: 'OneAster — 重置密码' });
});

it.each([
  '/dashboard/account',
  '/dashboard/admins',
  '/dashboard/roles',
  '/dashboard/admins/10000000-0000-4000-8000-000000000001',
])('accepts implemented registered return paths %s', (path) => {
  expect(safeLoginNext(path)).toBe(path);
});
