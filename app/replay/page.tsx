import type { Metadata } from 'next';
import UploadReplay from '@/components/UploadReplay';

export const metadata: Metadata = {
  title: 'Fly your own log · Re:Flight',
  description:
    'Drop a GPX/KML/CSV track log and watch your own flight replayed in 3-D over real terrain — resampled, verified, and rendered in your browser.',
};

export default function ReplayPage() {
  return <UploadReplay />;
}
