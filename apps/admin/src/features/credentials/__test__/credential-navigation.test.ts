import { afterEach, expect, it, vi } from 'vitest';
import { safeLoginNext } from '../../auth/login-navigation';
import { safeAdminDestination } from '../../../config/admin-routes';
import { defaultKeyExpiry, validKeyExpiry } from '../credential-policy';
import {
  returnToAuthorizationClient,
  returnToAuthorizationLogin,
} from '../authorization-navigation';

afterEach(() => vi.unstubAllGlobals());

it('preserves the concrete credentials route and a single opaque consent request through login', () => {
  expect(safeAdminDestination('/dashboard/account/credentials')).toBe(
    '/dashboard/account/credentials',
  );
  expect(safeLoginNext('/authorize?request=opaque-123')).toBe('/authorize?request=opaque-123');
  for (const path of [
    '/authorize?request=one&request=two',
    '/authorize?request=one&next=//evil.test',
    '/authorize?request=one#fragment',
  ])
    expect(safeLoginNext(path)).toBe('/dashboard');
});

it('replaces the location only for a valid callback and preserves the opaque request for an expired session', () => {
  const replace = vi.fn<(path: string) => void>();
  vi.stubGlobal('window', { location: { replace } });
  expect(returnToAuthorizationClient('javascript:alert(1)')).toBe(false);
  expect(replace).not.toHaveBeenCalled();
  expect(
    returnToAuthorizationClient(
      'https://client.example/callback?code=a',
      'https://client.example/callback',
    ),
  ).toBe(true);
  expect(replace).toHaveBeenLastCalledWith('https://client.example/callback?code=a');
  returnToAuthorizationLogin('opaque-123');
  expect(replace).toHaveBeenLastCalledWith(
    '/login?reason=expired&next=%2Fauthorize%3Frequest%3Dopaque-123',
  );
  returnToAuthorizationLogin('javascript:alert(1)');
  expect(replace).toHaveBeenLastCalledWith('/login?reason=expired');
});

it('validates key deadlines on both sides of the 90 day boundary and supplies a usable local default', () => {
  const now = Date.parse('2026-10-27T12:00:00.000Z');
  expect(validKeyExpiry('2026-10-27T12:00:00.000Z', now)).toBe(false);
  expect(validKeyExpiry('2027-01-25T12:00:00.000Z', now)).toBe(true);
  expect(validKeyExpiry('2027-01-25T12:00:00.001Z', now)).toBe(false);
  expect(validKeyExpiry('invalid', now)).toBe(false);
  expect(new Date(defaultKeyExpiry(now)).getTime()).toBe(Date.parse('2026-11-26T12:00:00.000Z'));
});
