import { expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy';

it('overrides a spoofed destination with the actual pathname and forwards request headers', () => {
  const response = proxy(
    new NextRequest('https://admin.example/dashboard/account?secret=private', {
      headers: { 'x-oneaster-admin-path': '//external.test', 'x-request-id': 'request-id' },
    }),
  );
  expect(response.headers.get('x-middleware-request-x-oneaster-admin-path')).toBe(
    '/dashboard/account',
  );
  expect(response.headers.get('x-middleware-request-x-request-id')).toBe('request-id');
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('set-cookie')).toBeNull();
});
