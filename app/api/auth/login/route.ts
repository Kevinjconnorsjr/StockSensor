export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { code } = await req.json() as { code?: string };

  if (!code || !process.env.ACCESS_CODE || code !== process.env.ACCESS_CODE) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('session', process.env.ACCESS_CODE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
  return res;
}
