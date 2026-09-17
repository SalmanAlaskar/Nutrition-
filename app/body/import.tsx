import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityProps,
} from 'react-native';

import { AppHeader, Button, Card, LoadingView, Screen, TextField, Txt } from '@/components/ui';
import {
  analyzeScanDocument,
  describeScanError,
  fetchInBodyQr,
  serializeScanDraft,
  type ScanDraft,
  type ScanDocumentKind,
} from '@/services/bodyScan';
import { useApp } from '@/state/AppStore';
import { hasApiKey } from '@/storage/secrets';
import { radius, spacing, useTheme } from '@/theme';
import type { ScanSource } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Decoration only: the surrounding text already carries the meaning. */
const DECORATIVE: AccessibilityProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

type Phase = 'idle' | 'scanning' | 'consent' | 'fetching' | 'analyzing';

interface Failure {
  headline: string;
  suggestion: string;
}

/** A file that is picked but not yet sent, while the upload is confirmed. */
interface PendingFile {
  uri: string;
  base64?: string;
  mimeType?: string;
  kind: ScanDocumentKind;
  name: string;
}

/** A sheet that was read, but too thinly to present as a finished reading. */
interface ThinResult {
  draft: ScanDraft;
  fieldCount: number;
  source: ScanSource;
}

const IMAGE_PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  base64: true,
  exif: false,
};

const CAMERA_HEIGHT = 260;

/** Host of the configured API, for the line shown before a sheet is uploaded. */
function apiHost(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const withoutScheme = trimmed.replace(/^https?:\/\//, '');
  return withoutScheme.split('/')[0] || 'the analysis service';
}

export default function ImportBodyScanScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { settings } = useApp();

  const [phase, setPhase] = useState<Phase>('idle');
  const [url, setUrl] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [thin, setThin] = useState<ThinResult | null>(null);
  const [pending, setPending] = useState<PendingFile | null>(null);
  const [keySaved, setKeySaved] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const abortRef = useRef<AbortController | null>(null);
  const scannedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void hasApiKey().then((saved) => {
      if (active) setKeySaved(saved);
    });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  const aiReady = settings.photoAnalysis === 'ai' && keySaved;
  const busy = phase === 'fetching' || phase === 'analyzing';
  // Browsers have no dependable barcode reader behind CameraView, so the web
  // build offers the paste field alone rather than a preview that never fires.
  const canScan = Platform.OS !== 'web';

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/body');
  }, [router]);

  const handoff = useCallback(
    (draft: ScanDraft, source: ScanSource, sourceUri?: string) => {
      router.replace({
        pathname: '/body/add',
        params: {
          draft: serializeScanDraft(draft),
          source,
          ...(sourceUri && !sourceUri.startsWith('data:') ? { sourceUri } : {}),
        },
      });
    },
    [router],
  );

  const typeItIn = useCallback(() => {
    router.replace('/body/add');
  }, [router]);

  /* ------------------------------------------------------------------ QR -- */

  const readUrl = useCallback(
    (candidate: string) => {
      if (busy) return;
      setFailure(null);
      setThin(null);
      setPhase('fetching');

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      void fetchInBodyQr({ url: candidate, signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          setPhase('idle');
          if (result.partial) {
            setThin({ draft: result.draft, fieldCount: result.fieldCount, source: 'qr' });
            return;
          }
          handoff(result.draft, 'qr');
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setPhase('idle');
          setFailure(describeScanError(error));
        });
    },
    [busy, handoff],
  );

  const handleBarcode = useCallback(
    (result: BarcodeScanningResult) => {
      if (scannedRef.current) return;
      scannedRef.current = true;
      setPhase('idle');
      setUrl(result.data);
      readUrl(result.data);
    },
    [readUrl],
  );

  const startScanning = useCallback(() => {
    scannedRef.current = false;
    setFailure(null);
    setThin(null);
    if (permission?.granted) {
      setPhase('scanning');
      return;
    }
    void requestPermission().then((next) => {
      if (next.granted) setPhase('scanning');
      else {
        setFailure({
          headline: 'Camera is blocked',
          suggestion:
            'Allow camera access to scan the code, or open the link yourself and paste it below.',
        });
      }
    });
  }, [permission, requestPermission]);

  /* -------------------------------------------------------------- picking -- */

  const analyze = useCallback(
    (file: PendingFile) => {
      setFailure(null);
      setThin(null);
      setPending(null);
      setPhase('analyzing');

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      void analyzeScanDocument({
        uri: file.uri,
        base64: file.base64,
        mimeType: file.mimeType,
        kind: file.kind,
        settings,
        signal: controller.signal,
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          setPhase('idle');
          const source: ScanSource = file.kind === 'pdf' ? 'document' : 'photo';
          if (result.partial) {
            setThin({ draft: result.draft, fieldCount: result.fieldCount, source });
            return;
          }
          handoff(result.draft, source, file.uri);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setPhase('idle');
          setFailure(describeScanError(error));
        });
    },
    [settings, handoff],
  );

  const offer = useCallback(
    (file: PendingFile) => {
      if (settings.confirmBeforeUpload) {
        setPending(file);
        setPhase('consent');
        return;
      }
      analyze(file);
    },
    [settings.confirmBeforeUpload, analyze],
  );

  const pickPhoto = useCallback(() => {
    if (busy) return;
    setFailure(null);
    void ImagePicker.launchImageLibraryAsync(IMAGE_PICKER_OPTIONS)
      .then((result) => {
        if (result.canceled || result.assets.length === 0) return;
        const asset = result.assets[0];
        if (!asset) return;
        offer({
          uri: asset.uri,
          base64: asset.base64 ?? undefined,
          mimeType: asset.mimeType,
          kind: 'image',
          name: asset.fileName ?? 'Photo of the sheet',
        });
      })
      .catch(() => {
        setFailure({
          headline: 'Photo could not be opened',
          suggestion: 'Pick another image, or type the numbers in.',
        });
      });
  }, [busy, offer]);

  const pickPdf = useCallback(() => {
    if (busy) return;
    setFailure(null);
    void DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      multiple: false,
      copyToCacheDirectory: true,
    })
      .then((result) => {
        if (result.canceled || result.assets.length === 0) return;
        const asset = result.assets[0];
        if (!asset) return;
        offer({
          uri: asset.uri,
          mimeType: asset.mimeType ?? 'application/pdf',
          kind: 'pdf',
          name: asset.name,
        });
      })
      .catch(() => {
        setFailure({
          headline: 'PDF could not be opened',
          suggestion: 'Pick another file, or type the numbers in.',
        });
      });
  }, [busy, offer]);

  const cancelUpload = useCallback(() => {
    setPending(null);
    setPhase('idle');
  }, []);

  /* ----------------------------------------------------------- rendering -- */

  if (phase === 'scanning' && canScan) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AppHeader
          title="Scan the QR code"
          subtitle="Point the camera at the code on your printout"
          onBack={() => setPhase('idle')}
        />
        <View style={[styles.camera, { borderColor: colors.border }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcode}
          />
        </View>
        <Txt color="muted" style={styles.cameraHint}>
          The code opens an InBody result page. Nothing is saved until you check the numbers.
        </Txt>
        <Button
          label="Cancel"
          variant="secondary"
          onPress={() => setPhase('idle')}
          style={styles.cameraCancel}
        />
      </Screen>
    );
  }

  if (phase === 'consent' && pending) {
    return (
      <Screen scroll edges={['top', 'bottom']}>
        <AppHeader title="Send this sheet?" onBack={cancelUpload} />
        <Card>
          <Txt weight="semibold" numberOfLines={2}>
            {pending.name}
          </Txt>
          <Txt color="muted" style={styles.consentBody}>
            {`This ${pending.kind === 'pdf' ? 'PDF' : 'photo'} is uploaded to ${apiHost(
              settings.aiBaseUrl,
            )} to be read. It holds your body measurements. Nothing is saved until you check every number on the next screen.`}
          </Txt>
          <View style={styles.consentActions}>
            <Button label="Send and read it" onPress={() => analyze(pending)} fullWidth />
            <Button label="Not now" variant="secondary" onPress={cancelUpload} fullWidth />
          </View>
        </Card>
        <Button
          label="Type the numbers in instead"
          variant="ghost"
          onPress={typeItIn}
          style={styles.altAction}
        />
      </Screen>
    );
  }

  if (busy) {
    return (
      <Screen edges={['top', 'bottom']}>
        <AppHeader title="Reading the sheet" onBack={goBack} />
        <LoadingView
          message={
            phase === 'fetching'
              ? 'Opening the InBody page…'
              : 'Reading the numbers off your sheet…'
          }
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['top', 'bottom']} keyboardAvoiding>
      <AppHeader
        title="Import a reading"
        subtitle="Three ways in. You confirm every number before it is saved."
        onBack={goBack}
      />

      {failure ? (
        <Card style={[styles.block, { borderColor: colors.danger }]}>
          <View style={styles.noticeHead}>
            <View {...DECORATIVE}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            </View>
            <Txt weight="semibold">{failure.headline}</Txt>
          </View>
          <Txt color="muted" style={styles.noticeBody}>
            {failure.suggestion}
          </Txt>
        </Card>
      ) : null}

      {thin ? (
        <Card style={[styles.block, { borderColor: colors.warning }]}>
          <View style={styles.noticeHead}>
            <View {...DECORATIVE}>
              <Ionicons name="help-circle-outline" size={18} color={colors.warning} />
            </View>
            <Txt weight="semibold">The sheet could not be read automatically</Txt>
          </View>
          <Txt color="muted" style={styles.noticeBody}>
            {thin.fieldCount === 0
              ? 'No numbers came back that the app could trust. Type them in from the printout.'
              : `Only ${thin.fieldCount} ${thin.fieldCount === 1 ? 'number' : 'numbers'} came back, which is not enough to call it a reading. Carry them over and fill in the rest by hand.`}
          </Txt>
          <View style={styles.consentActions}>
            {thin.fieldCount > 0 ? (
              <Button
                label="Carry them over"
                onPress={() => handoff(thin.draft, thin.source)}
                fullWidth
              />
            ) : null}
            <Button label="Type it in" variant="secondary" onPress={typeItIn} fullWidth />
          </View>
        </Card>
      ) : null}

      <Card style={styles.block}>
        <View style={styles.cardHead}>
          <View style={[styles.mark, { backgroundColor: colors.accentSoft }]} {...DECORATIVE}>
            <Ionicons name={'qr-code-outline' as IconName} size={20} color={colors.accent} />
          </View>
          <View style={styles.cardTitle}>
            <Txt weight="semibold">The QR code on the printout</Txt>
            <Txt variant="caption" color="faint">
              Opens the public InBody result page for that test.
            </Txt>
          </View>
        </View>

        {canScan ? (
          <Button
            label="Scan the code"
            icon="camera-outline"
            onPress={startScanning}
            fullWidth
            style={styles.cardAction}
          />
        ) : null}

        <TextField
          label="Or paste the link"
          value={url}
          onChangeText={setUrl}
          placeholder="https://qrcode.inbody.com/..."
          autoCapitalize="none"
          keyboardType="url"
          icon="link-outline"
          style={styles.cardAction}
        />
        <Button
          label="Read the page"
          variant="secondary"
          onPress={() => readUrl(url)}
          disabled={url.trim() === ''}
          fullWidth
        />
        {Platform.OS === 'web' ? (
          <Txt variant="caption" color="faint" style={styles.cardFoot}>
            In a browser, inbody.com may refuse to let this page read it. If that happens, open the
            link yourself and type the numbers in.
          </Txt>
        ) : null}
      </Card>

      <Card style={styles.block}>
        <View style={styles.cardHead}>
          <View style={[styles.mark, { backgroundColor: colors.accentSoft }]} {...DECORATIVE}>
            <Ionicons name={'document-attach-outline' as IconName} size={20} color={colors.accent} />
          </View>
          <View style={styles.cardTitle}>
            <Txt weight="semibold">A photo or PDF of the sheet</Txt>
            <Txt variant="caption" color="faint">
              Arabic, Korean and English sheets all work.
            </Txt>
          </View>
        </View>

        {aiReady ? (
          <>
            <Button
              label="Choose a photo"
              icon="image-outline"
              onPress={pickPhoto}
              fullWidth
              style={styles.cardAction}
            />
            <Button
              label="Choose a PDF"
              icon="document-outline"
              variant="secondary"
              onPress={pickPdf}
              fullWidth
              style={styles.cardAction}
            />
            <Txt variant="caption" color="faint" style={styles.cardFoot}>
              The sheet is sent to the model you configured. Every number it reads lands in the form
              for you to check.
            </Txt>
          </>
        ) : (
          <>
            <Txt color="muted" style={styles.cardAction}>
              {settings.photoAnalysis !== 'ai'
                ? 'Reading sheets automatically is switched off. Turn photo analysis on in Settings to use it.'
                : 'No API key is saved yet. Add an Anthropic API key in Settings to use it.'}
            </Txt>
            <Button
              label="Open Settings"
              icon="settings-outline"
              variant="secondary"
              onPress={() => router.push('/settings')}
              fullWidth
            />
          </>
        )}
      </Card>

      <Card style={styles.block}>
        <View style={styles.cardHead}>
          <View style={[styles.mark, { backgroundColor: colors.accentSoft }]} {...DECORATIVE}>
            <Ionicons name={'create-outline' as IconName} size={20} color={colors.accent} />
          </View>
          <View style={styles.cardTitle}>
            <Txt weight="semibold">Type it in</Txt>
            <Txt variant="caption" color="faint">
              Weight alone is enough to start. The rest is optional.
            </Txt>
          </View>
        </View>
        <Button
          label="Enter the numbers"
          icon="keypad-outline"
          variant="secondary"
          onPress={typeItIn}
          fullWidth
          style={styles.cardAction}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: spacing.md,
  },
  cardHead: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
  },
  mark: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  cardTitle: {
    flex: 1,
    rowGap: 2,
  },
  cardAction: {
    marginTop: spacing.md,
  },
  cardFoot: {
    marginTop: spacing.md,
  },
  noticeHead: {
    alignItems: 'center',
    columnGap: spacing.sm,
    flexDirection: 'row',
  },
  noticeBody: {
    marginTop: spacing.sm,
  },
  consentBody: {
    marginTop: spacing.sm,
  },
  consentActions: {
    marginTop: spacing.lg,
    rowGap: spacing.sm,
  },
  altAction: {
    alignSelf: 'center',
    marginTop: spacing.lg,
  },
  camera: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    height: CAMERA_HEIGHT,
    overflow: 'hidden',
  },
  cameraHint: {
    marginTop: spacing.lg,
  },
  cameraCancel: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
  },
});
