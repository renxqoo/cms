import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from '@new-cms/ui/layout';

export function RecoveryCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="w-full gap-6 py-[33px] shadow-sm">
      <CardHeader className="gap-2 px-7 text-center">
        <h1 className="text-2xl leading-tight font-semibold">{title}</h1>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-7">{children}</CardContent>
    </Card>
  );
}

export function RecoveryLink({
  href,
  children,
}: {
  href: '/login' | '/forgot-password';
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="block rounded-sm text-center text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </a>
  );
}
