import { NextRequest, NextResponse } from 'next/server';
import { getCronStatus } from '@/lib/cron';
import { setSetting } from '@/lib/db';
import { runPipeline } from '@/lib/pipeline';

export async function GET() {
  return NextResponse.json(await getCronStatus());
}

export async function POST(req: NextRequest) {
  const { action, schedule } = await req.json() as { action?: string; schedule?: string };

  if (action === 'run_now') {
    await setSetting('last_run_at', new Date().toISOString());
    await setSetting('last_run_status', 'running');
    void runPipeline()
      .then(() => setSetting('last_run_status', 'success'))
      .catch(() => setSetting('last_run_status', 'error'));
    return NextResponse.json({ ok: true, started: true });
  }

  if (action === 'update_schedule' && schedule) {
    await setSetting('cron_schedule', schedule);
    return NextResponse.json({ ok: true, schedule });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
