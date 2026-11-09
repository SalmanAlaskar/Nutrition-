import { Platform } from 'react-native';

/**
 * Reads data handed to the app in the URL fragment.
 *
 * The published build keeps everything in the browser on one device and has no
 * server, so there is no way to put a person's readings on their phone for
 * them. Bundling the data into the app is not an answer either: the build is
 * public, and that would publish their body-composition numbers to anyone with
 * the link. A fragment is never sent to the server, so the data travels only in
 * the link itself, and the link is only as private as the person keeps it.
 */
const PARAM = 'import';

/** Returns the payload once and removes it from the address bar. */
export function takeLinkImport(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  const hash = window.location.hash;
  if (!hash || hash.length < 2) return null;

  const params = new URLSearchParams(hash.slice(1));
  const raw = params.get(PARAM);
  if (!raw) return null;

  clearLinkImport(params);

  try {
    return decodeURIComponent(raw);
  } catch (error) {
    console.warn('[linkImport] payload could not be decoded', error);
    return null;
  }
}

/**
 * Takes the payload out of the address bar so a reload does not import twice
 * and the numbers do not sit in the history. Anything else in the fragment,
 * such as a route, is left alone.
 */
function clearLinkImport(params: URLSearchParams): void {
  params.delete(PARAM);
  const rest = params.toString();
  const next = `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ''}`;
  try {
    window.history.replaceState(null, '', next);
  } catch (error) {
    console.warn('[linkImport] address bar could not be tidied', error);
  }
}

/** Builds the fragment for a bundle, for whoever is handing the link over. */
export function buildLinkImport(bundleJson: string): string {
  return `#${PARAM}=${encodeURIComponent(bundleJson)}`;
}

/** True while the address bar is carrying a payload. Does not consume it. */
export function hasLinkImport(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return false;
  return new URLSearchParams(hash.slice(1)).get(PARAM) !== null;
}

/**
 * Calls back when a payload appears in the fragment of a page that is already
 * open, and returns the unsubscribe.
 *
 * Changing only the fragment of the current URL is a same-document navigation:
 * the browser fires `hashchange`, nothing reloads, and React is never
 * remounted. A link tapped while the app is already open therefore never
 * reaches the read at mount, and its data is dropped in silence until the
 * person happens to reload by hand - which looks exactly like the app showing
 * stale numbers that correct themselves later. Listening here is what makes the
 * link land on the first tap, open tab or not.
 */
export function subscribeLinkImport(onPayload: (payload: string) => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => undefined;

  const handle = () => {
    const payload = takeLinkImport();
    if (payload !== null) onPayload(payload);
  };

  // `replaceState` inside the handler tidies the address bar without firing
  // `hashchange` again, so taking the payload cannot loop.
  window.addEventListener('hashchange', handle);
  window.addEventListener('popstate', handle);
  return () => {
    window.removeEventListener('hashchange', handle);
    window.removeEventListener('popstate', handle);
  };
}
