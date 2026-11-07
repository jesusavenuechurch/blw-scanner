import { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PartnerPhoto } from '@/components/partner-photo';
import { ResultCard } from '@/components/result-card';
import { Body, Button, Label, Pill, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { searchPartners, todaysCheckins, upsertPartners, findPartner, type LocalCheckin, type LocalPartner } from '@/lib/db';
import { decide } from '@/lib/gate';
import { useScanner } from '@/state/scanner';
import { colors, fonts, radius, tierOf } from '@/theme';

type Row = LocalPartner & { checked_in_today: boolean };

export default function Guests() {
  const { session, online, stats, checkIn } = useScanner();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<{ partner: LocalPartner; todays: LocalCheckin[] } | null>(null);
  const [searchingOnline, setSearchingOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => setRows(await searchPartners(query)), [query]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 120);
    return () => clearTimeout(t);
  }, [load, stats?.partners, stats?.arrived_today]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function open(p: LocalPartner) {
    setDone(false);
    setSelected({ partner: p, todays: await todaysCheckins(p.id) });
  }

  async function searchOnline() {
    if (!session) return;
    setSearchingOnline(true);
    try {
      const res = await api.search(session, query);
      await upsertPartners(res.partners);
      await load();
    } catch {
      // Stay with local results.
    } finally {
      setSearchingOnline(false);
    }
  }

  async function admit() {
    if (!selected) return;
    setBusy(true);
    try {
      await checkIn(selected.partner);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const fresh = (await findPartner(selected.partner.id)) ?? selected.partner;
      setSelected({ partner: fresh, todays: await todaysCheckins(fresh.id) });
      setDone(true);
      void load();
    } finally {
      setBusy(false);
    }
  }

  const decision = selected ? decide(selected.partner, null, selected.todays) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Title>Guests</Title>
        <Body muted>Find a partner by name when their pass won’t scan.</Body>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Name, spouse or church"
            placeholderTextColor={colors.faint}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 66 }} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => open(item)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}>
            <PartnerPhoto name={item.full_name} tier={item.tier} uri={item.photo_file} size={48} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.title ? <Text style={{ color: colors.muted }}>{item.title} </Text> : null}
                {item.full_name}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                <Text style={{ color: tierOf(item.tier).color }}>● </Text>
                {[item.tier_label, item.church].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {item.checked_in_today ? <Pill tone="success">In today</Pill> : !item.is_registered ? <Pill tone="warning">Not registered</Pill> : null}
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={30} color={colors.faint} />
            <Body muted style={{ textAlign: 'center' }}>
              {stats?.partners ? `No one on this phone matches “${query}”.` : 'The guest list hasn’t downloaded yet. Check the Status tab.'}
            </Body>
            {query.trim().length >= 2 && online ? (
              <Button title="Search online" variant="outline" loading={searchingOnline} onPress={searchOnline} icon={<Ionicons name="cloud-outline" size={18} color={colors.text} />} />
            ) : null}
          </View>
        }
        ListHeaderComponent={rows.length > 0 ? <Label style={{ paddingVertical: 8 }}>{query ? `${rows.length} found` : 'Everyone'}</Label> : null}
      />

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBg}>
          <SafeAreaView edges={['bottom']} style={styles.modalSheet}>
            {selected && decision ? (
              done ? (
                <ResultCard tone="success" headline="Welcome" detail="Checked in" partner={selected.partner}>
                  <Button title="Done" big onPress={() => setSelected(null)} />
                </ResultCard>
              ) : decision.kind === 'again' ? (
                <ResultCard tone="warning" headline="Already checked in today" detail={`At ${new Date(decision.last.checked_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${decision.last.device_name ? ` · ${decision.last.device_name}` : ''}`} partner={selected.partner}>
                  <Button title="Let in again" big loading={busy} onPress={admit} />
                  <Button title="Close" variant="ghost" onPress={() => setSelected(null)} />
                </ResultCard>
              ) : decision.kind === 'not_registered' ? (
                <ResultCard tone="warning" headline="Hasn’t finished registering" detail="Check their identity before letting them in." partner={selected.partner}>
                  <Button title="Check in anyway" big loading={busy} onPress={admit} />
                  <Button title="Close" variant="ghost" onPress={() => setSelected(null)} />
                </ResultCard>
              ) : (
                <ResultCard tone="success" headline="Ready to check in" detail="Compare their face with the photo first." partner={selected.partner}>
                  <Button title="Check in" big loading={busy} onPress={admit} />
                  <Button title="Close" variant="ghost" onPress={() => setSelected(null)} />
                </ResultCard>
              )
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 16, paddingBottom: 8, gap: 6 },
  searchBox: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, height: 50 },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderRadius: radius.md },
  rowName: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  rowSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  empty: { alignItems: 'center', gap: 12, paddingTop: 60, paddingHorizontal: 24 },
  modalBg: { flex: 1, backgroundColor: 'rgba(8,6,4,0.75)', justifyContent: 'flex-end' },
  modalSheet: { padding: 16 },
});
