# Trying Nutrition on a phone

Three ways to get the app onto a device, from fastest to most permanent. Start with option A.

All commands run from the repo root:

```bash
cd ~/Desktop/Nutrition-
```

---

## A. Expo Go — one minute, both platforms, no accounts

The quickest way to hold the app in your hand. Your phone runs the real app; the JavaScript is
served from this Mac over the network.

**1. Install Expo Go on the phone**

- iPhone: App Store, search "Expo Go"
- Android: Play Store, search "Expo Go"

**2. Start the server**

```bash
npm run share
```

The first run asks to install a tunnelling helper. Accept it. After a few seconds a QR code
appears in the terminal along with a URL that looks like `exp://xxxxxxx.exp.direct`.

**3. Open it**

- iPhone: open the Camera app, point it at the QR code, tap the banner.
- Android: open Expo Go, tap "Scan QR code", point it at the code.

The app downloads and launches. Enter your body details and start logging.

**What to know**

- The tunnel works over mobile data, so the phone does not need to be on the same Wi-Fi.
- It only lives while that terminal is running. Close the terminal and the link dies.
- Every time you restart it you get a new URL.
- Expo Go cannot run custom native code. Everything in this app works there.

---

## B. Android — a real installable file

Produces an `.apk` you can install directly, plus a link you can send to anyone.

**1. Create a free Expo account** at https://expo.dev/signup

**2. Sign in**

```bash
npx expo login
```

**3. Build**

```bash
npm run build:android
```

The first run asks a few setup questions. Accept the defaults; it will generate an Android
keystore for you and store it on your Expo account.

The build runs on Expo's servers and takes roughly 10 to 20 minutes. When it finishes the
terminal prints a link, and the same build appears at https://expo.dev under your project.

**4. Install**

Open that link on the Android phone and tap the download. Android will ask you to allow
installs from that source once. The app then installs like any other.

You can send that link to anyone. It does not expire on its own.

---

## C. iPhone — TestFlight

Apple does not allow an app onto an iPhone without a paid developer account. There is no way
around this; it is Apple's rule, not a limitation of the project.

**1. Enrol in the Apple Developer Program** at https://developer.apple.com/programs

It costs 99 US dollars a year and approval usually takes a day or two.

**2. Create a free Expo account** at https://expo.dev/signup if you have not already, then:

```bash
npx expo login
```

**3. Build a release**

```bash
npm run build:ios
```

You will be asked to sign in with your Apple ID. Expo then creates the signing certificate and
provisioning profile for you. The build takes roughly 15 to 30 minutes.

**4. Send it to TestFlight**

```bash
npx eas-cli@latest submit --platform ios --latest
```

This uploads the build to App Store Connect. Apple then runs an automated review of the build,
which usually takes between 15 minutes and a few hours.

**5. Invite testers**

Open https://appstoreconnect.apple.com, go to your app, then TestFlight. Add testers by email,
or turn on a public link to share with anyone. Your testers install the TestFlight app from the
App Store and open your invitation.

**Faster alternative if you only need it on your own iPhone:** skip TestFlight and use
`npm run build:ios` with the phone's UDID registered. EAS will offer to register the device and
give you a direct install link, the same way the Android build works. This still needs the paid
developer account.

---

## Which one to choose

| You want | Use |
|---|---|
| To see it working in the next five minutes | A |
| To put it on colleagues' Android phones | B |
| To put it on iPhones, or to move toward the App Store | C |

---

## If something goes wrong

**The QR code will not connect.** Check that the terminal running `npm run share` is still open.
Try `npx expo start --tunnel --clear` to clear the bundler cache.

**Expo Go shows a red error screen.** Shake the phone to open the developer menu and reload.
If it persists, stop the server and run `npx expo start --clear`.

**The Android build fails on the first try.** Almost always a missing answer during setup. Run
it again; the questions are only asked once.

**The iOS build cannot find a certificate.** Let EAS manage credentials for you by answering
yes when it offers. Manual certificates are only worth it if your organisation requires them.

---

## Running the checks

```bash
npm run typecheck
```

```bash
npm test
```
