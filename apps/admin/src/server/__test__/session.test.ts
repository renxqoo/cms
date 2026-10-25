import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentSession } from '../session';
import { httpFixture, principal, sendError, sendJson } from './support';

const state = vi.hoisted(() => ({ cookies: [] as { name: string; value: string }[] }));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      getAll: (name: string) => state.cookies.filter((cookie) => cookie.name === name),
    }),
}));

let fixture: Awaited<ReturnType<typeof httpFixture>>;
let calls = 0;

beforeAll(async () => {
  fixture = await httpFixture((req, res) => {
    calls += 1;
    if (req.headers.authorization === 'Bearer first-user') return sendJson(res, principal);
    if (req.headers.authorization === 'Bearer second-user')
      return sendJson(res, {
        ...principal,
        id: '33333333-3333-4333-8333-333333333333',
        email: 'second@example.com',
      });
    if (req.headers.authorization === 'Bearer backend-down')
      return sendError(res, 'temporarily_unavailable', 503);
    sendError(res, 'unauthenticated', 401);
  });
  vi.stubEnv('CMS_API_BASE_URL', fixture.origin);
  vi.stubEnv('CMS_ADMIN_ORIGIN', 'http://localhost:3000');
});
afterAll(async () => {
  await fixture.close();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  state.cookies = [];
  calls = 0;
});

describe('SSR session isolation', () => {
  it('distinguishes missing credentials without calling the backend', async () => {
    expect(await getCurrentSession()).toMatchObject({
      ok: false,
      status: 401,
      error: { code: 'session_missing' },
    });
    expect(calls).toBe(0);
  });

  it('does not share one user identity with another request or an anonymous request', async () => {
    state.cookies = [{ name: 'oneaster-session', value: 'first-user' }];
    const first = await getCurrentSession();
    state.cookies = [{ name: 'oneaster-session', value: 'second-user' }];
    const second = await getCurrentSession();
    state.cookies = [];
    const anonymous = await getCurrentSession();
    expect(first).toMatchObject({
      ok: true,
      data: { id: principal.id, email: 'admin@example.com' },
    });
    expect(second).toMatchObject({
      ok: true,
      data: { id: '33333333-3333-4333-8333-333333333333', email: 'second@example.com' },
    });
    expect(anonymous).toMatchObject({ ok: false, status: 401, error: { code: 'session_missing' } });
    expect(calls).toBe(2);
  });

  it('distinguishes expired credentials from service unavailability without mutating cookies', async () => {
    state.cookies = [{ name: 'oneaster-session', value: 'old-user' }];
    expect(await getCurrentSession()).toMatchObject({
      ok: false,
      status: 401,
      error: { code: 'unauthenticated' },
    });
    state.cookies = [{ name: 'oneaster-session', value: 'backend-down' }];
    expect(await getCurrentSession()).toMatchObject({
      ok: false,
      status: 503,
      error: { code: 'temporarily_unavailable' },
    });
    expect(state.cookies).toEqual([{ name: 'oneaster-session', value: 'backend-down' }]);
  });

  it('rejects malformed and duplicate session cookies without calling the backend', async () => {
    for (const cookies of [
      [{ name: 'oneaster-session', value: '%20' }],
      [
        { name: 'oneaster-session', value: 'first-user' },
        { name: 'oneaster-session', value: 'second-user' },
      ],
    ]) {
      state.cookies = cookies;
      expect(await getCurrentSession()).toMatchObject({
        ok: false,
        status: 401,
        error: { code: 'unauthenticated' },
      });
    }
    expect(calls).toBe(0);
  });

  it('returns a safe unavailable state when server configuration is invalid', async () => {
    vi.stubEnv('CMS_ADMIN_ORIGIN', 'invalid');
    expect(await getCurrentSession()).toMatchObject({
      ok: false,
      status: 503,
      error: { code: 'backend_unavailable' },
    });
    vi.stubEnv('CMS_ADMIN_ORIGIN', 'http://localhost:3000');
  });
});
