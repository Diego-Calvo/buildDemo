export type SlaState = "GREEN" | "AMBER" | "RED";

export function businessHoursBetween(start: Date, end: Date) {
  if (end <= start) return 0;
  let cursor = new Date(start);
  let milliseconds = 0;
  while (cursor < end) {
    const nextMidnight = new Date(cursor);
    nextMidnight.setUTCHours(24, 0, 0, 0);
    const segmentEnd = nextMidnight < end ? nextMidnight : end;
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      milliseconds += segmentEnd.getTime() - cursor.getTime();
    }
    cursor = segmentEnd;
  }
  return milliseconds / 3_600_000;
}

export function elapsedHours(start: Date, end: Date, businessDaysOnly: boolean) {
  return businessDaysOnly
    ? businessHoursBetween(start, end)
    : Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

export function slaState(elapsed: number, targetHours: number, warnAtPct = 75): SlaState {
  const percentage = (elapsed / targetHours) * 100;
  if (percentage > 100) return "RED";
  if (percentage >= warnAtPct) return "AMBER";
  return "GREEN";
}

export function currentStageSla(enteredAt: Date, now = new Date()) {
  const hours = elapsedHours(enteredAt, now, false);
  return {
    hours,
    state: slaState(hours, 168),
    percentage: Math.round((hours / 168) * 100),
  };
}

export function formatDuration(start: Date, end = new Date()) {
  const totalHours = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 3_600_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${hours}h`;
}
