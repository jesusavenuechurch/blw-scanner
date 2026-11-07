import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextProps, type ViewStyle } from 'react-native';
import { colors, fonts, radius, tierOf } from '@/theme';

export function Title({ style, ...props }: TextProps) {
  return <Text {...props} style={[s.title, style]} />;
}

export function Body({ style, muted, ...props }: TextProps & { muted?: boolean }) {
  return <Text {...props} style={[s.body, muted && { color: colors.muted }, style]} />;
}

export function Label({ style, ...props }: TextProps) {
  return <Text {...props} style={[s.label, style]} />;
}

type Variant = 'gold' | 'outline' | 'ghost' | 'danger';

export function Button({
  title,
  icon,
  variant = 'gold',
  loading,
  style,
  big,
  ...props
}: PressableProps & { title: string; icon?: ReactNode; variant?: Variant; loading?: boolean; big?: boolean; style?: StyleProp<ViewStyle> }) {
  const fg = variant === 'gold' ? colors.onGold : variant === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      disabled={props.disabled || loading}
      style={({ pressed }) => [
        s.button,
        big && s.buttonBig,
        variant === 'gold' && { backgroundColor: colors.gold },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
        variant === 'danger' && { borderWidth: 1, borderColor: '#5a2626', backgroundColor: colors.dangerBg },
        (pressed || props.disabled) && { opacity: 0.75 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text style={[s.buttonText, big && { fontSize: 18 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function TierBadge({ tier, label }: { tier: string | null | undefined; label?: string | null }) {
  const t = tierOf(tier);
  return (
    <View style={[s.badge, { borderColor: t.color + '66', backgroundColor: t.color + '1f' }]}>
      <View style={[s.dot, { backgroundColor: t.color }]} />
      <Text style={s.badgeText}>{label || t.label}</Text>
    </View>
  );
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'success' | 'warning' | 'danger' | 'gold' }) {
  const map = {
    muted: [colors.surfaceRaised, colors.muted],
    success: [colors.successBg, colors.success],
    warning: [colors.warningBg, colors.warning],
    danger: [colors.dangerBg, colors.danger],
    gold: ['#3a2d14', colors.goldLight],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color: fg }]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.text, letterSpacing: -0.3 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text },
  label: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.muted },
  button: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonBig: { minHeight: 58, borderRadius: radius.lg },
  buttonText: { fontFamily: fonts.semibold, fontSize: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },
});
