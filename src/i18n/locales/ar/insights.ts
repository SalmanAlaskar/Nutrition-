/** Arabic copy for the insights area. Keys must match en/insights.ts exactly. */
export const insights = {
  listTitle: 'ملاحظات',
  emptyTitle: 'لا شيء يستدعي التنبيه',
  emptyMessage:
    'سجّل بضعة أيام من الوجبات، وحصة تدريب، وقياساً للجسم، وستمتلئ هذه القائمة بأرقام من أيامك أنت.',

  /* أسماء معدودة: المحرك يرسل الرقم، والبطاقة تختار الصيغة المناسبة. */
  dayCountOne: 'يوم واحد',
  dayCountTwo: 'يومين',
  dayCountFew: '{{n}} أيام',
  dayCountMany: '{{n}} يوماً',
  mealCountOne: 'وجبة واحدة',
  mealCountTwo: 'وجبتين',
  mealCountFew: '{{n}} وجبات',
  mealCountMany: '{{n}} وجبة',
  sessionCountOne: 'حصة واحدة',
  sessionCountTwo: 'حصتين',
  sessionCountFew: '{{n}} حصص',
  sessionCountMany: '{{n}} حصة',

  /* أجزاء الجسم كما تُقرأ داخل الجملة. */
  segRightArm: 'الذراع اليمنى',
  segLeftArm: 'الذراع اليسرى',
  segTrunk: 'الجذع',
  segRightLeg: 'الساق اليمنى',
  segLeftLeg: 'الساق اليسرى',
  segBothArms: 'الذراعين',
  segBothLegs: 'الساقين',

  /* أزرار أسفل البطاقة. */
  actionLogMeal: 'سجّل وجبة',
  actionOpenHistory: 'افتح السجل',
  actionOpenTraining: 'افتح التمارين',
  actionViewScans: 'اعرض القياسات',
  actionAddScan: 'أضف قياساً',
  actionFinishProfile: 'أكمل ملفك',

  /* بوابة الملف الشخصي. */
  gateProfileTitle: 'لا توجد أهداف للمقارنة',
  gateProfileDetail:
    'تُبنى أهداف السعرات والماكروز على الجنس والعمر والطول والوزن والهدف. بدونها لا يوجد ما تُقاس عليه أيامك المسجّلة.',

  /* البروتين. */
  proteinTitle: 'البروتين أقل من الهدف',
  proteinDetailFull:
    'متوسط البروتين {{avg}} جم يومياً مقابل هدف {{target}} جم خلال آخر {{window}} أيام، بفارق {{short}} جم. صنف واحد غني بالبروتين في اليوم يغطي معظمه.',
  proteinDetailPartial:
    'متوسط البروتين {{avg}} جم يومياً مقابل هدف {{target}} جم على {{logged}} أيام من آخر {{window}}، بفارق {{short}} جم. صنف واحد غني بالبروتين في اليوم يغطي معظمه.',

  /* السعرات. */
  caloriesOverTitle: 'السعرات أعلى من الهدف',
  caloriesUnderTitle: 'السعرات أقل من الهدف',
  caloriesOverDetailFull:
    'متوسط السعرات {{avg}} يومياً مقابل هدف {{target}} خلال آخر {{window}} أيام، بزيادة {{diff}}. رسم السجل يوضّح الأيام التي تحمل هذا الفارق.',
  caloriesOverDetailPartial:
    'متوسط السعرات {{avg}} يومياً مقابل هدف {{target}} على {{logged}} أيام من آخر {{window}}، بزيادة {{diff}}. رسم السجل يوضّح الأيام التي تحمل هذا الفارق.',
  caloriesUnderDetailFull:
    'متوسط السعرات {{avg}} يومياً مقابل هدف {{target}} خلال آخر {{window}} أيام، بنقص {{diff}}. متوسط بهذا الانخفاض قد يعني أيضاً أن أصنافاً سُجّلت متأخرة أو لم تُسجّل.',
  caloriesUnderDetailPartial:
    'متوسط السعرات {{avg}} يومياً مقابل هدف {{target}} على {{logged}} أيام من آخر {{window}}، بنقص {{diff}}. متوسط بهذا الانخفاض قد يعني أيضاً أن أصنافاً سُجّلت متأخرة أو لم تُسجّل.',

  /* يوم واحد أقل بكثير من الهدف. */
  lowDayTitle: 'يوم {{date}} منخفض عن المعتاد',
  lowDayDetail:
    'مجموع ذلك اليوم {{total}} سعرة من {{meals}}، تحت حد {{floor}} سعرة لهدف {{target}}. إكمال النواقص يبقي المتوسطات دقيقة.',
  lowDayDetailMore:
    'مجموع ذلك اليوم {{total}} سعرة من {{meals}}، تحت حد {{floor}} سعرة لهدف {{target}}. و{{days}} من آخر {{window}} بهذا الانخفاض. إكمال النواقص يبقي المتوسطات دقيقة.',

  /* انقطاع التدريب. */
  trainingGapTitle: 'لم تُسجَّل حصة منذ {{days}}',
  trainingGapDetail: 'آخر حصة كانت {{date}}. تسجيل الحصة القادمة يبدأ العدّ من جديد.',
  trainingGapDetailMissed:
    'آخر حصة كانت {{date}}، ومرّ منذ ذلك الحين {{missed}} على الجدول. تسجيل الحصة القادمة يبدأ العدّ من جديد.',

  /* نوع يوم يتأخر أكثر من غيره. */
  missedTypeTitle: 'أيام {{label}} هي المتأخرة',
  missedTypeDetail:
    'الجدول يطلب {{label}} في {{scheduled}} خلال آخر {{window}} يوماً، وسُجّل منها {{completed}}. تقع في {{weekdays}}، فالقادمة هي التي تستحق الحفاظ عليها.',
  missedTypeDetailNone:
    'الجدول يطلب {{label}} في {{scheduled}} خلال آخر {{window}} يوماً، ولم يُسجَّل منها شيء. تقع في {{weekdays}}، فالقادمة هي التي تستحق الحفاظ عليها.',

  /* حصص هذا الأسبوع. */
  weekOnTrackTitle: 'سجّلت {{sessions}} هذا الأسبوع',
  weekBehindTitle: '{{done}} من {{planned}} مسجّلة هذا الأسبوع',
  weekOnTrackDetail: 'الجدول يطلب {{planned}} من الأحد إلى اليوم، فالأسبوع ماشٍ على الخطة.',
  weekBehindDetail:
    'الجدول يطلب {{planned}} من الأحد إلى اليوم. بقية الأسبوع هي فرصة تعويض الفارق.',

  /* عنوان المقارنة بين قياسين. */
  trendMuscleUpFatDown: 'العضلات ارتفعت والدهون انخفضت',
  trendMuscleUpFatUp: 'ارتفعت العضلات والدهون معاً',
  trendMuscleUp: 'ارتفعت العضلات منذ آخر قياس',
  trendMuscleDownFatUp: 'انخفضت العضلات وارتفعت الدهون',
  trendMuscleDown: 'انخفضت العضلات منذ آخر قياس',
  trendFatUp: 'ارتفعت الدهون منذ آخر قياس',
  trendFatDown: 'انخفضت الدهون منذ آخر قياس',
  trendWeightUp: 'ارتفع الوزن منذ آخر قياس',
  trendWeightDown: 'انخفض الوزن منذ آخر قياس',
  trendFlat: 'تغيّر طفيف بين آخر قياسين',

  trendDetailMuscleFat:
    'خلال {{days}} بين {{from}} و{{to}}، انتقلت العضلات الهيكلية من {{muscleFrom}} إلى {{muscleTo}} كجم، ودهون الجسم من {{fatFrom}} إلى {{fatTo}} كجم. قياس ثالث على نفس الجهاز يوضّح الاتجاه أكثر.',
  trendDetailMuscleFatPercent:
    'خلال {{days}} بين {{from}} و{{to}}، انتقلت العضلات الهيكلية من {{muscleFrom}} إلى {{muscleTo}} كجم، ونسبة الدهون من {{fatFrom}}٪ إلى {{fatTo}}٪. قياس ثالث على نفس الجهاز يوضّح الاتجاه أكثر.',
  trendDetailMuscle:
    'خلال {{days}} بين {{from}} و{{to}}، انتقلت العضلات الهيكلية من {{muscleFrom}} إلى {{muscleTo}} كجم. قياس ثالث على نفس الجهاز يوضّح الاتجاه أكثر.',
  trendDetailFat:
    'خلال {{days}} بين {{from}} و{{to}}، انتقلت دهون الجسم من {{fatFrom}} إلى {{fatTo}} كجم. قياس ثالث على نفس الجهاز يوضّح الاتجاه أكثر.',
  trendDetailFatPercent:
    'خلال {{days}} بين {{from}} و{{to}}، انتقلت نسبة الدهون من {{fatFrom}}٪ إلى {{fatTo}}٪. قياس ثالث على نفس الجهاز يوضّح الاتجاه أكثر.',
  trendDetailWeight:
    'خلال {{days}} بين {{from}} و{{to}}، انتقل الوزن من {{weightFrom}} إلى {{weightTo}} كجم. قياس ثالث على نفس الجهاز يوضّح الاتجاه أكثر.',

  /* اليمين مقابل اليسار. */
  imbalanceArmRightTitle: 'الذراع اليمنى أثقل من اليسرى',
  imbalanceArmLeftTitle: 'الذراع اليسرى أثقل من اليمنى',
  imbalanceLegRightTitle: 'الساق اليمنى أثقل من اليسرى',
  imbalanceLegLeftTitle: 'الساق اليسرى أثقل من اليمنى',
  imbalanceArmDetail:
    'في {{date}} حملت الذراع اليمنى {{right}} كجم من الكتلة الصافية مقابل {{left}} كجم لليسرى، بفارق {{share}}٪. قراءات الأطراف فيها تذبذب، فتابعها عبر عدة قياسات لا قياس واحد.',
  imbalanceLegDetail:
    'في {{date}} حملت الساق اليمنى {{right}} كجم من الكتلة الصافية مقابل {{left}} كجم لليسرى، بفارق {{share}}٪. قراءات الأطراف فيها تذبذب، فتابعها عبر عدة قياسات لا قياس واحد.',

  /* جزء ثابت بينما تحرّك غيره. */
  stalledTitle: 'بلا تغيّر يُذكر في {{segments}}',
  stalledDetail:
    'بين {{from}} و{{to}} ارتفعت قراءة {{mover}} بمقدار {{gain}} كجم، بينما لم تتجاوز حركة {{segments}} {{noise}} كجم. الأوزان والتكرارات المسجّلة في كل حصة هي ما يبيّن إن كان العمل عليها يتقدّم.',

  /* الانتظام. */
  streakTitle: 'سجّلت {{days}} دون انقطاع',
  streakDetail:
    'الوجبات مسجّلة على مدى {{days}} دون انقطاع، وكل متوسط هنا مبني على هذه الفترة.',
  missedDaysTitle: '{{logged}} من آخر {{window}} يوماً فيها وجبات',
  missedDaysDetail:
    '{{missed}} من تلك الفترة بلا تسجيل، لذلك كل متوسط هنا مبني على {{logged}}. تعبئة يوم سابق لا تأخذ سوى دقيقة من السجل.',

  /* البوابات. */
  gateFoodTitle: 'المتوسطات تحتاج أياماً أكثر',
  gateFoodDetailNone:
    'لا يوجد تسجيل خلال آخر {{window}} أيام. عند {{min}} أيام تبدأ هذه القائمة بعرض متوسطات البروتين والسعرات.',
  gateFoodDetail:
    '{{logged}} من آخر {{window}} فيها وجبات. عند {{min}} أيام تبدأ هذه القائمة بعرض متوسطات البروتين والسعرات.',
  gateTrainingTitle: 'لا توجد حصص مسجّلة بعد',
  gateTrainingDetail:
    'بمجرد تسجيل الحصص، تستطيع هذه القائمة مقارنة ما يطلبه الجدول بما تم فعلاً، حسب نوع اليوم.',
  gateScanNoneTitle: 'لا يوجد قياس للجسم',
  gateScanOneTitle: 'قياس واحد للجسم',
  gateScanNoneDetail:
    'قياس تركيب الجسم يضيف أرقام العضلات والدهون وكل طرف، وهي ما لا يظهره الوزن وحده.',
  gateScanOneDetail:
    'القياس الثاني هو ما يحوّل ورقة واحدة إلى اتجاه واضح للعضلات والدهون وكل طرف.'
} as const;
