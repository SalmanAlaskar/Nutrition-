/** English resources, one namespace per file. */
import { body } from './body';
import { common } from './common';
import { dashboard } from './dashboard';
import { history } from './history';
import { insights } from './insights';
import { macros } from './macros';
import { meals } from './meals';
import { nav } from './nav';
import { onboarding } from './onboarding';
import { profile } from './profile';
import { settings } from './settings';
import { slots } from './slots';
import { today } from './today';
import { training } from './training';
import { units } from './units';

export const en = {
  body,
  common,
  dashboard,
  history,
  insights,
  macros,
  meals,
  nav,
  onboarding,
  profile,
  settings,
  slots,
  today,
  training,
  units,
} as const;

export default en;
