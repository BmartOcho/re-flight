import type { Metadata } from 'next';
import LookupReplay from '@/components/LookupReplay';

export const metadata: Metadata = {
  title: 'Search by tail number · Re:Flight',
  description:
    'Enter an aircraft registration and date and replay that flight in 3-D from real ADS-B archive data over real terrain.',
};

export default function FindPage() {
  return <LookupReplay />;
}
