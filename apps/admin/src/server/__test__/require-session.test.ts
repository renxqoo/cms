import { beforeEach, expect, it, vi } from 'vitest';
import { failure } from '../../api/result';
import { requireSession } from '../require-session';
import { principal } from './support';

const state = vi.hoisted(() => ({
  result: vi.fn(),
  headers: new Headers(),
}));
vi.mock('../session', () => ({ getCurrentSession: () => state.result() }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(state.headers) }));
vi.mock('next/navigation', () => ({
  redirect: (value: string) => {
    throw new Error(`redirect:${value}`);
  },
}));

beforeEach(() => {
  state.headers = new Headers();
  state.result.mockResolvedValue(failure('session_missing', 401));
});

it('returns the verified identity without redirecting', async () => {
  state.result.mockResolvedValue({ ok: true, status: 200, requestId: '', data: principal });
  expect(await requireSession()).toBe(principal);
});

it('preserves a registered protected deep link when a missing session opens login', async () => {
  state.headers.set('x-oneaster-admin-path', '/dashboard/account');
  await expect(requireSession()).rejects.toThrow('redirect:/login?next=%2Fdashboard%2Faccount');
});

it('preserves a detail target with an expired session or unavailable service', async () => {
  state.headers.set(
    'x-oneaster-admin-path',
    '/dashboard/roles/11111111-1111-4111-8111-111111111111',
  );
  state.result.mockResolvedValue(failure('unauthenticated', 401));
  await expect(requireSession()).rejects.toThrow(
    'redirect:/login?reason=expired&next=%2Fdashboard%2Froles%2F11111111-1111-4111-8111-111111111111',
  );
  state.result.mockResolvedValue(failure('backend_unavailable', 503));
  await expect(requireSession()).rejects.toThrow(
    'redirect:/login?reason=unavailable&next=%2Fdashboard%2Froles%2F11111111-1111-4111-8111-111111111111',
  );
});

it.each([
  undefined,
  '//external.test',
  '/dashboard?secret=value',
  '/dashboard#token',
  '/dashboard/unknown',
])('uses the default destination for an invalid request context %j', async (value) => {
  if (value !== undefined) state.headers.set('x-oneaster-admin-path', value);
  await expect(requireSession()).rejects.toThrow('redirect:/login');
});
