/** Angel Lounges scanner palette: warm ink, ivory text, burnished gold. Built for a dim lounge doorway. */
export const colors = {
  bg: '#14110e',
  surface: '#1d1915',
  surfaceRaised: '#26211c',
  line: '#352e27',
  text: '#f3eee5',
  muted: '#a99e8f',
  faint: '#6f665b',
  gold: '#d6a647',
  goldLight: '#f0d995',
  goldDeep: '#9a6d24',
  onGold: '#2b2112',
  success: '#3fbf7f',
  successBg: '#0f2a1d',
  warning: '#f0b23e',
  warningBg: '#2f2410',
  danger: '#ef5d5d',
  dangerBg: '#321515',
  info: '#6aa8f0',
};

/** Matches the QR colours on the server (Partner::tier_color), lifted for a dark screen. */
export const tiers: Record<string, { label: string; color: string }> = {
  ruby: { label: 'Ruby', color: '#e0505e' },
  silver: { label: 'Silver', color: '#c8c8c8' },
  gold: { label: 'Gold', color: '#e6b422' },
  diamond: { label: 'Diamond', color: '#c46ac4' },
  as_one_man: { label: 'As One Man', color: '#c9a2c9' },
  top_individual: { label: 'Top Individual', color: '#40e0d0' },
};

export function tierOf(tier: string | null | undefined) {
  return tiers[tier ?? ''] ?? { label: tier || 'No tier', color: colors.muted };
}

export const fonts = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  body: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
};

export const radius = { sm: 8, md: 12, lg: 18, xl: 28 };
