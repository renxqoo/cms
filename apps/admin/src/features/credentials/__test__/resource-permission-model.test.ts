import { expect, it } from 'vitest';
import type { AllowedOperation } from '../../../contracts/auth';
import {
  grantKey,
  permissionGroups,
  selectableGrants,
  toggleGrant,
} from '../resource-permission-model';
import { authorizationDestination, authorizationReturnPath } from '../authorization-navigation';

const read: AllowedOperation = {
  operationId: 'documents.get',
  scopeKind: 'collection',
  collectionKey: 'articles',
};
const other: AllowedOperation = { ...read, collectionKey: 'media' };
const global: AllowedOperation = {
  operationId: 'admins.list',
  scopeKind: 'global',
  collectionKey: null,
};

it('limits permission choices to the current operation and consent snapshots', () => {
  expect(selectableGrants([read, other, global, read], [read, other])).toEqual([read, other]);
  expect(selectableGrants([read, other, global])).toEqual([read, other, global]);
  expect(selectableGrants([read, global], [])).toEqual([]);
});

it('groups real collection and system operations without expanding the grant scope', () => {
  const groups = permissionGroups([read, other, global], [{ key: 'articles', label: 'Articles' }]);
  expect(groups.map((group) => [group.label, group.grants])).toEqual([
    ['Articles', [read]],
    ['media', [other]],
    ['admins', [global]],
  ]);
  expect(grantKey(read)).not.toBe(grantKey(other));
  expect(toggleGrant([read], other, true)).toEqual([read, other]);
  expect(toggleGrant([read], read, true)).toEqual([read]);
  expect(toggleGrant([read, other], read, false)).toEqual([other]);
});

it.each([
  'https://client.example/callback?code=a&state=b',
  'http://127.0.0.1:45832/callback?code=a',
  'http://[::1]:45832/callback?error=access_denied',
  'http://localhost:45832/callback',
])('accepts a verified HTTPS or registered loopback callback %s', (value) => {
  expect(authorizationDestination(value)).toBe(value);
});

it.each([
  'javascript:alert(1)',
  '//client.example/callback',
  '/dashboard',
  'http://client.example/callback',
  'https://user:secret@client.example/callback',
  'http://127.0.0.1.evil.example/callback',
  'https://client.example/callback#secret',
])('refuses executable, ambiguous or untrusted callback schemes %s', (value) => {
  expect(authorizationDestination(value)).toBeNull();
});

it('allows only a single opaque authorization request in the login return destination', () => {
  expect(authorizationReturnPath('/authorize?request=opaque_request-123')).toBe(
    '/authorize?request=opaque_request-123',
  );
  for (const value of [
    '/authorize?request=first&request=second',
    '/authorize?request=opaque&next=https://evil.test',
    '/authorize?request=opaque#other',
    '/authorize?request=..',
    '/authorize?request=javascript:alert(1)',
    'https://evil.test/authorize?request=opaque',
    '/authorize',
  ])
    expect(authorizationReturnPath(value)).toBeNull();
});

it('refuses a safe scheme that changes the validated callback host, path or original query', () => {
  const callback = 'https://client.example/callback?workspace=one';
  expect(
    authorizationDestination('https://client.example/callback?workspace=one&code=a', callback),
  ).toBe('https://client.example/callback?workspace=one&code=a');
  for (const value of [
    'https://evil.example/callback?workspace=one&code=a',
    'https://client.example/other?workspace=one&code=a',
    'https://client.example/callback?workspace=two&code=a',
  ])
    expect(authorizationDestination(value, callback)).toBeNull();
});

it('regression: a valid document grant remains selectable when collection metadata is not visible', () => {
  const selectable = selectableGrants([read]);
  expect(selectable).toEqual([read]);
  expect(permissionGroups(selectable, [])).toMatchObject([{ label: 'articles', grants: [read] }]);
});

it('regression: normalizes an already verified HTTPS callback with its explicit default port', () => {
  expect(
    authorizationDestination(
      'https://CLIENT.example:443/callback?code=a',
      'https://CLIENT.example:443/callback',
    ),
  ).toBe('https://client.example/callback?code=a');
});
