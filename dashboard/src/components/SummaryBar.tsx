import { getSatStatus } from '../lib/status';
import type { SatelliteSummary } from '../types/api';

interface Props {
  satellites: SatelliteSummary[];
}

export function SummaryBar({ satellites }: Props) {
  const statuses = satellites.map((s) => getSatStatus(s.latestTelemetry));
  const items = [
    { kind: 'total', label: '전체', value: satellites.length },
    { kind: 'warning', label: '경고', value: statuses.filter((s) => s.warning).length },
    { kind: 'safe', label: 'SAFE', value: satellites.filter((s) => s.latestTelemetry?.mode === 'SAFE').length },
    { kind: 'contact', label: '교신 중', value: statuses.filter((s) => s.contact).length },
  ];

  return (
    <div className="flex gap-3">
      {items.map((item) => (
        <div
          key={item.kind}
          data-kind={item.kind}
          className="flex min-w-32 items-baseline justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-2 text-gray-700 data-[kind=contact]:border-contact data-[kind=contact]:text-contact data-[kind=safe]:border-safe data-[kind=safe]:bg-safe-bg data-[kind=safe]:text-safe data-[kind=warning]:border-warning data-[kind=warning]:bg-warning-bg data-[kind=warning]:text-warning"
        >
          <span className="text-sm">{item.label}</span>
          <span className="text-2xl font-semibold tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
