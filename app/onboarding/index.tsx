import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Section, Txt } from '@/components/ui';
import { mirrorIcon, useDirection } from '@/i18n';
import { layout, spacing } from '@/theme';

/** The three things the setup asks for, in the order the steps ask them. */
const ASKS = [
  { titleKey: 'onboarding:askBody', hintKey: 'onboarding:askBodyHint' },
  { titleKey: 'onboarding:askActivity', hintKey: 'onboarding:askActivityHint' },
  { titleKey: 'onboarding:askGoal', hintKey: 'onboarding:askGoalHint' },
] as const;

export default function Welcome() {
  const router = useRouter();
  const { isRTL } = useDirection();
  const { t } = useTranslation(['onboarding', 'common']);

  return (
    <Screen scroll edges={['top', 'bottom']} contentStyle={styles.content}>
      {/*
        The first impression is a well-set page: the name at display scale, one
        paragraph under it, and nothing drawn around either.
      */}
      <Txt variant="display" accessibilityRole="header">
        {t('common:appName')}
      </Txt>
      <Txt color="muted" style={styles.intro}>
        {t('onboarding:intro')}
      </Txt>

      <Section title={t('onboarding:asksLabel')}>
        <View style={styles.asks}>
          {ASKS.map((ask) => (
            <View key={ask.titleKey}>
              <Txt>{t(ask.titleKey)}</Txt>
              <Txt variant="label" color="muted" style={styles.askHint}>
                {t(ask.hintKey)}
              </Txt>
            </View>
          ))}
        </View>
      </Section>

      <Section title={t('onboarding:privacyTitle')} gap="tight">
        <Txt variant="label" color="muted" style={styles.privacy}>
          {t('onboarding:privacyBody')}
        </Txt>
      </Section>

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
    paddingTop: spacing.xxxl,
  },
  intro: {
    marginTop: spacing.md,
    maxWidth: layout.maxTextWidth,
  },
  asks: {
    rowGap: spacing.lg,
  },
  askHint: {
    marginTop: 2,
  },
  privacy: {
    maxWidth: layout.maxTextWidth,
  },
  spacer: {
    flexGrow: 1,
    minHeight: spacing.xxl,
  },
  footnote: {
    marginTop: spacing.md,
  },
});
