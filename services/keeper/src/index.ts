// Auto-release crank stub (T-26, OQ-8). Plain Node entrypoint + exported fn for cron.
export function shouldAutoRelease(nowTs: number, dueTs: number, claimWindowSecs: number, disputed: boolean): boolean {
  if (disputed) return false;
  return nowTs >= dueTs + claimWindowSecs;
}
