/** Arabic copy for the settings area. Keys must match en/settings.ts exactly. */
export const settings = {
  title: 'الإعدادات',
  subtitle: 'تحليل الصور واللغة والوحدات وبياناتك',

  /* تحليل الصور */
  photoTitle: 'تحليل الصور',
  photoHint: 'ما الذي يحدث لصورة الوجبة بعد التقاطها.',
  modeManual: 'يدوي',
  modeManualDesc: 'الصورة تُرفق بالوجبة فقط، وأنت تكتب ما أكلت.',
  modeAi: 'تحليل ذكي',
  modeAiDesc: 'تُرفع الصورة إلى الخدمة أدناه، فتسمّي الأطعمة وتقدّر الكميات.',

  warningTitle: 'ماذا يكلفك التحليل الذكي',
  warningUpload:
    'كل صورة تحللها تغادر جهازك. تُرفع إلى الخدمة على العنوان أدناه ومعها مفتاحك، وكل عملية تحليل تُحتسب على حسابك.',
  warningKey:
    'على الجوال يُحفظ المفتاح في سلسلة مفاتيح الجهاز. ونسخة المتصفح لا سلسلة مفاتيح فيها، فيبقى المفتاح في تخزين المتصفح العادي وغير مشفّر. وكل من يفتح هذا الجهاز يستطيع فتح التطبيق والصرف من رصيد مفتاحك.',

  keyTitle: 'مفتاح الخدمة',
  keyHint: 'يبقى على هذا الجهاز ويُرسل مع كل تحليل.',
  keyChecking: 'نبحث في هذا الجهاز عن مفتاح محفوظ',
  keyStored: 'المفتاح المحفوظ',
  keySavedBadge: 'محفوظ',
  keyMaskSpoken: 'يوجد مفتاح محفوظ على هذا الجهاز. وهو مخفي ولا يُعرض مرة أخرى.',
  keyReplace: 'استبدال',
  keyRemove: 'إزالة',
  keyRemoveHint: 'يطلب تأكيدك قبل حذف المفتاح',
  keyLabel: 'مفتاح الخدمة',
  keyLabelNew: 'مفتاح جديد',
  keyFieldHint: 'يُحفظ على هذا الجهاز وحده، ولا يُعرض مرة أخرى بعد حفظه.',
  keySave: 'حفظ المفتاح',
  keySavedNotice: 'حُفظ المفتاح على هذا الجهاز.',
  keyRefusedNotice: 'رفض الجهاز حفظ المفتاح، لذا سيطلبه تحليل الصور مرة أخرى.',
  keyRemovedNotice: 'أُزيل المفتاح من هذا الجهاز.',
  keyRemoveTitle: 'إزالة مفتاح الخدمة؟',
  keyRemoveMessage: 'يتوقف تحليل الصور حتى تدخل مفتاحاً جديداً. وجباتك وملفك لا يتأثران.',

  askTitle: 'اسألني قبل كل رفع',
  askSubtitle: 'يعرض تأكيداً باسم الخدمة قبل أن تغادر الصورة جهازك.',

  endpointTitle: 'نقطة الاتصال',
  endpointHint: 'القيم الافتراضية تعمل. لا تغيّرها إلا إذا كنت تعرف سبب التغيير.',
  model: 'النموذج',
  modelHint: 'نموذج الرؤية الذي يقرأ طبقك.',
  modelError: 'أدخل اسم النموذج.',
  modelReset: 'إعادة النموذج',
  baseUrl: 'العنوان الأساسي',
  baseUrlHint: 'لا تغيّره إلا إذا كنت توجّه الطلبات عبر وسيط خاص بك.',
  baseUrlEmpty: 'أدخل عنوان الخدمة.',
  baseUrlInvalid: 'ابدأ العنوان بـ https:// ليعرف التطبيق كيف يصل إليه.',
  baseUrlReset: 'إعادة العنوان',

  /* اللغة */
  languageTitle: 'اللغة',
  languageHint: 'تغيّر التطبيق كاملاً، ومعه اتجاه القراءة.',
  languageNoteWeb: 'العربية تعرض التطبيق من اليمين إلى اليسار، والتغيير يحدث فوراً.',
  languageNoteNative:
    'العربية تعرض التطبيق من اليمين إلى اليسار. الاتجاه الجديد يظهر عند فتح التطبيق في المرة القادمة.',
  restartTitle: 'أعد فتح التطبيق',
  restartMessage: 'أغلق التطبيق وافتحه من جديد ليظهر بالاتجاه الجديد.',

  /* الوحدات */
  unitsTitle: 'الوحدات',
  unitsHint: 'كيف تُعرض الأطوال والأوزان في التطبيق.',
  unitMetric: 'متري · سم / كجم',
  unitImperial: 'إمبراطوري · قدم / رطل',
  unitsLocked: 'الوحدات جزء من ملفك، وليس لديك ملف بعد. أنشئ ملفك أولاً ويُفتح هذا الخيار.',
  setupProfile: 'إعداد ملفي',

  /* أطعمتك */
  foodsTitle: 'أطعمتك',
  foodsCount: '{{value}} أطعمة أدخلتها بنفسك.',
  foodsCountOne: 'طعام واحد أدخلته بنفسك.',
  foodsEmptyTitle: 'لا أطعمة خاصة بك',
  foodsEmptyMessage:
    'كل ما تدخله يدوياً أثناء تسجيل وجبة يُحفظ هنا، فيصبح الطبق التالي بضغطة واحدة.',
  foodEnergyPer100g: '{{value}} سعرة لكل 100 جم',
  foodEnergyPer100ml: '{{value}} سعرة لكل 100 مل',
  foodDelete: 'حذف {{name}}',
  foodDeleteTitle: 'حذف {{name}}؟',
  foodDeleteMessage: 'الوجبات التي سجلتها به تحتفظ بالأرقام التي حُفظت بها.',
  foodDeleteError: 'تعذر حذف {{name}}. حاول بعد قليل.',

  /* البيانات */
  dataTitle: 'البيانات',
  dataHint: 'كل شيء محفوظ على هذا الجهاز ولا شيء خارجه.',
  exportTitle: 'تصدير بياناتي',
  exportHintNative:
    'ملف JSON واحد يضم ملفك وإعداداتك ووجباتك وسجل وزنك وأطعمتك، يُسلَّم إلى قائمة المشاركة.',
  exportHintWeb:
    'ملف JSON واحد يضم ملفك وإعداداتك ووجباتك وسجل وزنك وأطعمتك. المتصفح بلا قائمة مشاركة، فيُعرض الملف في نافذة تنسخ منها.',
  exportShareTitle: 'تصدير بيانات {{app}}',
  exportError: 'تعذر إنشاء ملف التصدير. حاول بعد قليل.',
  exportSheetTitle: 'بياناتك',
  exportSheetHint:
    'حدد كل ما في الصندوق وانسخه، ثم الصقه في ملف باسم nutrition-export.json.',
  exportSheetClose: 'إغلاق نافذة التصدير',

  importTitle: 'استيراد بياناتي',
  importHint:
    'يقرأ ملف التصدير من جديد. وكل سجل يحمل معرّفاً موجوداً عندك يحلّ محلّه، فاستيراد الملف نفسه مرتين لا يغيّر شيئاً في المرة الثانية.',
  importPick: 'اختر ملفاً',
  importPickHint: 'يفتح ملفاتك لتختار ملف التصدير',
  importPasteOpen: 'الصق الملف بدل اختياره',
  importPasteLabel: 'محتوى ملف التصدير',
  importPasteFieldHint: 'الصق الملف كاملاً، من أول قوس إلى آخر قوس.',
  importPasteConfirm: 'استورد ما لصقته',
  importPasteClose: 'إلغاء اللصق',
  importBusy: 'نقرأ الملف',
  importFileError: 'تعذر فتح الملف. اختره مرة أخرى أو الصق محتواه.',
  importError: 'تعذر استيراد الملف. حاول بعد قليل.',

  importReplaceTitle: 'بعض ما في الملف موجود عندك',
  importReplaceMessage:
    '{{value}} سجلات في هذا الملف تحمل معرّفات موجودة عندك، والاستيراد يستبدلها. وما عداها يُضاف.',
  importReplaceMessageOne:
    'سجل واحد في هذا الملف يحمل معرّفاً موجوداً عندك، والاستيراد يستبدله. وما عداه يُضاف.',
  importReplaceAction: 'استورد على كل حال',

  importDoneTitle: 'انتهى الاستيراد',
  importFailedTitle: 'لم يُستورد شيء',
  importTotals: 'المُضاف {{added}}، والمُستبدَل {{replaced}}، والمتروك {{skipped}}.',
  importKindCounts: '{{kind}}: المُضاف {{added}}، والمُستبدَل {{replaced}}، والمتروك {{skipped}}.',
  importNothingChanged: 'كل ما في الملف كان عندك أصلاً كما هو.',

  importKindScans: 'قياسات الجسم',
  importKindWeights: 'سجل الوزن',
  importKindMeals: 'الوجبات',
  importKindWorkouts: 'حصص التمرين',
  importKindProgram: 'برنامج التمرين',
  importKindCustomFoods: 'أطعمتك',
  importKindCustomExercises: 'تمارينك',
  importKindProfile: 'الملف الشخصي',
  importKindSettings: 'الإعدادات',

  importProblemNotJson: 'هذا الملف ليس بصيغة JSON، فلا شيء فيه يُقرأ.',
  importProblemNotObject: 'الملف بصيغة JSON لكنه ليس ملف تصدير بيانات.',
  importProblemVersion: 'الملف مكتوب بالصيغة {{value}}، والتطبيق يقرأ الصيغة 1.',
  importProblemVersionUnknown: 'الملف يعلن صيغة لا يقرأها التطبيق، فلم يُمسّ شيء.',
  importProblemNothing: 'لا شيء في هذا الملف يطابق ما يحفظه التطبيق.',
  importProblemWrongShape: '{{kind}}: القيمة هنا من نوع غير متوقع، فلم يُقرأ منها شيء.',
  importProblemWrongShapeDay: '{{kind}}: ما يخص يوم {{date}} ليس قائمة، فتُرك.',
  importProblemBadRecord: '{{kind}}: السجل رقم {{position}} بلا معرّف، فتُرك.',
  importProblemDuplicate: '{{kind}}: {{id}} مكرر في الملف، فقُرئ أوله فقط.',
  importProblemBadDate: '{{kind}}: {{id}} بلا تاريخ بصيغة YYYY-MM-DD، فتُرك.',
  importProblemBadWeight: '{{kind}}: {{id}} بلا وزن أكبر من صفر، فتُرك.',
  importProblemBadFields: '{{kind}}: {{id}} ينقصه ما لا يستغني عنه، فتُرك.',
  importProblemMore: 'وهناك {{value}} غيرها مثلها.',

  eraseTitle: 'مسح كل شيء',
  eraseBody:
    'يحذف ملفك وكل وجبة سجلتها وما يشير إليها من صور، وسجل وزنك وأطعمتك وإعداداتك والمفتاح المحفوظ. الصور الموجودة في معرض جهازك لا تُمس.',
  eraseHint: 'يطلب تأكيدك مرتين قبل حذف أي شيء',
  eraseConfirmTitle: 'مسح كل شيء؟',
  eraseConfirmMessage:
    'سيُحذف ملفك وكل وجبة سجلتها وما يشير إليها من صور، وسجل وزنك وأطعمتك وإعداداتك والمفتاح المحفوظ.',
  eraseConfirmAction: 'متابعة',
  eraseLastTitle: 'الفرصة الأخيرة',
  eraseLastMessage: 'لا تراجع بعدها ولا نسخة احتياطية. صدّر بياناتك أولاً إن أردت نسخة.',
  eraseLastAction: 'امسح كل شيء',
  eraseError: 'تعذر مسح بياناتك. حاول بعد قليل.',

  /* عن التطبيق */
  aboutTitle: 'عن التطبيق',
  devBuild: 'نسخة تطوير',
  version: 'الإصدار {{version}}',
  aboutBody:
    'السعرات والماكروز ومؤشر الكتلة وأهدافك اليومية كلها تقديرات، مصدرها معادلات معيارية وجداول تركيب غذائي عامة، فالطبق الحقيقي والجسم الحقيقي يختلفان دائماً عن هذه الأرقام. هذا التطبيق ليس استشارة طبية: راجع طبيباً أو أخصائي تغذية قبل أي تغيير كبير في طريقة أكلك.'
} as const;
