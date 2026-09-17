/** English copy for the settings area. Keys are shared with ar/settings.ts. */
export const settings = {
  title: 'Settings',
  subtitle: 'Photo analysis, language, units, your data',

  /* photo analysis */
  photoTitle: 'Photo analysis',
  photoHint: 'What happens to a meal photo after you take it.',
  modeManual: 'Manual',
  modeManualDesc: 'The photo is only attached to the meal, and you type what you ate.',
  modeAi: 'AI scan',
  modeAiDesc:
    'The photo is uploaded to the API below, which names the foods and estimates the portions.',

  warningTitle: 'What AI scanning costs you',
  warningUpload:
    'Every photo you scan leaves this device. It is uploaded to the API at the base URL below, together with your key, and every scan is billed to your account.',
  warningKey:
    'On a phone the key sits in the device keychain. The web build has no keychain, so it sits in ordinary, unencrypted browser storage. Anyone who can unlock this device can open the app and spend against your key.',

  keyTitle: 'API key',
  keyHint: 'Kept on this device and sent with every scan.',
  keyChecking: 'Checking this device for a saved key',
  keyStored: 'Stored key',
  keySavedBadge: 'Saved',
  keyMaskSpoken: 'A key is saved on this device. It is hidden and is never shown again.',
  keyReplace: 'Replace',
  keyRemove: 'Remove',
  keyRemoveHint: 'Asks you to confirm before the key is deleted',
  keyLabel: 'API key',
  keyLabelNew: 'New API key',
  keyFieldHint: 'Saved on this device only, and never shown again once it is stored.',
  keySave: 'Save key',
  keySavedNotice: 'Key saved on this device.',
  keyRefusedNotice: 'This device refused to store the key, so photo analysis will ask for it again.',
  keyRemovedNotice: 'Key removed from this device.',
  keyRemoveTitle: 'Remove the API key?',
  keyRemoveMessage:
    'Photo analysis stops working until you enter a key again. Your meals and profile are untouched.',

  askTitle: 'Ask before each upload',
  askSubtitle: 'Show a confirmation naming the API before a photo leaves the device.',

  endpointTitle: 'Endpoint',
  endpointHint: 'The defaults work. Change these only if you know you need to.',
  model: 'Model',
  modelHint: 'The vision model asked to read your plate.',
  modelError: 'Enter a model name.',
  modelReset: 'Reset model',
  baseUrl: 'Base URL',
  baseUrlHint: 'Change this only if you route requests through your own proxy.',
  baseUrlEmpty: 'Enter the address of the API.',
  baseUrlInvalid: 'Start with https:// so the app knows how to reach it.',
  baseUrlReset: 'Reset base URL',

  /* language */
  languageTitle: 'Language',
  languageHint: 'Changes the whole app, including the direction it reads in.',
  languageNoteWeb: 'Arabic lays the app out right to left, and the change happens straight away.',
  languageNoteNative:
    'Arabic lays the app out right to left. The new direction appears the next time the app opens.',
  restartTitle: 'Restart to finish',
  restartMessage: 'Close the app and open it again to lay it out in the new direction.',

  /* units */
  unitsTitle: 'Units',
  unitsHint: 'How heights and weights are shown throughout the app.',
  unitMetric: 'Metric · cm / kg',
  unitImperial: 'Imperial · ft / lb',
  unitsLocked:
    'Units belong to your profile, and you do not have one yet. Set up your body and goal first and this choice unlocks.',
  setupProfile: 'Set up my profile',

  /* saved foods */
  foodsTitle: 'Your foods',
  foodsCount: '{{value}} foods you entered by hand.',
  foodsCountOne: 'One food you entered by hand.',
  foodsEmptyTitle: 'No foods of your own',
  foodsEmptyMessage:
    'Anything you type in by hand while logging a meal is saved here, so the next plate takes one tap.',
  foodEnergyPer100g: '{{value}} kcal per 100 g',
  foodEnergyPer100ml: '{{value}} kcal per 100 ml',
  foodDelete: 'Delete {{name}}',
  foodDeleteTitle: 'Delete {{name}}?',
  foodDeleteMessage: 'Meals you already logged with it keep the numbers they were saved with.',
  foodDeleteError: 'Could not delete {{name}}. Try again in a moment.',

  /* data */
  dataTitle: 'Data',
  dataHint: 'Everything lives on this device and nowhere else.',
  exportTitle: 'Export my data',
  exportHintNative:
    'One JSON file holding your profile, settings, meals, weight logs and custom foods, handed to the share sheet.',
  exportHintWeb:
    'One JSON file holding your profile, settings, meals, weight logs and custom foods. Browsers have no share sheet, so it opens in a window you can copy from.',
  exportShareTitle: '{{app}} data export',
  exportError: 'Could not build the export. Try again in a moment.',
  exportSheetTitle: 'Your data',
  exportSheetHint:
    'Select everything in the box, copy it, and paste it into a file named nutrition-export.json.',
  exportSheetClose: 'Close the export window',

  eraseTitle: 'Erase everything',
  eraseBody:
    'Deletes your profile, every logged meal and the photo reference on it, your weight history, your custom foods, your settings and the stored API key. Photos already in your camera roll are left alone.',
  eraseHint: 'Asks you to confirm twice before anything is deleted',
  eraseConfirmTitle: 'Erase everything?',
  eraseConfirmMessage:
    'This deletes your profile, every logged meal and its photo reference, your weight history, your custom foods, your settings and the stored API key.',
  eraseConfirmAction: 'Continue',
  eraseLastTitle: 'Last chance',
  eraseLastMessage:
    'There is no undo and nothing is backed up. Export your data first if you want a copy.',
  eraseLastAction: 'Erase everything',
  eraseError: 'Could not erase your data. Try again in a moment.',

  /* about */
  aboutTitle: 'About',
  devBuild: 'Dev build',
  version: 'v{{version}}',
  aboutBody:
    'Calories, macros, BMI and your daily targets are estimates. They come from standard equations and public food composition data, so a real plate and a real body will always differ from the numbers here. This app is not medical advice: talk to a doctor or a registered dietitian before making a big change to how you eat.'
} as const;
