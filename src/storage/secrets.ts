/**
 * Storage for the one secret this app holds: the user's Anthropic API key.
 *
 * Native platforms use the device keychain / keystore through expo-secure-store.
 * react-native-web has no keychain, so the browser build falls back to
 * AsyncStorage, which is localStorage: the key is stored in PLAIN TEXT there and
 * is readable by anything running on the same origin. Nothing here throws - a
 * storage failure means "no key", never a crashed screen.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_KEY = 'nutrition.anthropic.api.key';

let availability: Promise<boolean> | null = null;

function canUseSecureStore(): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(false);
  if (!availability) {
    availability = (async () => {
      try {
        return await SecureStore.isAvailableAsync();
      } catch {
        return false;
      }
    })();
  }
  return availability;
}

function normalize(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function readSecure(): Promise<string | null> {
  try {
    return normalize(await SecureStore.getItemAsync(API_KEY));
  } catch (error) {
    console.warn('[secrets] secure store read failed', error);
    return null;
  }
}

async function readFallback(): Promise<string | null> {
  try {
    return normalize(await AsyncStorage.getItem(API_KEY));
  } catch (error) {
    console.warn('[secrets] fallback read failed', error);
    return null;
  }
}

export async function getApiKey(): Promise<string | null> {
  if (await canUseSecureStore()) {
    const secure = await readSecure();
    if (secure) return secure;
  }
  return readFallback();
}

export async function setApiKey(key: string): Promise<void> {
  const value = normalize(key);
  if (!value) {
    await clearApiKey();
    return;
  }
  if (await canUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(API_KEY, value);
      // Drop any earlier unencrypted copy now that the keychain holds it.
      await AsyncStorage.removeItem(API_KEY).catch(() => undefined);
      return;
    } catch (error) {
      console.warn('[secrets] secure store write failed, falling back', error);
    }
  }
  try {
    await AsyncStorage.setItem(API_KEY, value);
  } catch (error) {
    console.warn('[secrets] could not save the API key', error);
  }
}

export async function clearApiKey(): Promise<void> {
  if (await canUseSecureStore()) {
    try {
      await SecureStore.deleteItemAsync(API_KEY);
    } catch (error) {
      console.warn('[secrets] secure store delete failed', error);
    }
  }
  try {
    await AsyncStorage.removeItem(API_KEY);
  } catch (error) {
    console.warn('[secrets] fallback delete failed', error);
  }
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) !== null;
}
