import type { SatelliteSummary } from '../types/api';
import { SatelliteCard } from './SatelliteCard';

interface Props {
  satellites: SatelliteSummary[];
  selectedId: string | null;
}

export function SatelliteList({ satellites, selectedId }: Props) {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-gray-50">
      <h2 className="border-b border-gray-200 px-3 py-2 font-semibold">위성 ({satellites.length})</h2>
      {/* 목록만 스크롤 */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {satellites.map((s) => (
          <SatelliteCard key={s.id} satellite={s} selected={s.id === selectedId} />
        ))}
      </div>
    </section>
  );
}
