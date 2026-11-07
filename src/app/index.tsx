import { Redirect } from 'expo-router';
import { useScanner } from '@/state/scanner';

export default function Index() {
  const { session } = useScanner();
  return <Redirect href={session ? '/(tabs)' : '/pair'} />;
}
