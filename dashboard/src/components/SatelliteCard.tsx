import { getSatStatus } from '../lib/status';
import type { SatelliteSummary } from '../types/api';
import { ContactDot } from './ContactDot';
import { ModeBadge } from './ModeBadge';

interface Props {
  satellite: SatelliteSummary;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function SatelliteCard({ satellite, selected, onSelect }: Props) {
  const t = satellite.latestTelemetry;
  const { warning, contact } = getSatStatus(t);

  return (
    // button: Tab으로 이동, Enter/Space로 선택 (브라우저 기본 동작)
    <button
      type="button"
      onClick={() => onSelect(satellite.id)}
      aria-pressed={selected}
      data-warning={warning}
      data-contact={contact}
      data-selected={selected}
      className="flex w-full flex-col gap-2 rounded-lg border text-left border-gray-200 bg-white p-3 data-[selected=true]:ring-2 data-[selected=true]:ring-selected data-[warning=true]:border-warning data-[warning=true]:bg-warning-bg"
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
    </button>
  );
}
