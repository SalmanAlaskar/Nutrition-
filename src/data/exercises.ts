/**
 * Bundled offline exercise catalogue.
 *
 * Curated rather than exhaustive: every entry is a lift you can actually run in
 * a normal commercial gym, grouped by the day type it belongs to. The bundled
 * Push/Pull/Legs program in `@/domain/training` references these ids directly,
 * so an id here is a contract, not an implementation detail.
 *
 * Search mirrors `@/data/foodSearch`: the same normalisation (case, Latin
 * accents, Arabic diacritics and letter variants) is applied once at module
 * load and cached, so a keystroke only scans pre-lowered strings. The helper is
 * copied rather than imported because it is private to that module.
 */
import type { Equipment, Exercise, SessionType } from '@/types';

/** Muscle keys used in `Exercise.muscles`, with their display labels. */
export const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest',
  upper_chest: 'Upper chest',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Forearms',
  lats: 'Lats',
  upper_back: 'Upper back',
  traps: 'Traps',
  lower_back: 'Lower back',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  adductors: 'Inner thigh',
  calves: 'Calves',
  abs: 'Abs',
  obliques: 'Obliques',
  hip_flexors: 'Hip flexors',
  core: 'Core',
  conditioning: 'Heart and lungs',
};

/** Equipment words folded into the search index so "cable" finds cable work. */
const EQUIPMENT_TERMS: Record<Equipment, string> = {
  barbell: 'barbell bar',
  dumbbell: 'dumbbell db',
  machine: 'machine',
  cable: 'cable pulley',
  bodyweight: 'bodyweight calisthenics',
  other: 'other',
};

/** Compounds carry the combined days too, so an Upper or Full day still lists them. */
const PUSH_COMPOUND: SessionType[] = ['push', 'upper', 'full'];
const PUSH_ISOLATION: SessionType[] = ['push', 'upper'];
const PULL_COMPOUND: SessionType[] = ['pull', 'upper', 'full'];
const PULL_ISOLATION: SessionType[] = ['pull', 'upper'];
const LEG_COMPOUND: SessionType[] = ['legs', 'lower', 'full'];
const LEG_ISOLATION: SessionType[] = ['legs', 'lower'];
/** Core work finishes any lifting day, so it is offered on all of them. */
const CORE_DAYS: SessionType[] = ['push', 'pull', 'legs', 'upper', 'lower', 'full'];
const CARDIO_DAYS: SessionType[] = ['cardio'];

export const EXERCISES: Exercise[] = [
  /* --------------------------------------------------------------- push -- */
  {
    id: 'ex_bench_press', name: 'Barbell bench press', nameAr: 'ضغط الصدر بالبار',
    types: PUSH_COMPOUND, muscles: ['chest', 'front_delts', 'triceps'], equipment: 'barbell',
    cue: 'Keep the shoulder blades pulled back and down against the bench instead of letting them roll forward as you press.',
  },
  {
    id: 'ex_incline_barbell_press', name: 'Incline barbell press', nameAr: 'ضغط الصدر المائل بالبار',
    types: PUSH_COMPOUND, muscles: ['upper_chest', 'front_delts', 'triceps'], equipment: 'barbell',
    cue: 'Set the bench near 30 degrees; steeper than that turns it into a shoulder press.',
  },
  {
    id: 'ex_incline_db_press', name: 'Incline dumbbell press', nameAr: 'ضغط الصدر المائل بالدمبل',
    types: PUSH_COMPOUND, muscles: ['upper_chest', 'front_delts', 'triceps'], equipment: 'dumbbell',
    cue: 'Stop the dumbbells above the chest rather than clanging them together, which drops the tension at the top.',
  },
  {
    id: 'ex_flat_db_press', name: 'Flat dumbbell press', nameAr: 'ضغط الصدر بالدمبل',
    types: PUSH_COMPOUND, muscles: ['chest', 'front_delts', 'triceps'], equipment: 'dumbbell',
    cue: 'Lower until the elbows are level with the torso; going deeper only strains the shoulder.',
  },
  {
    id: 'ex_machine_chest_press', name: 'Machine chest press', nameAr: 'ضغط الصدر بالجهاز',
    types: PUSH_COMPOUND, muscles: ['chest', 'front_delts', 'triceps'], equipment: 'machine',
    cue: 'Set the seat so the handles sit at mid-chest, not at the collarbone.',
  },
  {
    id: 'ex_close_grip_bench', name: 'Close-grip bench press', nameAr: 'ضغط الصدر بقبضة ضيقة',
    types: PUSH_COMPOUND, muscles: ['triceps', 'chest', 'front_delts'], equipment: 'barbell',
    cue: 'Shoulder-width hands and elbows tucked near the ribs; a narrower grip just irritates the wrists.',
  },
  {
    id: 'ex_dip', name: 'Chest dip', nameAr: 'غطس على المتوازي',
    types: PUSH_COMPOUND, muscles: ['chest', 'triceps', 'front_delts'], equipment: 'bodyweight',
    cue: 'Lean the torso forward over the bars; staying upright shifts the work off the chest.',
  },
  {
    id: 'ex_push_up', name: 'Push-up', nameAr: 'تمرين الضغط',
    types: PUSH_COMPOUND, muscles: ['chest', 'triceps', 'front_delts', 'core'], equipment: 'bodyweight',
    cue: 'Keep the hips in line with the shoulders instead of letting the lower back sag.',
  },
  {
    id: 'ex_cable_fly', name: 'Cable chest fly', nameAr: 'تفتيح بالكيبل',
    types: PUSH_ISOLATION, muscles: ['chest'], equipment: 'cable',
    cue: 'Hold a slight fixed bend in the elbows so it stays a fly and does not turn into a press.',
  },
  {
    id: 'ex_pec_deck', name: 'Pec deck fly', nameAr: 'تفتيح بالجهاز',
    types: PUSH_ISOLATION, muscles: ['chest'], equipment: 'machine',
    cue: 'Let the arms travel back far enough to feel a stretch before squeezing in.',
  },
  {
    id: 'ex_overhead_press', name: 'Barbell overhead press', nameAr: 'ضغط الكتف بالبار',
    types: PUSH_COMPOUND, muscles: ['front_delts', 'side_delts', 'triceps', 'core'], equipment: 'barbell',
    cue: 'Squeeze the glutes and ribs down so the press comes from the shoulders, not a leaning back.',
  },
  {
    id: 'ex_db_shoulder_press', name: 'Seated dumbbell shoulder press', nameAr: 'ضغط الكتف بالدمبل',
    types: PUSH_COMPOUND, muscles: ['front_delts', 'side_delts', 'triceps'], equipment: 'dumbbell',
    cue: 'Press slightly in front of the ears rather than flaring the elbows straight out to the sides.',
  },
  {
    id: 'ex_lateral_raise', name: 'Dumbbell lateral raise', nameAr: 'رفرفة جانبية بالدمبل',
    types: PUSH_ISOLATION, muscles: ['side_delts'], equipment: 'dumbbell',
    cue: 'Use a weight you can raise without swinging; this one is nearly always loaded too heavy.',
  },
  {
    id: 'ex_triceps_pushdown', name: 'Cable triceps pushdown', nameAr: 'دفع الترايسبس بالكيبل',
    types: PUSH_ISOLATION, muscles: ['triceps'], equipment: 'cable',
    cue: 'Pin the elbows to the sides so the shoulders stop helping on the last reps.',
  },
  {
    id: 'ex_overhead_triceps_ext', name: 'Overhead triceps extension', nameAr: 'تمديد الترايسبس خلف الرأس',
    types: PUSH_ISOLATION, muscles: ['triceps'], equipment: 'cable',
    cue: 'Keep the upper arms still beside the head; only the forearms should move.',
  },
  {
    id: 'ex_skull_crusher', name: 'Lying triceps extension', nameAr: 'تمديد الترايسبس مستلقياً',
    types: PUSH_ISOLATION, muscles: ['triceps'], equipment: 'barbell',
    cue: 'Lower behind the head rather than to the forehead to keep tension off the elbow joint.',
  },

  /* --------------------------------------------------------------- pull -- */
  {
    id: 'ex_deadlift', name: 'Conventional deadlift', nameAr: 'الرفعة الميتة',
    types: PULL_COMPOUND, muscles: ['lower_back', 'glutes', 'hamstrings', 'traps', 'forearms'], equipment: 'barbell',
    cue: 'Take the slack out of the bar and set the back flat before the weight leaves the floor.',
  },
  {
    id: 'ex_pull_up', name: 'Pull-up', nameAr: 'العقلة',
    types: PULL_COMPOUND, muscles: ['lats', 'upper_back', 'biceps'], equipment: 'bodyweight',
    cue: 'Start each rep from a full hang instead of bouncing out of a half-bent position.',
  },
  {
    id: 'ex_chin_up', name: 'Chin-up', nameAr: 'العقلة بقبضة عكسية',
    types: PULL_COMPOUND, muscles: ['lats', 'biceps', 'upper_back'], equipment: 'bodyweight',
    cue: 'Drive the elbows down to the ribs rather than yanking the chin over the bar.',
  },
  {
    id: 'ex_lat_pulldown', name: 'Lat pulldown', nameAr: 'السحب الأمامي بالجهاز',
    types: PULL_COMPOUND, muscles: ['lats', 'upper_back', 'biceps'], equipment: 'machine',
    cue: 'Lean back a few degrees and hold it; rocking the torso back and forth turns it into a row.',
  },
  {
    id: 'ex_barbell_row', name: 'Barbell row', nameAr: 'التجديف بالبار',
    types: PULL_COMPOUND, muscles: ['lats', 'upper_back', 'rear_delts', 'biceps'], equipment: 'barbell',
    cue: 'Hold the torso angle still for the whole set instead of standing up as the reps get hard.',
  },
  {
    id: 'ex_db_row', name: 'One-arm dumbbell row', nameAr: 'التجديف بالدمبل بذراع واحدة',
    types: PULL_COMPOUND, muscles: ['lats', 'upper_back', 'biceps'], equipment: 'dumbbell',
    cue: 'Pull toward the hip and keep the shoulders square; twisting the torso adds reps, not muscle.',
  },
  {
    id: 'ex_seated_cable_row', name: 'Seated cable row', nameAr: 'التجديف بالكيبل جالساً',
    types: PULL_COMPOUND, muscles: ['lats', 'upper_back', 'rear_delts', 'biceps'], equipment: 'cable',
    cue: 'Let the shoulder blades travel forward on the way out, then pull them together on the way in.',
  },
  {
    id: 'ex_chest_supported_row', name: 'Chest-supported row', nameAr: 'التجديف بدعم الصدر',
    types: PULL_COMPOUND, muscles: ['upper_back', 'lats', 'rear_delts'], equipment: 'machine',
    cue: 'Keep the chest on the pad the whole set so the lower back stays out of it.',
  },
  {
    id: 'ex_t_bar_row', name: 'T-bar row', nameAr: 'التجديف بالتي بار',
    types: PULL_COMPOUND, muscles: ['lats', 'upper_back', 'biceps'], equipment: 'barbell',
    cue: 'Brace the midsection and hinge at the hips; rounding the back here is the usual failure.',
  },
  {
    id: 'ex_face_pull', name: 'Cable face pull', nameAr: 'سحب الحبل للوجه',
    types: PULL_ISOLATION, muscles: ['rear_delts', 'upper_back', 'traps'], equipment: 'cable',
    cue: 'Pull the rope to the eyes with the elbows high; going heavy here just recruits the lats.',
  },
  {
    id: 'ex_rear_delt_fly', name: 'Rear delt fly', nameAr: 'رفرفة خلفية',
    types: PULL_ISOLATION, muscles: ['rear_delts', 'upper_back'], equipment: 'dumbbell',
    cue: 'Lead with the elbows and stop at shoulder height; squeezing the shoulder blades takes over past that.',
  },
  {
    id: 'ex_shrug', name: 'Dumbbell shrug', nameAr: 'رفع الأكتاف بالدمبل',
    types: PULL_ISOLATION, muscles: ['traps'], equipment: 'dumbbell',
    cue: 'Shrug straight up, not in circles; rolling the shoulders adds nothing.',
  },
  {
    id: 'ex_barbell_curl', name: 'Barbell curl', nameAr: 'مرجحة البايسبس بالبار',
    types: PULL_ISOLATION, muscles: ['biceps', 'forearms'], equipment: 'barbell',
    cue: 'Keep the elbows under the shoulders; swinging the bar up with the hips ends the set early.',
  },
  {
    id: 'ex_incline_db_curl', name: 'Incline dumbbell curl', nameAr: 'مرجحة البايسبس على مقعد مائل',
    types: PULL_ISOLATION, muscles: ['biceps'], equipment: 'dumbbell',
    cue: 'Let the arms hang straight down behind the torso; that stretch is the whole point of the incline.',
  },
  {
    id: 'ex_db_hammer_curl', name: 'Dumbbell hammer curl', nameAr: 'مرجحة المطرقة بالدمبل',
    types: PULL_ISOLATION, muscles: ['biceps', 'forearms'], equipment: 'dumbbell',
    cue: 'Hold the neutral grip all the way up instead of rotating the wrists into a normal curl.',
  },
  {
    id: 'ex_cable_curl', name: 'Cable curl', nameAr: 'مرجحة البايسبس بالكيبل',
    types: PULL_ISOLATION, muscles: ['biceps'], equipment: 'cable',
    cue: 'Stand far enough from the stack that there is still tension at the bottom of each rep.',
  },

  /* --------------------------------------------------------------- legs -- */
  {
    id: 'ex_back_squat', name: 'Barbell back squat', nameAr: 'القرفصاء بالبار',
    types: LEG_COMPOUND, muscles: ['quads', 'glutes', 'hamstrings', 'core'], equipment: 'barbell',
    cue: 'Push the knees out over the toes on the way down; letting them cave in is the common fault.',
  },
  {
    id: 'ex_front_squat', name: 'Front squat', nameAr: 'القرفصاء الأمامي',
    types: LEG_COMPOUND, muscles: ['quads', 'glutes', 'core'], equipment: 'barbell',
    cue: 'Keep the elbows high the whole set; once they drop, the bar rolls off the shoulders.',
  },
  {
    id: 'ex_goblet_squat', name: 'Goblet squat', nameAr: 'القرفصاء بالدمبل',
    types: LEG_COMPOUND, muscles: ['quads', 'glutes', 'core'], equipment: 'dumbbell',
    cue: 'Hold the weight tight to the chest; letting it drift forward pulls the torso down with it.',
  },
  {
    id: 'ex_romanian_deadlift', name: 'Romanian deadlift', nameAr: 'الرفعة الميتة الرومانية',
    types: LEG_COMPOUND, muscles: ['hamstrings', 'glutes', 'lower_back'], equipment: 'barbell',
    cue: 'Push the hips back with soft knees; this is a hinge, not a squat with a straight bar.',
  },
  {
    id: 'ex_leg_press', name: 'Leg press', nameAr: 'ضغط الأرجل بالجهاز',
    types: LEG_COMPOUND, muscles: ['quads', 'glutes', 'hamstrings'], equipment: 'machine',
    cue: 'Stop lowering the moment the hips start to curl off the pad.',
  },
  {
    id: 'ex_hack_squat', name: 'Hack squat', nameAr: 'القرفصاء بجهاز الهاك',
    types: LEG_COMPOUND, muscles: ['quads', 'glutes'], equipment: 'machine',
    cue: 'Keep the whole back flat on the pad instead of arching away from it under load.',
  },
  {
    id: 'ex_bulgarian_split_squat', name: 'Bulgarian split squat', nameAr: 'القرفصاء البلغاري',
    types: LEG_COMPOUND, muscles: ['quads', 'glutes', 'hamstrings'], equipment: 'dumbbell',
    cue: 'Set the front foot far enough forward that the front shin stays close to vertical.',
  },
  {
    id: 'ex_walking_lunge', name: 'Walking lunge', nameAr: 'الطعن المتحرك',
    types: LEG_COMPOUND, muscles: ['quads', 'glutes', 'hamstrings'], equipment: 'dumbbell',
    cue: 'Take a long step and lower straight down; short steps put it all on the front knee.',
  },
  {
    id: 'ex_step_up', name: 'Dumbbell step-up', nameAr: 'الصعود على الصندوق بالدمبل',
    types: LEG_COMPOUND, muscles: ['quads', 'glutes'], equipment: 'dumbbell',
    cue: 'Drive through the foot on the box rather than pushing off the trailing leg.',
  },
  {
    id: 'ex_hip_thrust', name: 'Barbell hip thrust', nameAr: 'دفع الحوض بالبار',
    types: LEG_COMPOUND, muscles: ['glutes', 'hamstrings'], equipment: 'barbell',
    cue: 'Finish with the ribs down and the hips level; arching the lower back fakes the last few degrees.',
  },
  {
    id: 'ex_leg_curl', name: 'Lying leg curl', nameAr: 'ثني الأرجل بالجهاز',
    types: LEG_ISOLATION, muscles: ['hamstrings', 'calves'], equipment: 'machine',
    cue: 'Keep the hips pressed into the pad; lifting them shortens the range of the curl.',
  },
  {
    id: 'ex_leg_extension', name: 'Leg extension', nameAr: 'تمديد الأرجل بالجهاز',
    types: LEG_ISOLATION, muscles: ['quads'], equipment: 'machine',
    cue: 'Line the knee joint up with the machine pivot before the first rep.',
  },
  {
    id: 'ex_calf_raise', name: 'Standing calf raise', nameAr: 'رفع السمانة واقفاً',
    types: LEG_ISOLATION, muscles: ['calves'], equipment: 'machine',
    cue: 'Pause at the bottom stretch instead of bouncing, which is where most of the reps are lost.',
  },
  {
    id: 'ex_seated_calf_raise', name: 'Seated calf raise', nameAr: 'رفع السمانة جالساً',
    types: LEG_ISOLATION, muscles: ['calves'], equipment: 'machine',
    cue: 'Bent knees target the deeper calf muscle, so slow the reps down rather than adding plates.',
  },

  /* --------------------------------------------------------------- core -- */
  {
    id: 'ex_hanging_leg_raise', name: 'Hanging leg raise', nameAr: 'رفع الأرجل بالتعليق',
    types: CORE_DAYS, muscles: ['abs', 'hip_flexors'], equipment: 'bodyweight',
    cue: 'Curl the pelvis up at the top; swinging straight legs is mostly hip flexor work.',
  },
  {
    id: 'ex_cable_crunch', name: 'Cable crunch', nameAr: 'طي البطن بالكيبل',
    types: CORE_DAYS, muscles: ['abs'], equipment: 'cable',
    cue: 'Round the spine down toward the knees instead of hinging at the hips.',
  },
  {
    id: 'ex_ab_wheel', name: 'Ab wheel rollout', nameAr: 'عجلة البطن',
    types: CORE_DAYS, muscles: ['abs', 'core', 'lats'], equipment: 'other',
    cue: 'Only roll out as far as you can keep the lower back from sagging.',
  },
  {
    id: 'ex_plank', name: 'Plank', nameAr: 'البلانك',
    types: CORE_DAYS, muscles: ['core', 'abs'], equipment: 'bodyweight',
    cue: 'Squeeze the glutes and brace hard for a short hold rather than sagging through a long one.',
  },
  {
    id: 'ex_russian_twist', name: 'Russian twist', nameAr: 'اللف الروسي',
    types: CORE_DAYS, muscles: ['obliques', 'abs'], equipment: 'other',
    cue: 'Turn the ribs and shoulders, not just the arms holding the weight.',
  },

  /* ------------------------------------------------------------- cardio -- */
  {
    id: 'ex_treadmill_walk', name: 'Incline treadmill walk', nameAr: 'المشي على المشاية بميل',
    types: CARDIO_DAYS, muscles: ['conditioning', 'calves', 'glutes'], equipment: 'machine',
    cue: 'Let go of the handrails; holding on removes most of the work the incline adds.',
  },
  {
    id: 'ex_treadmill_run', name: 'Treadmill run', nameAr: 'الجري على المشاية',
    types: CARDIO_DAYS, muscles: ['conditioning', 'quads', 'calves'], equipment: 'machine',
    cue: 'Land with the foot under the hips instead of reaching out in front with each stride.',
  },
  {
    id: 'ex_stationary_bike', name: 'Stationary bike', nameAr: 'الدراجة الثابتة',
    types: CARDIO_DAYS, muscles: ['conditioning', 'quads', 'glutes'], equipment: 'machine',
    cue: 'Raise the seat until the knee is almost straight at the bottom of the pedal stroke.',
  },
  {
    id: 'ex_rowing_machine', name: 'Rowing machine', nameAr: 'جهاز التجديف',
    types: CARDIO_DAYS, muscles: ['conditioning', 'upper_back', 'quads'], equipment: 'machine',
    cue: 'Drive with the legs first, then lean back and pull; arms-first is the usual mistake.',
  },
  {
    id: 'ex_elliptical', name: 'Elliptical', nameAr: 'الجهاز الإهليلجي',
    types: CARDIO_DAYS, muscles: ['conditioning', 'quads', 'glutes'], equipment: 'machine',
    cue: 'Add resistance rather than spinning the pedals faster with no load.',
  },
  {
    id: 'ex_stair_climber', name: 'Stair climber', nameAr: 'جهاز صعود الدرج',
    types: CARDIO_DAYS, muscles: ['conditioning', 'glutes', 'quads'], equipment: 'machine',
    cue: 'Stand tall and take full steps instead of leaning on the rails and taking small ones.',
  },
  {
    id: 'ex_jump_rope', name: 'Jump rope', nameAr: 'نط الحبل',
    types: CARDIO_DAYS, muscles: ['conditioning', 'calves'], equipment: 'other',
    cue: 'Turn the rope with the wrists and keep the jumps low to the floor.',
  },
];

export const EXERCISE_BY_ID: Record<string, Exercise> = (() => {
  const map: Record<string, Exercise> = {};
  for (const exercise of EXERCISES) map[exercise.id] = exercise;
  return map;
})();

/* ------------------------------------------------------------- search -- */

/**
 * Extra search words per exercise: abbreviations, gym slang and the Arabic
 * transliterations people actually type, which rarely match the formal Arabic
 * name. `Exercise` has no aliases field, so these live in the index only and
 * are never shown in the UI.
 */
const SEARCH_ALIASES: Record<string, string> = {
  ex_bench_press: 'bench press flat bench بنش بريس',
  ex_incline_barbell_press: 'incline bench بنش مائل',
  ex_incline_db_press: 'incline bench dumbbell بنش مائل دمبل',
  ex_flat_db_press: 'bench dumbbell بنش دمبل',
  ex_machine_chest_press: 'chest press بنش جهاز',
  ex_close_grip_bench: 'cgbp bench triceps بنش ضيق',
  ex_dip: 'dips parallel bars متوازي',
  ex_push_up: 'pushup press up بوش اب',
  ex_cable_fly: 'crossover cable crossover تفتيح كيبل',
  ex_pec_deck: 'machine fly butterfly تفتيح جهاز',
  ex_overhead_press: 'ohp military press shoulder press كتف شولدر بريس',
  ex_db_shoulder_press: 'shoulder press كتف دمبل شولدر',
  ex_lateral_raise: 'side raise delt raise رفرفه جانبي',
  ex_triceps_pushdown: 'tricep pushdown rope تراي ترايسبس',
  ex_overhead_triceps_ext: 'tricep extension french press تراي ترايسبس',
  ex_skull_crusher: 'skullcrusher skull crusher tricep تراي',
  ex_deadlift: 'dl deadlifts ديدلفت ديدليفت رفعه ميته',
  ex_pull_up: 'pullup chin bar عقله سحب',
  ex_chin_up: 'chinup underhand pull up عقله',
  ex_lat_pulldown: 'pulldown lats سحب امامي لات',
  ex_barbell_row: 'bent over row bor تجديف بار',
  ex_db_row: 'single arm row kroc row تجديف دمبل',
  ex_seated_cable_row: 'cable row تجديف كيبل',
  ex_chest_supported_row: 'machine row seal row تجديف جهاز',
  ex_t_bar_row: 'tbar row تجديف',
  ex_face_pull: 'facepull rope rear delt فيس بول',
  ex_rear_delt_fly: 'reverse fly reverse pec deck رفرفه خلفي',
  ex_shrug: 'shrugs traps ترابيس',
  ex_barbell_curl: 'bicep curl ez bar باي بايسبس',
  ex_incline_db_curl: 'bicep curl باي بايسبس',
  ex_db_hammer_curl: 'hammer bicep curl باي مطرقه',
  ex_cable_curl: 'bicep curl باي بايسبس',
  ex_back_squat: 'squat squats سكوات سكوات خلفي',
  ex_front_squat: 'squat سكوات امامي',
  ex_goblet_squat: 'squat سكوات دمبل',
  ex_hack_squat: 'squat سكوات هاك',
  ex_bulgarian_split_squat: 'split squat bss سكوات بلغاري',
  ex_romanian_deadlift: 'rdl deadlift stiff leg ديدليفت روماني رفعه رومانيه',
  ex_leg_press: 'legpress ليج بريس رجل',
  ex_walking_lunge: 'lunges lunge لنجز طعن',
  ex_step_up: 'box step stepup صعود',
  ex_hip_thrust: 'glute bridge هيب ثرست مؤخره',
  ex_leg_curl: 'hamstring curl ليج كيرل ثني ركبه',
  ex_leg_extension: 'quad extension ليج اكستنشن',
  ex_calf_raise: 'calves calf سمانه بطه',
  ex_seated_calf_raise: 'calves calf سمانه بطه',
  ex_hanging_leg_raise: 'leg raise abs بطن معده',
  ex_cable_crunch: 'crunch abs بطن معده',
  ex_ab_wheel: 'rollout abs بطن عجله',
  ex_plank: 'abs core بطن بلانك',
  ex_russian_twist: 'abs obliques بطن خصر',
  ex_treadmill_walk: 'treadmill walking cardio مشايه كارديو مشي',
  ex_treadmill_run: 'treadmill running jog cardio مشايه جري كارديو',
  ex_stationary_bike: 'cycling spin bike cardio دراجه سيكل كارديو',
  ex_rowing_machine: 'rower erg cardio روينق كارديو',
  ex_elliptical: 'cross trainer cardio كارديو',
  ex_stair_climber: 'stairmaster steps cardio درج كارديو',
  ex_jump_rope: 'skipping rope cardio حبل نط كارديو',
};

export interface ExerciseSearchOptions {
  limit?: number;
  /** Restrict to exercises that belong to this day type. */
  type?: SessionType;
  /** The user's custom exercises, searched alongside the bundled catalogue. */
  extra?: Exercise[];
}

const DEFAULT_LIMIT = 40;

const CAN_NORMALIZE = typeof String.prototype.normalize === 'function';

const LATIN_FOLD: Record<string, string> = {
  à: 'a', á: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', õ: 'o', ö: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ñ: 'n', ç: 'c', ý: 'y', ÿ: 'y',
};

const COMBINING = /[̀-ͯ]/g;
/**
 * Arabic short vowels, sukun, shadda, the hamza marks NFD leaves behind,
 * superscript alef and tatweel all carry no meaning for search.
 */
const ARABIC_MARKS = /[ً-ٰٟـ]/g;
const LATIN_ACCENTS = /[àáâãäåèéêëìíîïòóôõöùúûüñçýÿ]/g;
const ALEF_FORMS = /[آأإٱ]/g;
const NON_WORD_RUN = /[\s,./()\-_'"+&]+/g;

/** Lowercase, drop accents and Arabic diacritics, unify Arabic letter variants. */
function normalize(text: string): string {
  // Arabic letter variants are unified BEFORE any Unicode decomposition: NFD
  // splits أ into a bare alef plus a combining hamza, after which the
  // alef-form class no longer matches and a plain-alef query misses the word.
  let value = text
    .toLowerCase()
    .replace(ALEF_FORMS, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');

  value = CAN_NORMALIZE
    ? value.normalize('NFD').replace(COMBINING, '')
    : value.replace(LATIN_ACCENTS, (char) => LATIN_FOLD[char] ?? char);

  return value.replace(ARABIC_MARKS, '').replace(NON_WORD_RUN, ' ').trim();
}

interface IndexRow {
  exercise: Exercise;
  name: string;
  nameAr: string;
  /** Muscle labels, equipment words and aliases, in one normalised string. */
  terms: string;
  /** Cheap tie-breaker: a shorter name is usually the more basic lift. */
  length: number;
}

function buildRow(exercise: Exercise): IndexRow {
  const parts: string[] = [EQUIPMENT_TERMS[exercise.equipment]];
  for (const muscle of exercise.muscles) {
    parts.push(muscle);
    const label = MUSCLE_LABELS[muscle];
    if (label) parts.push(label);
  }
  const aliases = SEARCH_ALIASES[exercise.id];
  if (aliases) parts.push(aliases);
  return {
    exercise,
    name: normalize(exercise.name),
    nameAr: exercise.nameAr ? normalize(exercise.nameAr) : '',
    terms: normalize(parts.join(' ')),
    length: exercise.name.length,
  };
}

const BASE_INDEX: IndexRow[] = EXERCISES.map(buildRow);
const EXTRA_INDEX = new WeakMap<Exercise[], IndexRow[]>();

function indexFor(extra: Exercise[]): IndexRow[] {
  const cached = EXTRA_INDEX.get(extra);
  if (cached) return cached;
  const rows = extra.map(buildRow);
  EXTRA_INDEX.set(extra, rows);
  return rows;
}

/* Lower tiers win. Name matches outrank muscle and equipment matches. */
const TIER_NAME_EXACT = 0;
const TIER_NAME_PREFIX = 1;
const TIER_NAME_WORD = 2;
const TIER_NAME_SUBSTRING = 3;
const TIER_TERM = 4;
const TIER_ALL_TERMS = 5;
const NO_MATCH = 99;

function isBoundary(code: number): boolean {
  // Space is the only separator left after normalisation, but guard the rest.
  return code === 32 || code === 44 || code === 40 || code === 41 || code === 45;
}

/** 0 exact, 1 prefix, 2 word start, 3 anywhere, -1 no match. */
function fieldTier(hay: string, query: string): number {
  if (!hay) return -1;
  if (hay === query) return TIER_NAME_EXACT;
  const index = hay.indexOf(query);
  if (index < 0) return -1;
  if (index === 0) return TIER_NAME_PREFIX;
  return isBoundary(hay.charCodeAt(index - 1)) ? TIER_NAME_WORD : TIER_NAME_SUBSTRING;
}

function matchesEveryTerm(row: IndexRow, terms: string[]): boolean {
  for (let i = 0; i < terms.length; i += 1) {
    const term = terms[i];
    if (row.name.indexOf(term) >= 0) continue;
    if (row.nameAr && row.nameAr.indexOf(term) >= 0) continue;
    if (row.terms.indexOf(term) >= 0) continue;
    return false;
  }
  return true;
}

function rowTier(row: IndexRow, query: string, terms: string[]): number {
  let best = NO_MATCH;

  const nameTier = fieldTier(row.name, query);
  if (nameTier === TIER_NAME_EXACT) return TIER_NAME_EXACT;
  if (nameTier >= 0) best = nameTier;

  const arabicTier = fieldTier(row.nameAr, query);
  if (arabicTier === TIER_NAME_EXACT) return TIER_NAME_EXACT;
  if (arabicTier >= 0 && arabicTier < best) best = arabicTier;

  if (best <= TIER_NAME_PREFIX) return best;

  if (best === NO_MATCH && fieldTier(row.terms, query) >= 0) best = TIER_TERM;

  // "press chest" should still find "Machine chest press".
  if (best === NO_MATCH && terms.length > 1 && matchesEveryTerm(row, terms)) {
    best = TIER_ALL_TERMS;
  }

  return best;
}

interface Match {
  row: IndexRow;
  tier: number;
}

function compareMatches(a: Match, b: Match): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.row.length !== b.row.length) return a.row.length - b.row.length;
  return a.row.name < b.row.name ? -1 : a.row.name > b.row.name ? 1 : 0;
}

function collect(
  rows: IndexRow[],
  query: string,
  terms: string[],
  type: SessionType | undefined,
  out: Match[],
): void {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (type && !row.exercise.types.includes(type)) continue;
    const tier = rowTier(row, query, terms);
    if (tier !== NO_MATCH) out.push({ row, tier });
  }
}

/**
 * Every exercise offered on a given day type, the user's own first so a custom
 * lift is never buried under the bundled catalogue.
 */
export function exercisesForType(type: SessionType, extra?: Exercise[]): Exercise[] {
  const results: Exercise[] = [];
  const seen = new Set<string>();

  if (extra) {
    for (let i = 0; i < extra.length; i += 1) {
      const exercise = extra[i];
      if (seen.has(exercise.id) || !exercise.types.includes(type)) continue;
      seen.add(exercise.id);
      results.push(exercise);
    }
  }

  for (let i = 0; i < EXERCISES.length; i += 1) {
    const exercise = EXERCISES[i];
    if (seen.has(exercise.id) || !exercise.types.includes(type)) continue;
    seen.add(exercise.id);
    results.push(exercise);
  }

  return results;
}

export function exerciseById(id: string, extra?: Exercise[]): Exercise | undefined {
  if (extra) {
    for (let i = 0; i < extra.length; i += 1) {
      if (extra[i].id === id) return extra[i];
    }
  }
  return EXERCISE_BY_ID[id];
}

/**
 * Ranked search across the bundled catalogue and any custom exercises passed
 * in. An empty query falls back to the catalogue itself, filtered by day type.
 */
export function searchExercises(
  query: string,
  options: ExerciseSearchOptions = {},
): Exercise[] {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const type = options.type;
  const extra = options.extra;
  const normalized = normalize(query);

  if (!normalized) {
    if (type) return exercisesForType(type, extra).slice(0, limit);
    const all = extra && extra.length > 0 ? [...extra, ...EXERCISES] : EXERCISES;
    return all.slice(0, limit);
  }

  const terms = normalized.indexOf(' ') >= 0 ? normalized.split(' ') : [normalized];
  const matches: Match[] = [];
  if (extra && extra.length > 0) {
    collect(indexFor(extra), normalized, terms, type, matches);
  }
  collect(BASE_INDEX, normalized, terms, type, matches);
  matches.sort(compareMatches);

  const count = Math.min(limit, matches.length);
  const results: Exercise[] = new Array<Exercise>(count);
  for (let i = 0; i < count; i += 1) results[i] = matches[i].row.exercise;
  return results;
}
