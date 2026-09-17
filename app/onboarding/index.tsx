import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View, type AccessibilityProps } from 'react-native';

import { Button, Card, Divider, ListRow, Screen, Txt } from '@/components/ui';
import { mirrorIcon, useDirection } from '@/i18n';
import { radius, spacing, useTheme } from '@/theme';

import { Eyebrow } from './_layout';

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/** The three things the setup asks for, in the order the steps ask them. */
const ASKS = [
  {
    icon: 'body-outline',
    titleKey: 'onboarding:askBody',
    hintKey: 'onboarding:askBodyHint',
  },
  {
    icon: 'walk-outline',
    titleKey: 'onboarding:askActivity',
    hintKey: 'onboarding:askActivityHint',
  },
  {
    icon: 'flag-outline',
    titleKey: 'onboarding:askGoal',
    hintKey: 'onboarding:askGoalHint',
  },
] as const;

export default function Welcome() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isRTL } = useDirection();
  const { t } = useTranslation(['onboarding', 'common']);

  return (
    <Screen scroll edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={[styles.logo, { backgroundColor: colors.accentSoft }]} {...DECORATIVE}>
        <Ionicons name="nutrition" size={34} color={colors.accent} />
      </View>

      <Txt variant="title" style={styles.title} accessibilityRole="header">
        {t('common:appName')}
      </Txt>
      <Txt color="muted" style={styles.intro}>
        {t('onboarding:intro')}
      </Txt>

      <Eyebrow label={t('onboarding:asksLabel')} style={styles.sectionLabel} />

      <Card padded={false}>
        {ASKS.map((ask, index) => (
          <View key={ask.titleKey}>
            {index > 0 ? <Divider inset /> : null}
            <ListRow
              icon={ask.icon}
              title={t(ask.titleKey)}
              subtitle={t(ask.hintKey)}
            />
          </View>
        ))}
      </Card>

      <Card style={styles.privacy}>
        <View style={styles.privacyHead}>
          <View {...DECORATIVE}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.accent} />
          </View>
          <Txt variant="label" weight="semibold" style={styles.privacyTitle}>
            {t('onboarding:privacyTitle')}
          </Txt>
        </View>
        <Txt variant="label" color="muted" style={styles.privacyBody}>
          {t('onboarding:privacyBody')}
        </Txt>
      </Card>

      <View style={styles.spacer} />

      <Button
        label={t('onboarding:start')}
        iconRight={mirrorIcon('arrow-forward', isRTL)}
        size="lg"
        fullWidth
        onPress={() => router.push('/onboarding/body')}
        accessibilityHint={t('onboarding:startHint')}
      />
      <Txt variant="caption" color="faint" align="center" style={styles.footnote}>
        {t('onboarding:footnote')}
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
  privacyTitle: {
    flex: 1,
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
