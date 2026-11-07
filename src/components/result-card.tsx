import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import type { LocalPartner } from '@/lib/db';
import { colors, fonts, radius } from '@/theme';
import { PartnerPhoto } from './partner-photo';
import { TierBadge } from './ui';

export type Tone = 'success' | 'warning' | 'danger';

const TONE = {
  success: { bg: colors.successBg, fg: colors.success, icon: 'checkmark-circle' as const },
  warning: { bg: colors.warningBg, fg: colors.warning, icon: 'alert-circle' as const },
  danger: { bg: colors.dangerBg, fg: colors.danger, icon: 'close-circle' as const },
};

/** What the usher sees after a scan: a status banner, then the partner's face, big enough to compare. */
export function ResultCard({
  tone,
  headline,
  detail,
  partner,
  children,
}: {
  tone: Tone;
  headline: string;
  detail?: string;
  partner?: LocalPartner | null;
  children?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <View style={styles.card}>
      <View style={[styles.banner, { backgroundColor: t.bg }]}>
        <Ionicons name={t.icon} size={28} color={t.fg} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.headline, { color: t.fg }]}>{headline}</Text>
          {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        </View>
      </View>

      {partner ? (
        <View style={styles.body}>
          <PartnerPhoto name={partner.full_name} tier={partner.tier} uri={partner.photo_file} size={168} />
          <Text style={styles.name} numberOfLines={2}>
            {partner.title ? <Text style={styles.title}>{partner.title} </Text> : null}
            {partner.full_name}
          </Text>
          <TierBadge tier={partner.tier} label={partner.tier_label} />
          {partner.coming_with_spouse && partner.spouse_name ? (
            <View style={styles.spouse}>
              <Ionicons name="heart" size={14} color={colors.gold} />
              <Text style={styles.spouseText}>
                With {partner.spouse_title ? `${partner.spouse_title} ` : ''}
                {partner.spouse_name}
              </Text>
            </View>
          ) : null}
          {partner.church ? <Text style={styles.church}>{partner.church}</Text> : null}
          {!partner.photo_file ? <Text style={styles.noPhoto}>No photo on file — confirm their name.</Text> : null}
        </View>
      ) : null}

      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 16 },
  headline: { fontFamily: fonts.semibold, fontSize: 19 },
  detail: { fontFamily: fonts.body, fontSize: 14, color: colors.text, opacity: 0.85, marginTop: 2 },
  body: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8, gap: 12 },
  name: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.text, textAlign: 'center' },
  title: { color: colors.muted },
  spouse: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceRaised, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  spouseText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  church: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  noPhoto: { fontFamily: fonts.body, fontSize: 12, color: colors.warning },
  actions: { padding: 16, gap: 10 },
});
