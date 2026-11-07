import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResultCard } from '@/components/result-card';
import { Body, Button } from '@/components/ui';
import type { LocalPartner } from '@/lib/db';
import { useScanner, type ScanResult } from '@/state/scanner';
import { colors, fonts, radius } from '@/theme';

const WELCOME_DISMISS_MS = 5000;

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function Scan() {
  useKeepAwake();
  const router = useRouter();
  const focused = useIsFocused();
  const { session, online, stats, phase, resolveScan, checkIn } = useScanner();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [recording, setRecording] = useState(false);
  const lastCode = useRef<{ data: string; at: number } | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setResult(null);
  }, []);

  useEffect(() => () => void (dismissTimer.current && clearTimeout(dismissTimer.current)), []);

  const onScan = useCallback(
    async (data: string) => {
      if (resolving || result) return;
      // The camera reports the same code many times a second; ignore repeats for a moment.
      const now = Date.now();
      if (lastCode.current && lastCode.current.data === data && now - lastCode.current.at < 3000) return;
      lastCode.current = { data, at: now };

      setResolving(true);
      try {
        const r = await resolveScan(data);
        if (r.kind === 'welcome') {
          await checkIn(r.partner);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          dismissTimer.current = setTimeout(() => setResult(null), WELCOME_DISMISS_MS);
        } else if (r.kind === 'again' || r.kind === 'not_registered') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        setResult(r);
      } finally {
        setResolving(false);
      }
    },
    [resolving, result, resolveScan, checkIn],
  );

  async function admit(partner: LocalPartner) {
    setRecording(true);
    try {
      await checkIn(partner);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult({ kind: 'welcome', partner, via: 'local' });
      dismissTimer.current = setTimeout(() => setResult(null), WELCOME_DISMISS_MS);
    } finally {
      setRecording(false);
    }
  }

  return (
    <View style={styles.screen}>
      {permission?.granted && focused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={result || resolving ? undefined : ({ data }) => void onScan(data)}
        />
      ) : (
        <View style={styles.noCamera}>
          <Ionicons name="camera-outline" size={36} color={colors.muted} />
          <Body muted style={{ textAlign: 'center' }}>Allow the camera to scan lounge passes.</Body>
          <Button title="Allow camera" variant="outline" onPress={() => requestPermission()} />
        </View>
      )}

      <SafeAreaView style={StyleSheet.absoluteFill} edges={['top']} pointerEvents="box-none">
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.chip}>
            <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.warning }]} />
            <Text style={styles.chipText} numberOfLines={1}>
              {session?.deviceName} · {online ? (phase !== 'idle' ? 'Syncing' : 'Online') : 'Offline'}
            </Text>
          </View>
          {stats?.pending ? (
            <View style={[styles.chip, { backgroundColor: 'rgba(240,178,62,0.18)' }]}>
              <Ionicons name="cloud-upload-outline" size={14} color={colors.warning} />
              <Text style={[styles.chipText, { color: colors.warning }]}>{stats.pending} to upload</Text>
            </View>
          ) : null}
        </View>

        {/* Viewfinder */}
        {!result ? (
          <View style={styles.finderWrap} pointerEvents="none">
            <View style={styles.finder}>
              {resolving ? <ActivityIndicator color={colors.gold} size="large" /> : null}
              <View style={[styles.corner, { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 22 }]} />
              <View style={[styles.corner, { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 22 }]} />
              <View style={[styles.corner, { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 22 }]} />
              <View style={[styles.corner, { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 22 }]} />
            </View>
            <Text style={styles.hint}>Point at the guest’s lounge pass</Text>
          </View>
        ) : null}

        {/* Bottom controls */}
        {!result ? (
          <View style={styles.bottom}>
            <View style={styles.count}>
              <Text style={styles.countNum}>{stats?.arrived_today ?? 0}</Text>
              <Text style={styles.countLabel}>arrived today</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable style={styles.roundBtn} onPress={() => router.push('/(tabs)/guests')} accessibilityLabel="Find a guest by name">
                <Ionicons name="search" size={22} color={colors.text} />
              </Pressable>
              <Pressable
                style={[styles.roundBtn, torch && { backgroundColor: colors.gold }]}
                onPress={() => setTorch((t) => !t)}
                accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
              >
                <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={22} color={torch ? colors.onGold : colors.text} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      {result ? (
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={result.kind === 'welcome' ? dismiss : undefined} />
          <SafeAreaView edges={['top']} style={styles.sheet}>
            <Outcome result={result} recording={recording} onAdmit={admit} onDismiss={dismiss} onSearch={() => { dismiss(); router.push('/(tabs)/guests'); }} />
          </SafeAreaView>
        </View>
      ) : null}
    </View>
  );
}

function Outcome({
  result,
  recording,
  onAdmit,
  onDismiss,
  onSearch,
}: {
  result: ScanResult;
  recording: boolean;
  onAdmit: (p: LocalPartner) => void;
  onDismiss: () => void;
  onSearch: () => void;
}) {
  switch (result.kind) {
    case 'welcome':
      return (
        <ResultCard tone="success" headline="Welcome" detail={result.via === 'online' ? 'Found online and checked in' : 'Checked in'} partner={result.partner}>
          <Button title="Next guest" big onPress={onDismiss} />
        </ResultCard>
      );
    case 'again':
      return (
        <ResultCard
          tone="warning"
          headline="Already checked in today"
          detail={`At ${timeOf(result.last.checked_in_at)}${result.last.device_name ? ` · ${result.last.device_name}` : ''}`}
          partner={result.partner}
        >
          <Button title="Let in again" big loading={recording} onPress={() => onAdmit(result.partner)} />
          <Button title="Cancel" variant="ghost" onPress={onDismiss} />
        </ResultCard>
      );
    case 'not_registered':
      return (
        <ResultCard tone="warning" headline="Hasn’t finished registering" detail="They’re on the guest list but never completed registration." partner={result.partner}>
          <Button title="Check in anyway" big loading={recording} onPress={() => onAdmit(result.partner)} />
          <Button title="Cancel" variant="ghost" onPress={onDismiss} />
        </ResultCard>
      );
    case 'forged':
      return (
        <ResultCard tone="danger" headline="This pass doesn’t match" detail="The code doesn’t belong to this partner. Ask for ID or call a supervisor." partner={result.partner}>
          <Button title="Dismiss" variant="danger" big onPress={onDismiss} />
        </ResultCard>
      );
    case 'not_found':
      return (
        <ResultCard
          tone="danger"
          headline="Not on the guest list"
          detail={result.offline ? 'Not on this phone, and there’s no signal to check online. Try searching by name.' : 'No partner matches this pass.'}
        >
          <Button title="Search by name" variant="outline" big onPress={onSearch} />
          <Button title="Dismiss" variant="ghost" onPress={onDismiss} />
        </ResultCard>
      );
    case 'unknown':
      return (
        <ResultCard tone="danger" headline="Not a lounge pass" detail="This QR code isn’t an Angel Lounges pass.">
          <Button title="Dismiss" variant="ghost" big onPress={onDismiss} />
        </ResultCard>
      );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  noCamera: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(20,17,14,0.72)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '100%' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  finderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  finder: { width: 250, height: 250, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: 54, height: 54, borderColor: colors.gold },
  hint: { fontFamily: fonts.medium, fontSize: 15, color: colors.text, backgroundColor: 'rgba(20,17,14,0.6)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, overflow: 'hidden' },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', padding: 16, paddingBottom: 20 },
  count: { backgroundColor: 'rgba(20,17,14,0.72)', borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 10 },
  countNum: { fontFamily: fonts.display, fontSize: 34, lineHeight: 36, color: colors.goldLight },
  countLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  roundBtn: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(20,17,14,0.72)', alignItems: 'center', justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,6,4,0.78)', justifyContent: 'center' },
  sheet: { paddingHorizontal: 16 },
});
