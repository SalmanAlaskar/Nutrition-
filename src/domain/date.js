"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toDateKey = toDateKey;
exports.todayKey = todayKey;
exports.parseDateKey = parseDateKey;
exports.addDays = addDays;
exports.daysBetween = daysBetween;
exports.lastNDays = lastNDays;
exports.formatDayLabel = formatDayLabel;
exports.formatShortDay = formatShortDay;
exports.weekdayInitial = weekdayInitial;
exports.formatTime = formatTime;
exports.slotForHour = slotForHour;
exports.currentSlot = currentSlot;
const pad = (n) => String(n).padStart(2, '0');
function toDateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function todayKey() {
    return toDateKey(new Date());
}
/** Local midnight for a date key. Parsing with `new Date(key)` would be UTC. */
function parseDateKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, (month ?? 1) - 1, day ?? 1);
}
function addDays(key, days) {
    const date = parseDateKey(key);
    date.setDate(date.getDate() + days);
    return toDateKey(date);
}
function daysBetween(from, to) {
    const ms = parseDateKey(to).getTime() - parseDateKey(from).getTime();
    return Math.round(ms / 86400000);
}
/** Most recent `count` days, oldest first, ending today. */
function lastNDays(count, endKey = todayKey()) {
    const keys = [];
    for (let i = count - 1; i >= 0; i -= 1)
        keys.push(addDays(endKey, -i));
    return keys;
}
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
/** 'Today', 'Yesterday', or 'Mon, 14 Sep'. */
function formatDayLabel(key, todayOverride) {
    const today = todayOverride ?? todayKey();
    if (key === today)
        return 'Today';
    if (key === addDays(today, -1))
        return 'Yesterday';
    if (key === addDays(today, 1))
        return 'Tomorrow';
    const date = parseDateKey(key);
    return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
function formatShortDay(key) {
    const date = parseDateKey(key);
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
function weekdayInitial(key) {
    return WEEKDAYS[parseDateKey(key).getDay()].charAt(0);
}
/** Clock time of an ISO timestamp, e.g. '7:45 AM'. */
function formatTime(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
        return '';
    const hours = date.getHours();
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const display = hours % 12 === 0 ? 12 : hours % 12;
    return `${display}:${pad(date.getMinutes())} ${suffix}`;
}
/** Best guess at which meal is being logged, from the time of day. */
function slotForHour(hour) {
    if (hour < 11)
        return 'breakfast';
    if (hour < 16)
        return 'lunch';
    if (hour < 22)
        return 'dinner';
    return 'snack';
}
function currentSlot(now = new Date()) {
    return slotForHour(now.getHours());
}
