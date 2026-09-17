/** English copy for the insights area. Keys are shared with ar/insights.ts. */
export const insights = {
  listTitle: 'Insights',
  emptyTitle: 'Nothing to flag yet',
  emptyMessage:
    'Log a few days of meals, a session and a body reading, and this list fills in with numbers from your own days.',

  /* Counted nouns. The engine sends the number, the card picks the form.
     English needs a singular and a plural; Arabic needs four. */
  dayCountOne: '1 day',
  dayCountTwo: '2 days',
  dayCountFew: '{{n}} days',
  dayCountMany: '{{n}} days',
  mealCountOne: '1 meal',
  mealCountTwo: '2 meals',
  mealCountFew: '{{n}} meals',
  mealCountMany: '{{n}} meals',
  sessionCountOne: '1 session',
  sessionCountTwo: '2 sessions',
  sessionCountFew: '{{n}} sessions',
  sessionCountMany: '{{n}} sessions',

  /* Body segments, as they read inside a sentence. */
  segRightArm: 'the right arm',
  segLeftArm: 'the left arm',
  segTrunk: 'the trunk',
  segRightLeg: 'the right leg',
  segLeftLeg: 'the left leg',
  segBothArms: 'both arms',
  segBothLegs: 'both legs',

  /* Buttons under a card. */
  actionLogMeal: 'Log a meal',
  actionOpenHistory: 'Open history',
  actionOpenTraining: 'Open training',
  actionViewScans: 'View readings',
  actionAddScan: 'Add a reading',
  actionFinishProfile: 'Finish profile',

  /* Profile gate. */
  gateProfileTitle: 'No targets to measure against',
  gateProfileDetail:
    'Calorie and macro targets are built from sex, age, height, weight and goal. Without them there is nothing to hold your logged days against.',

  /* Protein. */
  proteinTitle: 'Protein is landing under target',
  proteinDetailFull:
    'Protein averaged {{avg}} g a day against a {{target}} g target over the last {{window}} days, {{short}} g short. One protein-led item a day covers most of that.',
  proteinDetailPartial:
    'Protein averaged {{avg}} g a day against a {{target}} g target across {{logged}} of the last {{window}} days, {{short}} g short. One protein-led item a day covers most of that.',

  /* Calories. */
  caloriesOverTitle: 'Calories are running over target',
  caloriesUnderTitle: 'Calories are running under target',
  caloriesOverDetailFull:
    'Calories averaged {{avg}} kcal a day against a {{target}} kcal target over the last {{window}} days, {{diff}} kcal over. The history chart shows which days carry the difference.',
  caloriesOverDetailPartial:
    'Calories averaged {{avg}} kcal a day against a {{target}} kcal target across {{logged}} of the last {{window}} days, {{diff}} kcal over. The history chart shows which days carry the difference.',
  caloriesUnderDetailFull:
    'Calories averaged {{avg}} kcal a day against a {{target}} kcal target over the last {{window}} days, {{diff}} kcal under. An average this low can also mean items were logged late or not at all.',
  caloriesUnderDetailPartial:
    'Calories averaged {{avg}} kcal a day against a {{target}} kcal target across {{logged}} of the last {{window}} days, {{diff}} kcal under. An average this low can also mean items were logged late or not at all.',

  /* A single day that reads far below the target. */
  lowDayTitle: '{{date}} reads unusually low',
  lowDayDetail:
    'That day totals {{total}} kcal from {{meals}}, under the {{floor}} kcal mark for a {{target}} kcal target. Filling the gaps keeps the averages honest.',
  lowDayDetailMore:
    'That day totals {{total}} kcal from {{meals}}, under the {{floor}} kcal mark for a {{target}} kcal target. {{days}} in the last {{window}} read that low. Filling the gaps keeps the averages honest.',

  /* Training gap. */
  trainingGapTitle: 'No session logged in {{days}}',
  trainingGapDetail:
    'The last one was {{date}}. Logging the next session starts the count again.',
  trainingGapDetailMissed:
    'The last one was {{date}}, and {{missed}} on the schedule have passed since. Logging the next session starts the count again.',

  /* One day type slipping more than the others. */
  missedTypeTitle: '{{label}} days are the ones slipping',
  missedTypeDetail:
    'The schedule asked for {{label}} on {{scheduled}} in the last {{window}} days, and {{completed}} of them were logged. It falls on {{weekdays}}, so the next one is the one to protect.',
  missedTypeDetailNone:
    'The schedule asked for {{label}} on {{scheduled}} in the last {{window}} days, and none were logged. It falls on {{weekdays}}, so the next one is the one to protect.',

  /* Sessions so far this week. */
  weekOnTrackTitle: '{{sessions}} logged this week',
  weekBehindTitle: '{{done}} of {{planned}} logged this week',
  weekOnTrackDetail:
    'The schedule called for {{planned}} between Sunday and today, so the week is on plan so far.',
  weekBehindDetail:
    'The schedule called for {{planned}} between Sunday and today. The rest of the week is where the count evens out.',

  /* Headline for two readings. */
  trendMuscleUpFatDown: 'Muscle up, fat down',
  trendMuscleUpFatUp: 'Muscle and fat both up',
  trendMuscleUp: 'Muscle up since the last reading',
  trendMuscleDownFatUp: 'Muscle down, fat up',
  trendMuscleDown: 'Muscle down since the last reading',
  trendFatUp: 'Fat up since the last reading',
  trendFatDown: 'Fat down since the last reading',
  trendWeightUp: 'Weight up since the last reading',
  trendWeightDown: 'Weight down since the last reading',
  trendFlat: 'Little moved between the last two readings',

  trendDetailMuscleFat:
    'Over {{days}} between {{from}} and {{to}}, skeletal muscle went from {{muscleFrom}} to {{muscleTo}} kg and body fat from {{fatFrom}} to {{fatTo}} kg. A third reading on the same machine makes the line clearer.',
  trendDetailMuscleFatPercent:
    'Over {{days}} between {{from}} and {{to}}, skeletal muscle went from {{muscleFrom}} to {{muscleTo}} kg and body fat from {{fatFrom}}% to {{fatTo}}%. A third reading on the same machine makes the line clearer.',
  trendDetailMuscle:
    'Over {{days}} between {{from}} and {{to}}, skeletal muscle went from {{muscleFrom}} to {{muscleTo}} kg. A third reading on the same machine makes the line clearer.',
  trendDetailFat:
    'Over {{days}} between {{from}} and {{to}}, body fat went from {{fatFrom}} to {{fatTo}} kg. A third reading on the same machine makes the line clearer.',
  trendDetailFatPercent:
    'Over {{days}} between {{from}} and {{to}}, body fat went from {{fatFrom}}% to {{fatTo}}%. A third reading on the same machine makes the line clearer.',
  trendDetailWeight:
    'Over {{days}} between {{from}} and {{to}}, weight went from {{weightFrom}} to {{weightTo}} kg. A third reading on the same machine makes the line clearer.',

  /* Left against right. */
  imbalanceArmRightTitle: 'The right arm reads heavier than the left',
  imbalanceArmLeftTitle: 'The left arm reads heavier than the right',
  imbalanceLegRightTitle: 'The right leg reads heavier than the left',
  imbalanceLegLeftTitle: 'The left leg reads heavier than the right',
  imbalanceArmDetail:
    'On {{date}} the right arm held {{right}} kg of lean mass against {{left}} kg on the left, a {{share}}% difference. Per-limb readings carry some noise, so watch it across readings rather than one.',
  imbalanceLegDetail:
    'On {{date}} the right leg held {{right}} kg of lean mass against {{left}} kg on the left, a {{share}}% difference. Per-limb readings carry some noise, so watch it across readings rather than one.',

  /* A segment standing still while others move. */
  stalledTitle: 'Little movement in {{segments}}',
  stalledDetail:
    'Between {{from}} and {{to}} the reading for {{mover}} rose {{gain}} kg, while {{segments}} moved less than {{noise}} kg. Load and reps logged in each session are what show whether that work is progressing.',

  /* Consistency. */
  streakTitle: '{{days}} logged in a row',
  streakDetail:
    'Meals are on record for {{days}} without a break, and every average here is drawn from that run.',
  missedDaysTitle: '{{logged}} of the last {{window}} have meals',
  missedDaysDetail:
    '{{missed}} in that fortnight have nothing logged, so every average here comes from {{logged}}. Back-filling a day takes a minute in history.',

  /* Gates. */
  gateFoodTitle: 'Food averages need more days',
  gateFoodDetailNone:
    'Nothing is logged in the last {{window}} days. At {{min}} days this list starts reporting protein and calorie averages.',
  gateFoodDetail:
    '{{logged}} of the last {{window}} have meals. At {{min}} days this list starts reporting protein and calorie averages.',
  gateTrainingTitle: 'No sessions logged yet',
  gateTrainingDetail:
    'Once sessions are on record, this list can hold what the schedule asked for against what was done, by day type.',
  gateScanNoneTitle: 'No body reading on file',
  gateScanOneTitle: 'One body reading on file',
  gateScanNoneDetail:
    'A body-composition reading adds muscle, fat and per-limb numbers that weight alone cannot show.',
  gateScanOneDetail:
    'A second reading is what turns a single sheet into a direction for muscle, fat and each limb.'
} as const;
