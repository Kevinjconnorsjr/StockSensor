import { getSetting, setSetting } from './db';

// node-cron doesn't work on Vercel serverless (no persistent process).
// Scheduled runs are handled by Vercel Cron Jobs hitting /api/cron/run.
// This module just tracks status and provides the manual trigger.

export async function startCron(): Promise<void> {
  // No-op on serverless — Vercel Cron handles scheduling via vercel.json
}

export async function getCronStatus() {
  try {
    const schedule = (await getSetting('cron_schedule')) ?? '0 7 * * *';
    return {
      schedule,
      running: false,
      last_run_at: await getSetting('last_run_at'),
      last_run_status: await getSetting('last_run_status'),
    };
  } catch {
    return {
      schedule: '0 7 * * *',
      running: false,
      last_run_at: null,
      last_run_status: null,
    };
  }
}
