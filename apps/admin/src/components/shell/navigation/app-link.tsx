'use client';

import NextLink from 'next/link';
import type { ComponentProps } from 'react';
import { useAppNavigation } from './provider';
import { safeAppHref } from './safe-href';

type AppLinkProps = Omit<ComponentProps<typeof NextLink>, 'href' | 'onNavigate'> & { href: string };

export function AppLink({ href, replace, scroll, children, ...props }: AppLinkProps) {
  const navigation = useAppNavigation();
  if (!safeAppHref(href))
    return (
      <span className={props.className} aria-disabled="true">
        {children}
      </span>
    );
  return (
    <NextLink
      {...props}
      href={href}
      replace={replace ?? false}
      scroll={scroll ?? true}
      onNavigate={(event) => {
        event.preventDefault();
        const options = scroll === undefined ? undefined : { scroll };
        if (replace) navigation.replace(href, options);
        else navigation.push(href, options);
      }}
    >
      {children}
    </NextLink>
  );
}
