import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useScanner } from '@/state/scanner';
import { colors, fonts } from '@/theme';

export default function TabsLayout() {
  const { session, stats } = useScanner();
  if (!session) return <Redirect href="/pair" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Scan', tabBarIcon: ({ color, size }) => <Ionicons name="scan" color={color} size={size} /> }} />
      <Tabs.Screen name="guests" options={{ title: 'Guests', tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} /> }} />
      <Tabs.Screen
        name="status"
        options={{
          title: 'Status',
          tabBarBadge: stats?.pending ? stats.pending : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.warning, color: colors.onGold },
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
