import { NextResponse } from 'next/server';
import { startCron } from '@/lib/cron';

// This route is called once at startup via next.config.js instrumentation
export async function GET() {
  startCron();
  return NextResponse.json({ ok: true });
}
