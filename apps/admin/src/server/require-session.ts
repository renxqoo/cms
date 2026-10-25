import 'server-only';

import { redirect } from 'next/navigation';
import { getCurrentSession } from './session';

export async function requireSession() {
  const result = await getCurrentSession();
  if (result.ok) return result.data;
  if (result.status !== 401) return redirect('/login?reason=unavailable');
  return redirect(result.error.code === 'session_missing' ? '/login' : '/login?reason=expired');
}
