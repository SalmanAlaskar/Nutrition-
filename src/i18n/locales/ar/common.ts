/** Arabic copy for the common area. Keys must match en/common.ts exactly. */
export const common = {
  appName: 'التغذية',
  save: 'حفظ',
  cancel: 'إلغاء',
  delete: 'حذف',
  edit: 'تعديل',
  done: 'تم',
  add: 'إضافة',
  back: 'رجوع',
  close: 'إغلاق',
  retry: 'حاول مرة أخرى',
  confirm: 'تأكيد',
  continue: 'متابعة',
  reset: 'إعادة تعيين',
  remove: 'إزالة',
  search: 'بحث',
  today: 'اليوم',
  yesterday: 'أمس',
  tomorrow: 'غداً',
  loading: 'جاري التحميل',
  none: 'لا شيء',
  optional: 'اختياري',
  more: 'المزيد',
  notLoggedYet: 'لم تسجّل شيئاً بعد',
  seeAll: 'عرض الكل',

  /* الحالة الفارغة الافتراضية حين لا تمرّر الشاشة نصاً خاصاً بها. */
  emptyTitle: 'لا يوجد شيء بعد',
  emptyMessage: 'ستمتلئ هذه المساحة أول ما يتوفّر ما يُعرض.',

  /* أشرطة وحلقات التقدّم. */
  progressOf: '{{label}}: {{value}} من {{target}} {{unit}}',
  progressOver: '{{label}}: {{value}} من {{target}} {{unit}}، فوق الهدف',
  overTarget: 'فوق الهدف',
  overBy: 'زيادة {{amount}}',

  /* حقول الأرقام. تُقرأ صوتياً فقط حتى لا يتغيّر ارتفاع الحقل. */
  rangeBetween: 'بين {{min}} و{{max}}',
  rangeMin: '{{min}} كحد أدنى',
  rangeMax: '{{max}} كحد أقصى',

  /* عجلات الاختيار للعمر والطول والوزن. */
  pickerAdjustHint: 'مرّر لأعلى أو لأسفل لتغيير القيمة',
  pickerTypeAction: 'اكتب الرقم',
  pickerScrollAction: 'اختر بالتمرير',

  /* ربط قائمة قصيرة داخل الجملة. */
  joinPair: '{{a}} و{{b}}',
  joinList: '{{a}}، {{b}}',

  /* الأسبوع يبدأ من الأحد. */
  weekdaySunday: 'الأحد',
  weekdayMonday: 'الاثنين',
  weekdayTuesday: 'الثلاثاء',
  weekdayWednesday: 'الأربعاء',
  weekdayThursday: 'الخميس',
  weekdayFriday: 'الجمعة',
  weekdaySaturday: 'السبت',

  monthJan: 'يناير',
  monthFeb: 'فبراير',
  monthMar: 'مارس',
  monthApr: 'أبريل',
  monthMay: 'مايو',
  monthJun: 'يونيو',
  monthJul: 'يوليو',
  monthAug: 'أغسطس',
  monthSep: 'سبتمبر',
  monthOct: 'أكتوبر',
  monthNov: 'نوفمبر',
  monthDec: 'ديسمبر'
} as const;
