/** English copy for the common area. Keys are shared with ar/common.ts. */
export const common = {
  appName: 'Nutrition',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  edit: 'Edit',
  done: 'Done',
  add: 'Add',
  back: 'Back',
  close: 'Close',
  retry: 'Try again',
  confirm: 'Confirm',
  continue: 'Continue',
  reset: 'Reset',
  remove: 'Remove',
  search: 'Search',
  today: 'Today',
  yesterday: 'Yesterday',
  tomorrow: 'Tomorrow',
  loading: 'Loading',
  none: 'None',
  optional: 'Optional',
  more: 'More',
  notLoggedYet: 'Nothing logged yet',
  seeAll: 'See all',

  /* Default empty state, used when a screen does not supply its own. */
  emptyTitle: 'Nothing here yet',
  emptyMessage: 'This fills in as soon as there is something to show.',

  /* Progress bars and rings. */
  progressOf: '{{label}}: {{value}} of {{target}} {{unit}}',
  progressOver: '{{label}}: {{value}} of {{target}} {{unit}}, over target',
  overTarget: 'over target',
  overBy: '{{amount}} over',

  /* Number fields. Spoken, not printed, so the field keeps its height. */
  rangeBetween: 'Between {{min}} and {{max}}',
  rangeMin: 'At least {{min}}',
  rangeMax: 'At most {{max}}',

  /* Scroll pickers for age, height and weight. */
  pickerAdjustHint: 'Swipe up or down to change the value',
  pickerTypeAction: 'Type instead',
  pickerScrollAction: 'Scroll instead',

  /* Joining a short list inside a sentence. */
  joinPair: '{{a}} and {{b}}',
  joinList: '{{a}}, {{b}}',

  /* The week starts on Sunday. */
  weekdaySunday: 'Sunday',
  weekdayMonday: 'Monday',
  weekdayTuesday: 'Tuesday',
  weekdayWednesday: 'Wednesday',
  weekdayThursday: 'Thursday',
  weekdayFriday: 'Friday',
  weekdaySaturday: 'Saturday',

  monthJan: 'Jan',
  monthFeb: 'Feb',
  monthMar: 'Mar',
  monthApr: 'Apr',
  monthMay: 'May',
  monthJun: 'Jun',
  monthJul: 'Jul',
  monthAug: 'Aug',
  monthSep: 'Sep',
  monthOct: 'Oct',
  monthNov: 'Nov',
  monthDec: 'Dec'
} as const;
