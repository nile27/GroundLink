import { getSatStatus } from '../lib/status';
import type { SatelliteSummary } from '../types/api';

interface Props {
  satellites: SatelliteSummary[];
}

export function SummaryBar({ satellites }: Props) {
  const statuses = satellites.map((s) => getSatStatus(s.latestTelemetry));
  const items = [
    { label: '전체', value: satellites.length },
    { label: '경고', value: statuses.filter((s) => s.warning).length },
    { label: 'SAFE', value: satellites.filter((s) => s.latestTelemetry?.mode === 'SAFE').length },
    { label: '교신 중', value: statuses.filter((s) => s.contact).length },
  ];

  return (
    <div className="flex gap-4 border p-2">
      {items.map((item) => (
        <div key={item.label} className="border px-3 py-1">
          {item.label} {item.value}
        </div>
      ))}
    </div>
  );
}
