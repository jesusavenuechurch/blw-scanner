import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PartnerPhoto } from '@/components/partner-photo';
import { Body, Button, Card, Label, Title } from '@/components/ui';
import { APP_VERSION } from '@/lib/api';
import { recentCheckinsHere } from '@/lib/db';
import { useScanner } from '@/state/scanner';
import { colors, fonts, radius } from '@/theme';

const PHASE: Record<string, string> = {
  uploading: 'Uploading check-ins…',
  partners: 'Updating the guest list…',
  checkins: 'Getting check-ins from other doors…',
  photos: 'Downloading photos…',
};

function ago(iso: string | null) {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleString([], { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });
}

export default function Status() {
  const { session, online, phase, phaseDetail, lastSyncAt, syncError, stats, syncNow, unpair, refreshStats } = useScanner();
  const [recent, setRecent] = useState<Awaited<ReturnType<typeof recentCheckinsHere>>>([]);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    await refreshStats();
    setRecent(await recentCheckinsHere(10));
  }, [refreshStats]);

  useFocusEffect(useCallback(() => void load(), [load]));
  useEffect(() => void recentCheckinsHere(10).then(setRecent), [stats?.here_today, stats?.pending]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const syncing = phase !== 'idle';

  function confirmUnpair() {
    const pending = stats?.pending ?? 0;
    Alert.alert(
      'Disconnect this phone?',
      pending > 0
        ? `${pending} check-in${pending === 1 ? ' hasn’t' : 's haven’t'} uploaded yet and will be lost. Connect to the internet and sync first if you can.`
        : 'The guest list and photos will be removed from this phone. You can pair it again any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: () => void unpair() },
      ],
    );
  }

  function confirmRedownload() {
    Alert.alert('Download everything again?', 'Use this if the guest list on this phone looks wrong. Check-ins waiting to upload are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Download', onPress: () => void syncNow(true) },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={() => void syncNow()} tintColor={colors.gold} />}>
        <Title>Status</Title>

        <Card style={{ gap: 14 }}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Label>This scanner</Label>
              <Text style={styles.big}>{session?.deviceName}</Text>
              <Body muted numberOfLines={1}>{session?.api.replace(/^https?:\/\//, '').replace(/\/api$/, '')}</Body>
            </View>
            <View style={[styles.state, { backgroundColor: online ? colors.successBg : colors.warningBg }]}>
              <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.warning }]} />
              <Text style={[styles.stateText, { color: online ? colors.success : colors.warning }]}>{online ? 'Online' : 'Offline'}</Text>
            </View>
          </View>
          <View style={styles.syncLine}>
            <Ionicons name={syncing ? 'sync' : syncError ? 'warning' : 'checkmark-circle'} size={18} color={syncError && !syncing ? colors.warning : colors.gold} />
            <Text style={styles.syncText}>
              {syncing ? `${PHASE[phase] ?? 'Syncing…'}${phaseDetail ? ` ${phaseDetail}` : ''}` : syncError ? syncError : `Last synced ${ago(lastSyncAt)}`}
            </Text>
          </View>
          {!online ? <Body muted>Scanning still works offline. Check-ins upload as soon as there’s signal.</Body> : null}
          <Button title={syncing ? 'Syncing…' : 'Sync now'} variant="outline" loading={syncing} onPress={() => syncNow()} icon={<Ionicons name="refresh" size={18} color={colors.text} />} />
        </Card>

        <View style={styles.grid}>
          <Stat label="Arrived today" value={stats?.arrived_today ?? 0} accent />
          <Stat label="Scanned here today" value={stats?.here_today ?? 0} />
          <Stat label="Waiting to upload" value={stats?.pending ?? 0} warn={!!stats?.pending} />
          <Stat label="Guests on this phone" value={stats?.partners ?? 0} />
        </View>

        <Card style={{ gap: 8 }}>
          <Label>Photos</Label>
          <Text style={styles.big}>
            {stats?.photos_ready ?? 0}
            <Text style={{ color: colors.muted, fontSize: 18 }}> / {stats?.photos_expected ?? 0} downloaded</Text>
          </Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${stats?.photos_expected ? Math.round((stats.photos_ready / stats.photos_expected) * 100) : 0}%` }]} />
          </View>
          <Body muted>Photos download in the background and are kept for offline use.</Body>
        </Card>

        {recent.length > 0 ? (
          <Card style={{ gap: 4 }}>
            <Label style={{ marginBottom: 6 }}>Recent check-ins on this phone</Label>
            {recent.map((r) => (
              <View key={r.uuid} style={styles.recent}>
                <PartnerPhoto name={r.full_name ?? '?'} tier={r.tier} uri={r.photo_file} size={36} />
                <Text style={styles.recentName} numberOfLines={1}>
                  {r.full_name ?? `Partner #${r.partner_id}`}
                </Text>
                <Text style={styles.recentTime}>{new Date(r.checked_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                <Ionicons name={r.synced ? 'cloud-done-outline' : 'cloud-upload-outline'} size={16} color={r.synced ? colors.success : colors.warning} />
              </View>
            ))}
          </Card>
        ) : null}

        <View style={{ gap: 10, marginTop: 8 }}>
          <Button title="Download everything again" variant="ghost" onPress={confirmRedownload} />
          <Button title="Disconnect this phone" variant="danger" onPress={confirmUnpair} />
          <Text style={styles.version}>Angel Lounges Scanner v{APP_VERSION}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statNum, accent && { color: colors.goldLight }, warn && { color: colors.warning }]}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  big: { fontFamily: fonts.display, fontSize: 28, color: colors.text, marginTop: 4 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stateText: { fontFamily: fonts.semibold, fontSize: 12 },
  syncLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14 },
  statNum: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: colors.text },
  statLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 3 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  recentName: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  recentTime: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  version: { textAlign: 'center', fontFamily: fonts.body, fontSize: 12, color: colors.faint, marginTop: 8 },
});
