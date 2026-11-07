import { getSatStatus } from '../lib/status';
import type { SatelliteSummary } from '../types/api';

interface Props {
  satellite: SatelliteSummary;
  selected: boolean;
}

export function SatelliteCard({ satellite, selected }: Props) {
  const t = satellite.latestTelemetry;
  const { warning, contact } = getSatStatus(t);

  return (
    <div className="flex flex-col gap-1 border p-2" data-warning={warning} data-contact={contact} data-selected={selected}>
      <div className="flex items-center justify-between">
        <span>{satellite.id}</span>
        {/* 교신 여부 점 */}
        <span className="size-2 rounded-full border" data-contact={contact} />
      </div>
      {t ? (
        <div className="flex gap-3">
          <span>배터리 {t.battery}%</span>
          <span>온도 {t.temp}°C</span>
          <span>{t.mode}</span>
        </div>
      ) : (
        <div>텔레메트리 없음</div>
      )}
    </div>
  );
}
