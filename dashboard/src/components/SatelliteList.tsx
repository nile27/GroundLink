import type { SatelliteSummary } from '../types/api';
import { SatelliteCard } from './SatelliteCard';

interface Props {
  satellites: SatelliteSummary[];
  selectedId: string | null;
}

export function SatelliteList({ satellites, selectedId }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {satellites.map((s) => (
        <SatelliteCard key={s.id} satellite={s} selected={s.id === selectedId} />
      ))}
    </div>
  );
}
