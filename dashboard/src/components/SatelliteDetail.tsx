import { RANGES, type RangeKey } from '../lib/ranges';
import { getSatStatus } from '../lib/status';
import { summarize } from '../lib/summary';
import type { BatteryPoint, SatelliteSummary } from '../types/api';
import { BatteryChart } from './BatteryChart';
import { ContactDot } from './ContactDot';
import { ModeBadge } from './ModeBadge';

interface Props {
  satellite: SatelliteSummary;
  batterySeries: BatteryPoint[];
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  onToggleMode: () => void;
}

export function SatelliteDetail({ satellite, batterySeries, range, onRangeChange, onToggleMode }: Props) {
  const t = satellite.latestTelemetry;
  const { warning, contact } = getSatStatus(t);
  const summary = summarize(batterySeries);

  const latest = [
    { label: 'battery', value: t ? `${t.battery.toFixed(1)}%` : '-' },
    { label: 'temp', value: t ? `${t.temp.toFixed(1)}°C` : '-' },
    { label: 'rssi', value: t?.rssi != null ? `${t.rssi.toFixed(1)} dBm` : '-' },
    { label: 'sunlit', value: t ? (t.sunlit ? '햇빛' : '그늘') : '-' },
  ];

  const rangeSummary = [
    { label: '최소', value: summary?.min },
    { label: '최대', value: summary?.max },
    { label: '평균', value: summary?.avg },
  ];

  return (
    <section
      data-warning={warning}
      data-contact={contact}
      className="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-gray-200 bg-white"
    >
      {/* 제목 */}
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{satellite.id}</h2>
          {t && <ModeBadge mode={t.mode} />}
          <span className="flex items-center gap-1.5 text-sm text-gray-500">
            <ContactDot contact={contact} />
            {t ? (contact ? '교신 중' : '교신 없음') : '텔레메트리 없음'}
          </span>
        </div>
        {/* 모드 전환: 목업 상태의 mode만 바꾼다. 텔레메트리 없으면 비활성 */}
        <button
          type="button"
          onClick={onToggleMode}
          disabled={!t}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t?.mode === 'SAFE' ? 'NORMAL로 전환' : 'SAFE로 전환'}
        </button>
      </header>

      <div className="flex flex-col gap-4 p-4">
        {/* 최신 값 */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-500">최신 값</h3>
          <dl className="grid grid-cols-4 gap-2">
            {latest.map((item) => (
              <div key={item.label} className="rounded-md border border-gray-200 px-3 py-2">
                <dt className="text-xs text-gray-500">{item.label}</dt>
                <dd className="text-lg tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <hr className="border-gray-200" />

        {/* 배터리 추이 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500">배터리 추이</h3>
            {/* 기간 선택: 선택된 버튼은 data-selected */}
            <div className="flex overflow-hidden rounded-md border border-gray-300 text-sm">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onRangeChange(r.key)}
                  aria-pressed={r.key === range}
                  data-selected={r.key === range}
                  className="border-l border-gray-300 px-3 py-1 first:border-l-0 data-[selected=true]:bg-selected data-[selected=true]:text-white"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-56">
            <BatteryChart data={batterySeries} />
          </div>
          {/* 구간 요약 */}
          <dl className="grid grid-cols-3 gap-2">
            {rangeSummary.map((item) => (
              <div key={item.label} className="rounded-md border border-gray-200 px-3 py-2">
                <dt className="text-xs text-gray-500">{item.label}</dt>
                <dd className="text-lg tabular-nums">{item.value != null ? `${item.value.toFixed(1)}%` : '-'}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
