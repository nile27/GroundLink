import { getSatStatus } from '../lib/status';
import type { SatelliteSummary } from '../types/api';

interface Props {
  satellite: SatelliteSummary;
}

/** 기간 선택 버튼 (동작은 다음 단계) */
const RANGES = [
  { key: '1m', label: '최근 1분' },
  { key: '1h', label: '1시간' },
  { key: '24h', label: '24시간' },
] as const;

export function SatelliteDetail({ satellite }: Props) {
  const t = satellite.latestTelemetry;
  const { warning, contact } = getSatStatus(t);

  const latest = [
    { label: 'battery', value: t ? `${t.battery}%` : '-' },
    { label: 'temp', value: t ? `${t.temp}°C` : '-' },
    { label: 'rssi', value: t?.rssi != null ? `${t.rssi} dBm` : '-' },
    { label: 'mode', value: t?.mode ?? '-' },
    { label: 'sunlit', value: t ? String(t.sunlit) : '-' },
    { label: '교신', value: t ? (contact ? '교신 중' : '교신 없음') : '-' },
  ];

  return (
    <div className="flex flex-col gap-3 border p-3" data-warning={warning} data-contact={contact}>
      <div className="flex items-center justify-between">
        <span>{satellite.id}</span>
        {/* 모드 전환 (동작은 다음 단계) */}
        <button type="button" className="border px-2 py-1">
          {t?.mode === 'SAFE' ? 'NORMAL로 전환' : 'SAFE로 전환'}
        </button>
      </div>

      {/* 최신 값 */}
      <div className="grid grid-cols-3 gap-2">
        {latest.map((item) => (
          <div key={item.label} className="border p-2">
            <div>{item.label}</div>
            <div>{item.value}</div>
          </div>
        ))}
      </div>

      {/* 기간 선택 */}
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button key={r.key} type="button" className="border px-2 py-1">
            {r.label}
          </button>
        ))}
      </div>

      {/* 배터리 차트 자리 */}
      <div className="h-48 border p-2">배터리 차트</div>

      {/* 구간 요약 자리 */}
      <div className="grid grid-cols-3 gap-2">
        {['최소', '최대', '평균'].map((label) => (
          <div key={label} className="border p-2">
            <div>{label}</div>
            <div>-</div>
          </div>
        ))}
      </div>
    </div>
  );
}
