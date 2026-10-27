import 'server-only';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { adminRequestPathHeader, safeAdminDestination } from '../config/admin-routes';
import { getCurrentSession } from './session';

export async function requireSession(signal?: AbortSignal) {
  const result = await getCurrentSession(signal);
  if (result.ok) return result.data;
  const destination = safeAdminDestination((await headers()).get(adminRequestPathHeader));
  const query = new URLSearchParams();
  if (result.status !== 401) query.set('reason', 'unavailable');
  else if (result.error.code !== 'session_missing') query.set('reason', 'expired');
  if (destination !== '/dashboard') query.set('next', destination);
  return redirect(`/login${query.size > 0 ? `?${query}` : ''}`);
}
