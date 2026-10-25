import 'server-only';
import { requestPolicy } from '../api/config';

export interface AdminConfig {
  apiBaseUrl: string;
  adminOrigin: string;
  cookieName: string;
  secureCookie: boolean;
  jsonRequestBytes: number;
  jsonResponseBytes: number;
  byteLimit: number;
  streamHighWaterMark: number;
  requestTimeoutMs: number;
  streamTimeoutMs: number;
}

function origin(value: string): URL {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Invalid CMS origin configuration');
  return url;
}

function isLoopback(url: URL): boolean {
  return (
    ['localhost', '[::1]'].includes(url.hostname) || /^127(?:\.\d{1,3}){3}$/.test(url.hostname)
  );
}

export function loadAdminConfig(): AdminConfig {
  const production = process.env.NODE_ENV === 'production';
  if (production && (!process.env.CMS_API_BASE_URL || !process.env.CMS_ADMIN_ORIGIN))
    throw new Error('CMS server configuration is required');
  const api = origin(process.env.CMS_API_BASE_URL ?? 'http://127.0.0.1:3001');
  const admin = origin(process.env.CMS_ADMIN_ORIGIN ?? 'http://localhost:3000');
  if (production && admin.protocol !== 'https:' && !isLoopback(admin))
    throw new Error('CMS_ADMIN_ORIGIN must use HTTPS');
  if (production && api.protocol !== 'https:' && !isLoopback(api))
    throw new Error('CMS_API_BASE_URL must use HTTPS');
  const secureCookie = admin.protocol === 'https:';
  return {
    apiBaseUrl: api.origin,
    adminOrigin: admin.origin,
    cookieName: secureCookie ? '__Host-oneaster-session' : 'oneaster-session',
    secureCookie,
    ...requestPolicy,
  };
}
