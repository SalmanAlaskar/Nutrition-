/**
 * Handoff slot between the camera screen and the review screen.
 *
 * Router params are strings in a URL, so a base64 photo cannot travel that way.
 * The camera screen parks the shot here, navigates, and the review screen picks
 * it up. Module-level on purpose: synchronous, no provider, no persistence.
 */

import type { PhotoAnalysisResult } from '@/types';

export interface PendingPhotoMeal {
  /** Local file (or data) URI of the captured photo. */
  photoUri: string;
  /** Raw image bytes, when the caller already has them. */
  base64?: string;
  mimeType?: string;
  /** Set once analysis succeeds. */
  analysis?: PhotoAnalysisResult;
  /** User-facing reason analysis could not be completed. */
  error?: string;
}

type Listener = (value: PendingPhotoMeal | null) => void;

let pending: PendingPhotoMeal | null = null;
const listeners = new Set<Listener>();

export function setPendingPhotoMeal(value: PendingPhotoMeal | null): void {
  pending = value;
  // Copy first: a listener may subscribe or unsubscribe while we notify.
  for (const listener of Array.from(listeners)) {
    try {
      listener(pending);
    } catch (error) {
      console.warn('[pendingMeal] listener failed', error);
    }
  }
}

export function getPendingPhotoMeal(): PendingPhotoMeal | null {
  return pending;
}

export function clearPendingPhotoMeal(): void {
  setPendingPhotoMeal(null);
}

/** Watch the slot while a screen is mounted. Returns the unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
