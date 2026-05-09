import cron from 'node-cron';
import { getCronSchedule, runPipeline } from './pipeline';
import { setSetting, getSetting } from './db';

let task: cron.ScheduledTask | null = null;

export async function startCron(): Promise<void> {
  if (task) return;
  const schedule = await getCronSchedule();
  task = cron.schedule(schedule, async () => {
    await setSetting('last_run_at', new Date().toISOString());
    await setSetting('last_run_status', 'running');
    try {
      await runPipeline();
      await setSetting('last_run_status', 'success');
    } catch {
      await setSetting('last_run_status', 'error');
    }
  });
}

export function stopCron(): void {
  task?.stop();
  task = null;
}

export async function getCronStatus() {
  const schedule = await getCronSchedule();
  return {
    schedule,
    running: !!task,
    last_run_at: await getSetting('last_run_at'),
    last_run_status: await getSetting('last_run_status'),
  };
}
