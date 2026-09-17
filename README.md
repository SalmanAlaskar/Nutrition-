# Nutrition

A cross-platform meal tracker for iOS and Android. Enter your body details once, get a daily
calorie and macro target, then log meals either by searching a built-in food database or by
photographing the plate.

Built with [Expo](https://expo.dev) (React Native) and [Expo Router](https://docs.expo.dev/router/introduction/),
so a single codebase runs on both platforms, plus the browser for quick checks.

## Features

- **Body profile** — sex, age, height, weight, activity level and goal, in metric or imperial.
- **Daily targets** — calories from the Mifflin-St Jeor equation scaled by activity and goal,
  with protein set from body weight, fat at a fixed share of energy, and carbohydrate taking
  the remainder.
- **Manual logging** — search a bundled offline database of everyday and Gulf/Levantine foods,
  pick a realistic portion, or define your own food.
- **Photo logging** — photograph a meal and have a vision model estimate the foods and portions.
  Every estimate is editable before it is saved. Off by default.
- **Dashboard** — calories and macros against target for any day, grouped by meal.
- **History** — calorie trend, logging streak, averages, and weight over time.
- **Local first** — profile, meals and weights live in on-device storage. Nothing is uploaded
  unless you turn photo analysis on.

## Running it

```bash
npm install
npx expo start
```

Then scan the QR code with [Expo Go](https://expo.dev/go) on an iPhone or Android phone, or
press `i` / `a` for a simulator, or `w` for the browser.

To build installable apps:

```bash
npx eas build --platform ios
npx eas build --platform android
```

## Photo analysis

Photo analysis is off until you turn it on in Settings and supply an Anthropic API key. The key
is stored in the device keychain through `expo-secure-store`. Turning it on means each meal
photo you scan is uploaded to the Anthropic API. On the web build the key is kept in ordinary
browser storage, which is not encrypted.

The model returns an estimate, not a measurement. Portions are inferred from what the picture
shows, hidden fats and sauces are guesswork, and every row is editable before you save it.

## Layout

```
app/                 screens and routing (expo-router)
  onboarding/        first-run body-info flow
  (tabs)/            Today, History, Profile
  meal/              add, custom food, camera, review, detail
src/
  domain/            nutrition maths, dates, totals — pure and unit tested
  data/              bundled food database and search
  storage/           AsyncStorage repository and keychain wrapper
  services/          meal-photo analysis
  state/             app-wide store
  components/ui/     design system
  theme/             colour, spacing and type tokens
```

## Checks

```bash
npm run typecheck
npm test
```

## Note

The numbers this app produces are estimates from standard formulas and public food composition
data. It is not medical advice.
