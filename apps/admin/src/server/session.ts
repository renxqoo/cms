import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { meSchema } from '../contracts/auth';
import type { Me } from '../contracts/auth';
import { failure } from '../api/result';
import type { ApiResult } from '../api/result';
import { requestBackend } from './api';
import { loadAdminConfig } from './config';
import type { AdminConfig } from './config';

export const backendLoginSchema = z.object({
  token: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[a-zA-Z0-9_-]+$/),
  tokenType: z.literal('Bearer'),
  expiresAt: z.iso.datetime(),
});

export function sessionToken(header: string | null, config: AdminConfig): string | undefined {
  const values = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${config.cookieName}=`));
  if (values.length !== 1) return undefined;
  const token = (values[0] ?? '').slice(config.cookieName.length + 1);
  return /^[a-zA-Z0-9_-]{1,4096}$/.test(token) ? token : undefined;
}

export function sessionCookie(config: AdminConfig, token?: string, expiresAt?: string): string {
  const expiry = token && expiresAt ? new Date(expiresAt).toUTCString() : new Date(0).toUTCString();
  return `${config.cookieName}=${token ?? ''}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiry}${token ? '' : '; Max-Age=0'}${config.secureCookie ? '; Secure' : ''}`;
}

export const getCurrentSession = cache(async function getCurrentSession(
  signal?: AbortSignal,
): Promise<ApiResult<Me>> {
  let config: AdminConfig;
  try {
    config = loadAdminConfig();
  } catch {
    return failure('backend_unavailable', 503);
  }
  const store = await cookies();
  const values = store.getAll(config.cookieName);
  if (values.length === 0) return failure('session_missing', 401);
  const token =
    values.length === 1
      ? sessionToken(`${config.cookieName}=${values[0]?.value ?? ''}`, config)
      : undefined;
  if (!token) return failure('unauthenticated', 401);
  return requestBackend({
    operation: 'access.me',
    response: meSchema,
    token,
    ...(signal ? { signal } : {}),
  });
});
