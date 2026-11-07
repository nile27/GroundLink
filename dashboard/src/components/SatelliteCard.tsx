import { getSatStatus } from '../lib/status';
import type { SatelliteSummary } from '../types/api';
import { ContactDot } from './ContactDot';
import { ModeBadge } from './ModeBadge';

interface Props {
  satellite: SatelliteSummary;
  selected: boolean;
}

export function SatelliteCard({ satellite, selected }: Props) {
  const t = satellite.latestTelemetry;
  const { warning, contact } = getSatStatus(t);

  return (
    <div
      data-warning={warning}
      data-contact={contact}
      data-selected={selected}
      className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 data-[selected=true]:ring-2 data-[selected=true]:ring-selected data-[warning=true]:border-warning data-[warning=true]:bg-warning-bg"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">{satellite.id}</span>
        <div className="flex items-center gap-2">
          {t && <ModeBadge mode={t.mode} />}
          <ContactDot contact={contact} />
        </div>
      </div>
      {t ? (
        <dl className="grid grid-cols-2 gap-x-4 text-sm">
          <dt className="text-gray-500">배터리</dt>
          <dd className="text-right tabular-nums">{t.battery.toFixed(1)}%</dd>
          <dt className="text-gray-500">온도</dt>
          <dd className="text-right tabular-nums">{t.temp.toFixed(1)}°C</dd>
        </dl>
      ) : (
        <div className="text-sm text-muted">텔레메트리 없음</div>
      )}
    </div>
  );
}
