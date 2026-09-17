import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type AccessibilityProps,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { fontSize, fontWeight, radius, spacing, useTheme } from '@/theme';

import { Txt, tabularNums } from './Txt';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration is hidden from assistive tech; the DOM only understands aria-hidden. */
const DECORATIVE: AccessibilityProps = Platform.select<AccessibilityProps>({
  web: { 'aria-hidden': true },
  default: {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  },
});

/**
 * react-native-web paints a browser focus ring on the input itself. The RN style
 * types have no 'none' for outlineStyle, hence the cast; native ignores both keys.
 */
const NO_OUTLINE = { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle;
const WEB_INPUT_STYLE: TextStyle | null = Platform.OS === 'web' ? NO_OUTLINE : null;

export interface TextFieldProps {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  error?: string;
  hint?: string;
  /** Static unit shown at the trailing edge, e.g. "g" or "kcal". */
  suffix?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  maxLength?: number;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  /** Ionicons glyph at the leading edge. */
  icon?: string;
  editable?: boolean;
  secureTextEntry?: boolean;
  /** Locks digit width so a changing number never jitters. */
  tabularValue?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  error,
  hint,
  suffix,
  multiline = false,
  autoFocus = false,
  autoCapitalize = 'sentences',
  maxLength,
  returnKeyType,
  onSubmitEditing,
  icon,
  editable = true,
  secureTextEntry = false,
  tabularValue = false,
  onFocus,
  onBlur,
  style,
}: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const invalid = Boolean(error);
  // Border width never changes, only its colour, so focus cannot shift the layout.
  const borderColor = invalid ? colors.danger : focused ? colors.accent : colors.border;
  // The ring lives in constant padding around the field, so it cannot shift it either.
  // It only appears on focus, which is what keyboard users need instead of the
  // browser outline this component suppresses.
  const ringColor = !focused ? 'transparent' : invalid ? colors.surfaceAlt : colors.accentSoft;

  const spokenLabel = [label ?? placeholder, suffix].filter(Boolean).join(', ') || undefined;

  return (
    <View style={style}>
      {label ? (
        <Txt variant="label" color={invalid ? 'danger' : 'muted'} weight="semibold" style={styles.label}>
          {label}
        </Txt>
      ) : null}

      <View style={[styles.ring, { backgroundColor: ringColor }]}>
        <View
          style={[
            styles.field,
            {
              backgroundColor: editable ? colors.surface : colors.surfaceAlt,
              borderColor,
            },
            multiline ? styles.fieldMultiline : null,
          ]}
        >
          {icon ? (
            <View style={styles.icon} {...DECORATIVE}>
              <Ionicons
                name={icon as IconName}
                size={18}
                color={focused ? colors.accent : colors.textFaint}
              />
            </View>
          ) : null}

          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoCorrect={false}
            autoFocus={autoFocus}
            maxLength={maxLength}
            multiline={multiline}
            editable={editable}
            secureTextEntry={secureTextEntry}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            selectionColor={colors.accent}
            accessibilityLabel={spokenLabel}
            accessibilityHint={error ?? hint}
            onFocus={() => {
              setFocused(true);
              onFocus?.();
            }}
            onBlur={() => {
              setFocused(false);
              onBlur?.();
            }}
            style={[
              styles.input,
              { color: editable ? colors.text : colors.textMuted },
              tabularValue ? styles.inputTabular : null,
              multiline ? styles.inputMultiline : null,
              WEB_INPUT_STYLE,
            ]}
          />

          {suffix ? (
            <Txt variant="label" color="faint" weight="medium" style={styles.suffix} {...DECORATIVE}>
              {suffix}
            </Txt>
          ) : null}
        </View>
      </View>

      {error ? (
        <View style={styles.helperRow}>
          <View {...DECORATIVE}>
            <Ionicons name="alert-circle" size={13} color={colors.danger} />
          </View>
          <Txt variant="caption" color="danger" weight="medium" style={styles.helper}>
            {error}
          </Txt>
        </View>
      ) : hint ? (
        <Txt variant="caption" color="faint" style={[styles.helper, styles.helperAlone]}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

const RING = 2;

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.xs + 2,
    marginLeft: spacing.xs / 2,
  },
  ring: {
    borderRadius: radius.md + RING,
    padding: RING,
  },
  field: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: spacing.md + 2,
  },
  fieldMultiline: {
    alignItems: 'flex-start',
    minHeight: 100,
    paddingVertical: spacing.md,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    width: 20,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    letterSpacing: -0.1,
    paddingVertical: spacing.md,
  },
  inputTabular: tabularNums,
  inputMultiline: {
    paddingVertical: 0,
    textAlignVertical: 'top',
  },
  suffix: {
    marginLeft: spacing.sm,
  },
  helperRow: {
    alignItems: 'center',
    columnGap: spacing.xs + 1,
    flexDirection: 'row',
    marginTop: spacing.xs + 2,
    marginLeft: spacing.xs,
  },
  helper: {
    flexShrink: 1,
  },
  helperAlone: {
    marginTop: spacing.xs + 2,
    marginLeft: spacing.xs,
  },
});
