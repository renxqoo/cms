import type { ReactNode } from 'react';
import { AdminShell } from '../../features/session/admin-shell';
import { requireSession } from '../../server/require-session';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const principal = await requireSession();
  return (
    <AdminShell key={principal.id} principal={principal}>
      {children}
    </AdminShell>
  );
}
