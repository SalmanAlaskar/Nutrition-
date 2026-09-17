import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Divider, ListRow, Screen, Txt } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

const ASKS = [
  {
    icon: 'body-outline',
    title: 'Sex, age, height and weight',
    subtitle: 'Estimates the energy you burn at rest.',
  },
  {
    icon: 'walk-outline',
    title: 'How active your week is',
    subtitle: 'Scales that estimate up to a whole day.',
  },
  {
    icon: 'flag-outline',
    title: 'What you are working toward',
    subtitle: 'Sets the target below, at or above maintenance.',
  },
] as const;

export default function Welcome() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Screen scroll edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={[styles.logo, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="nutrition" size={34} color={colors.accent} />
      </View>

      <Txt variant="title" style={styles.title}>
        Nutrition
      </Txt>
      <Txt color="muted" style={styles.intro}>
        Log what you eat — by search, by hand or by photographing the plate — and
        watch it against a daily calorie and macro target built from your own body
        details.
      </Txt>

      <Txt variant="caption" color="faint" weight="semibold" style={styles.sectionLabel}>
        THREE QUESTIONS FIRST
      </Txt>

      <Card padded={false}>
        {ASKS.map((ask, index) => (
          <View key={ask.title}>
            {index > 0 ? <Divider inset /> : null}
            <ListRow icon={ask.icon} title={ask.title} subtitle={ask.subtitle} />
          </View>
        ))}
      </Card>

      <Card style={styles.privacy}>
        <View style={styles.privacyHead}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.accent} />
          <Txt variant="label" weight="semibold">
            It all stays on this device
          </Txt>
        </View>
        <Txt variant="label" color="muted" style={styles.privacyBody}>
          Your profile, meals and weights are saved to this phone alone. No account,
          no sign-in, no sync. Photo analysis is the one feature that sends anything
          out, and it stays off until you turn it on in Settings.
        </Txt>
      </Card>

      <View style={styles.spacer} />

      <Button
        label="Get started"
        iconRight="arrow-forward"
        size="lg"
        fullWidth
        onPress={() => router.push('/onboarding/body')}
        accessibilityHint="Opens the first of three setup steps"
      />
      <Txt variant="caption" color="faint" align="center" style={styles.footnote}>
        Takes about a minute. You can change any of it later.
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.xxl,
  },
  logo: {
    alignItems: 'center',
    borderRadius: radius.xl,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  title: {
    marginTop: spacing.lg,
  },
  intro: {
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
  },
  privacy: {
    marginTop: spacing.lg,
  },
  privacyHead: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  privacyBody: {
    marginTop: spacing.sm,
  },
  spacer: {
    flexGrow: 1,
    minHeight: spacing.xl,
  },
  footnote: {
    marginTop: spacing.md,
  },
});
