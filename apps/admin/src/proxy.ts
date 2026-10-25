import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminRequestPathHeader } from './config/admin-routes';

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(adminRequestPathHeader, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: '/dashboard/:path*' };
