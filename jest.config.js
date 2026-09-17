/**
 * Jest configuration for the Nutrition app.
 *
 * The suite is pure-logic: domain maths, the food database, search ranking,
 * the AsyncStorage repository and the vision service's parsing. It runs under
 * the jest-expo preset so `@/...` imports, the Expo module registry and the
 * React Native transform behave exactly as they do in the app bundle.
 */

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // jest-expo's own documented pattern: everything in node_modules is left
  // untransformed except the Expo / React Native packages that ship untranspiled
  // source, and the two babel packages that must never be transformed at all.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  clearMocks: true,
};
