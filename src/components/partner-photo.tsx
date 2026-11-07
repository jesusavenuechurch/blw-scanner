import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors, fonts, tierOf } from '@/theme';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** The partner's face, ringed in their tier colour. Falls back to initials. */
export function PartnerPhoto({ name, tier, uri, size = 56 }: { name: string; tier?: string | null; uri?: string | null; size?: number }) {
  const color = tierOf(tier).color;
  const ring = Math.max(2, Math.round(size / 28));
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2, borderColor: color, borderWidth: ring }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size - ring * 2, height: size - ring * 2, borderRadius: size / 2 }} contentFit="cover" transition={150} />
      ) : (
        <Text style={[styles.initials, { fontSize: size * 0.36, color }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  initials: { fontFamily: fonts.semibold, letterSpacing: 1 },
});
