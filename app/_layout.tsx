import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n, { DirectionProvider, initI18n, type LanguageCode } from '@/i18n';
import { AppProvider } from '@/state/AppStore';
import { ThemeProvider, useTheme } from '@/theme';

function RootStack() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="meal/add" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="meal/custom" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="meal/camera" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="meal/review" />
        <Stack.Screen name="meal/[id]" />
        <Stack.Screen name="training/session" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="training/program" />
        <Stack.Screen
          name="training/exercise-picker"
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="body/index" />
        <Stack.Screen name="body/add" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="body/import" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}

/** Holds the first paint until the stored language is known, so nothing flips. */
function Localized({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode | null>(null);

  useEffect(() => {
    let active = true;
    void initI18n().then((applied) => {
      if (active) setLanguage(applied);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // The shared i18next instance, not useTranslation(): before init the hook
    // hands back a stub with no event emitter on it.
    const onChange = (next: string) => setLanguage(next === 'ar' ? 'ar' : 'en');
    i18n.on('languageChanged', onChange);
    return () => {
      i18n.off('languageChanged', onChange);
    };
  }, []);

  if (!language) return <BootSplash />;

  return <DirectionProvider language={language}>{children}</DirectionProvider>;
}

function BootSplash() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: colors.bg,
        flex: 1,
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Localized>
            <AppProvider>
              <RootStack />
            </AppProvider>
          </Localized>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
