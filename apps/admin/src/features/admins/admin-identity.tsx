import { DateCell } from '@new-cms/ui/data';
import { Card, CardContent, CardHeader, CardTitle } from '@new-cms/ui/layout';
import type { AdminDetail } from '../../contracts/access';
import { adminDate } from './admin-list-columns';
import type { AdminsMessages } from './admins-messages';

export function AdminIdentity({
  admin,
  locale,
  messages: t,
}: {
  admin: AdminDetail;
  locale: 'zh' | 'en';
  messages: AdminsMessages;
}) {
  const values = [
    [t.accountId, admin.id],
    [t.email, admin.email],
    [t.role, admin.roleCode],
    [t.status, t[admin.status]],
    [t.activation, t[admin.activation]],
    [t.version, String(admin.version)],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.identity}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {values.map(([label, value]) => (
            <div className="min-w-0 space-y-1" key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
          {[
            [t.createdAt, admin.createdAt],
            [t.updatedAt, admin.updatedAt],
            [t.lastLogin, admin.lastLoginAt],
          ].map(([label, value]) => (
            <div className="space-y-1" key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd>
                <DateCell
                  value={value}
                  format={(date) => adminDate(date, locale)}
                  emptyLabel={t.never}
                  errorLabel={t.unknownTime}
                />
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
