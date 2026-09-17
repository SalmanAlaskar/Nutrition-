/**
 * Number formatting for display.
 *
 * Deliberately locale-independent digits. Saudi Arabic interfaces overwhelmingly
 * use Western digits (0-9) rather than Arabic-Indic (٠-٩), and Intl on Hermes
 * has been inconsistent about which it picks for the 'ar' locale. Formatting by
 * hand makes the output identical on every device and in both languages.
 */

/** Groups thousands: 2833 -> '2,833'. Rounds to a whole number. */
export function formatCount(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return (
    sign +
    Math.abs(rounded)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  );
}

/** Keeps decimals where they carry meaning, e.g. 77.1 kg or 23.4 per cent. */
export function formatAmount(value: number, decimals = 1): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  if (Number.isInteger(rounded)) return formatCount(rounded);
  const [whole, fraction] = Math.abs(rounded).toFixed(decimals).split('.');
  const sign = rounded < 0 ? '-' : '';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}.${fraction.replace(/0+$/, '') || '0'}`;
}

/** Always carries a sign, for deltas: +0.9, -0.4, 0. */
export function formatDelta(value: number, decimals = 1): string {
  if (Math.abs(value) < 10 ** -decimals / 2) return '0';
  const body = formatAmount(Math.abs(value), decimals);
  return `${value > 0 ? '+' : '-'}${body}`;
}

/** 0.234 -> '23%'. Input is a fraction, not a percentage. */
export function formatPercent(fraction: number, decimals = 0): string {
  return `${formatAmount(fraction * 100, decimals)}%`;
}
