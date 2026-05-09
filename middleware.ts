import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/login', '/api/auth/login', '/api/auth/logout'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Vercel cron hits this without a session
  if (pathname === '/api/cron') return NextResponse.next();

  // Always allow public paths and Next.js internals
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();

  const session = request.cookies.get('session')?.value;
  if (!session || session !== process.env.ACCESS_CODE) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
