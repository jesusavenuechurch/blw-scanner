import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Label, Title } from '@/components/ui';
import { normalizeApiUrl, normalizePairingCode, parseScannedCode } from '@/lib/qr';
import { useScanner } from '@/state/scanner';
import { colors, fonts, radius } from '@/theme';

const DEFAULT_API = process.env.EXPO_PUBLIC_DEFAULT_API_URL ?? '';

export default function Pair() {
  const { session, pair, notice, clearNotice } = useScanner();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'scan' | 'type'>('scan');
  const [server, setServer] = useState(DEFAULT_API);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (mode === 'scan' && permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [mode, permission, requestPermission]);

  if (session) return <Redirect href="/(tabs)" />;

  async function connect(apiUrl: string, pairingCode: string) {
    setBusy(true);
    setError(null);
    clearNotice();
    try {
      await pair(normalizeApiUrl(apiUrl), normalizePairingCode(pairingCode));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      handled.current = false;
      setError(e instanceof Error ? e.message : 'Pairing failed.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  }

  function onScan(data: string) {
    if (handled.current || busy) return;
    const parsed = parseScannedCode(data);
    if (parsed.kind !== 'pair') {
      setError('That isn’t a pairing code. Open Scanners in the workspace and choose “Pair a scanner”.');
      return;
    }
    handled.current = true;
    void connect(parsed.api, parsed.code);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.mark}>
              <Text style={styles.markText}>A</Text>
            </View>
            <View>
              <Text style={styles.brandName}>Angel Lounges</Text>
              <Label>Lounge scanner</Label>
            </View>
          </View>

          <Title>Pair this phone</Title>
          <Body muted style={{ marginTop: 8 }}>
            In the workspace, open <Text style={{ color: colors.text }}>Scanners</Text> and choose{' '}
            <Text style={{ color: colors.text }}>Pair a scanner</Text>. Then scan the code it shows.
          </Body>

          {notice ? (
            <View style={[styles.alert, { borderColor: '#5a4416', backgroundColor: colors.warningBg }]}>
              <Ionicons name="information-circle" size={18} color={colors.warning} />
              <Text style={styles.alertText}>{notice}</Text>
            </View>
          ) : null}

          <View style={styles.tabs}>
            {(['scan', 'type'] as const).map((m) => (
              <Pressable key={m} onPress={() => setMode(m)} style={[styles.tab, mode === m && styles.tabOn]}>
                <Text style={[styles.tabText, mode === m && { color: colors.text }]}>{m === 'scan' ? 'Scan the code' : 'Type it in'}</Text>
              </Pressable>
            ))}
          </View>

          {mode === 'scan' ? (
            <View style={styles.cameraBox}>
              {permission?.granted ? (
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={busy ? undefined : ({ data }) => onScan(data)}
                />
              ) : (
                <View style={styles.cameraOff}>
                  <Ionicons name="camera-outline" size={32} color={colors.muted} />
                  <Body muted style={{ textAlign: 'center' }}>The camera is needed to scan the pairing code.</Body>
                  <Button title="Allow camera" variant="outline" onPress={() => requestPermission()} />
                </View>
              )}
              <View pointerEvents="none" style={styles.frame} />
              {busy ? (
                <View style={styles.busy}>
                  <Text style={styles.busyText}>Pairing…</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              <View style={{ gap: 6 }}>
                <Label>Server</Label>
                <TextInput
                  value={server}
                  onChangeText={setServer}
                  placeholder="lounge.example.org"
                  placeholderTextColor={colors.faint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.input}
                />
              </View>
              <View style={{ gap: 6 }}>
                <Label>Pairing code</Label>
                <TextInput
                  value={code}
                  onChangeText={(t) => setCode(normalizePairingCode(t).slice(0, 6))}
                  placeholder="ABC123"
                  placeholderTextColor={colors.faint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={[styles.input, styles.codeInput]}
                />
              </View>
              <Button title="Pair" big loading={busy} disabled={!server.trim() || code.length < 6} onPress={() => connect(server, code)} />
            </View>
          )}

          {error ? (
            <View style={[styles.alert, { borderColor: '#5a2626', backgroundColor: colors.dangerBg }]}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.alertText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  mark: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: fonts.display, fontSize: 28, color: colors.onGold, marginTop: -2 },
  brandName: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, marginTop: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  tabOn: { backgroundColor: colors.surfaceRaised },
  tabText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  cameraBox: { aspectRatio: 1, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  cameraOff: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  frame: { position: 'absolute', top: '18%', left: '18%', right: '18%', bottom: '18%', borderWidth: 2, borderColor: colors.gold, borderRadius: radius.lg },
  busy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  busyText: { fontFamily: fonts.semibold, color: colors.text, fontSize: 16 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, height: 50, color: colors.text, fontFamily: fonts.body, fontSize: 16 },
  codeInput: { fontFamily: fonts.semibold, fontSize: 24, letterSpacing: 6, textAlign: 'center' },
  alert: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: radius.md, padding: 12, alignItems: 'flex-start' },
  alertText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 20 },
});
