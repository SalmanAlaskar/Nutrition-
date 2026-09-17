import type { MealSlot } from '@/types';

/** A calendar day in the device's local timezone, formatted 'YYYY-MM-DD'. */
export type DateKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(): DateKey {
  return toDateKey(new Date());
}

/** Local midnight for a date key. Parsing with `new Date(key)` would be UTC. */
export function parseDateKey(key: DateKey): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function addDays(key: DateKey, days: number): DateKey {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function daysBetween(from: DateKey, to: DateKey): number {
  const ms = parseDateKey(to).getTime() - parseDateKey(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Most recent `count` days, oldest first, ending today. */
export function lastNDays(count: number, endKey: DateKey = todayKey()): DateKey[] {
  const keys: DateKey[] = [];
  for (let i = count - 1; i >= 0; i -= 1) keys.push(addDays(endKey, -i));
  return keys;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** 'Today', 'Yesterday', or 'Mon, 14 Sep'. */
export function formatDayLabel(key: DateKey, todayOverride?: DateKey): string {
  const today = todayOverride ?? todayKey();
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  if (key === addDays(today, 1)) return 'Tomorrow';
  const date = parseDateKey(key);
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatShortDay(key: DateKey): string {
  const date = parseDateKey(key);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function weekdayInitial(key: DateKey): string {
  return WEEKDAYS[parseDateKey(key).getDay()].charAt(0);
}

/** Clock time of an ISO timestamp, e.g. '7:45 AM'. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hours = date.getHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${pad(date.getMinutes())} ${suffix}`;
}

/** Best guess at which meal is being logged, from the time of day. */
export function slotForHour(hour: number): MealSlot {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 22) return 'dinner';
  return 'snack';
}

export function currentSlot(now: Date = new Date()): MealSlot {
  return slotForHour(now.getHours());
}
