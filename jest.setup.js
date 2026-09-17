/* eslint-env jest */
/**
 * Runs once per test file, after the test framework is installed.
 *
 * Two jobs only: give `@react-native-async-storage/async-storage` its official
 * in-memory jest mock, and mute the native-module warnings the Expo modules emit
 * when they boot outside a real app. Nothing the tests assert on is mocked here
 * - the repository tests deliberately exercise the real AsyncStorage mock, and
 * the vision tests install their own `fetch` and secrets doubles per file.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/** Warnings that only mean "no native runtime here", never a real failure. */
const MUTED = [
  'NativeModule',
  'Native module',
  'TurboModuleRegistry',
  'requireNativeComponent',
  'NativeEventEmitter',
  'has been extracted from react-native core',
  'not supported on this platform',
];

const isMuted = (args) =>
  typeof args[0] === 'string' && MUTED.some((needle) => args[0].includes(needle));

const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.warn = (...args) => {
    if (!isMuted(args)) originalWarn(...args);
  };
  console.error = (...args) => {
    if (!isMuted(args)) originalError(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});
