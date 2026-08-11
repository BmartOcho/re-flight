import type { Metadata } from 'next';
import Hangar from '@/components/Hangar';

export const metadata: Metadata = {
  title: 'Hangar — Re:Flight model library',
  description: 'QA viewer for the parametric aircraft library: every ICAO type the replay engine can render.',
  robots: { index: false },
};

export default function HangarPage() {
  return <Hangar />;
}
