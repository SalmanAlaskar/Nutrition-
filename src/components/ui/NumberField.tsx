import React, { useEffect, useState } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { TextField } from './TextField';

export interface NumberFieldProps {
  label?: string;
  value: number | null;
  onChange: (n: number | null) => void;
  /** Static unit shown at the trailing edge, e.g. "kg". */
  suffix?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  min?: number;
  max?: number;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Keeps digits and a single decimal separator; everything else is dropped. */
function sanitize(raw: string): string {
  const unified = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const parts = unified.split('.');
  const head = parts[0] ?? '';
  return parts.length > 1 ? `${head}.${parts.slice(1).join('')}` : head;
}

function toDisplay(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '' : String(value);
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  hint,
  error,
  min,
  max,
  autoFocus,
  onSubmitEditing,
  style,
}: NumberFieldProps) {
  const [text, setText] = useState(() => toDisplay(value));
  const [editing, setEditing] = useState(false);

  // While the field is untouched it mirrors the value owned by the screen.
  useEffect(() => {
    if (editing) return;
    setText(toDisplay(value));
  }, [value, editing]);

  const handleChangeText = (raw: string) => {
    const next = sanitize(raw);
    setText(next);

    if (next === '' || next === '.') {
      onChange(null);
      return;
    }
    const parsed = Number(next);
    if (Number.isFinite(parsed)) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    setEditing(false);

    if (text === '' || text === '.') {
      setText('');
      onChange(null);
      return;
    }

    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      setText(toDisplay(value));
      return;
    }

    let clamped = parsed;
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;

    setText(String(clamped));
    if (clamped !== value) {
      onChange(clamped);
    }
  };

  return (
    <TextField
      label={label}
      value={text}
      onChangeText={handleChangeText}
      placeholder={placeholder}
      keyboardType="decimal-pad"
      suffix={suffix}
      hint={hint}
      error={error}
      autoCapitalize="none"
      autoFocus={autoFocus}
      tabularValue
      returnKeyType="done"
      onSubmitEditing={onSubmitEditing}
      onFocus={() => setEditing(true)}
      onBlur={handleBlur}
      style={style}
    />
  );
}
