import { RANGES, type RangeKey } from '../lib/ranges';
import { WARNING_BATTERY, getSatStatus } from '../lib/status';
import { COMMAND_CHECK_TIMEOUT_MS, type CommandResult } from '../lib/commands';
import { summarize } from '../lib/summary';
import type { BatteryPoint, SatelliteSummary } from '../types/api';
import { BatteryChart } from './BatteryChart';
import { ContactDot } from './ContactDot';
import { ModeBadge } from './ModeBadge';

interface Props {
  satellite: SatelliteSummary;
  /** null = 불러오는 중 */
  batterySeries: BatteryPoint[] | null;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  onToggleMode: () => void;
  /** 모드 명령 요청 중 (버튼 비활성) */
  commandPending: boolean;
  /** 모드 명령 실패 메시지 (POST 실패) */
  commandError: string | null;
  /** 모드 명령 결과 (GET /satellites/:id/commands 로 확인) */
  commandResult: CommandResult | null;
}

const COMMAND_CHECK_SECONDS = COMMAND_CHECK_TIMEOUT_MS / 1000;

const RESULT_LABEL: Record<CommandResult['status'], string> = {
  PENDING: '확인 중',
  SUCCESS: '성공',
  FAILED: '실패',
  TIMEOUT: '시간 초과',
};

export function SatelliteDetail({
  satellite,
  batterySeries,
  range,
  onRangeChange,
  onToggleMode,
  commandPending,
  commandError,
  commandResult,
}: Props) {
  const t = satellite.latestTelemetry;
  const { warning, contact } = getSatStatus(t);
  const summary = batterySeries ? summarize(batterySeries) : null;
  // 시뮬레이터가 배터리 20% 미만에서 NORMAL 명령을 거부함 (simulator/src/satellite.ts setModeByCommand)
  const normalBlocked = t?.mode === 'SAFE' && t.battery < WARNING_BATTERY;

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
        {/* 모드 전환: POST 명령만 보냄. 화면의 mode는 폴링 텔레메트리로 바뀜. 텔레메트리 없거나 요청 중이면 비활성 */}
        <button
          type="button"
          onClick={onToggleMode}
          disabled={!t || commandPending || normalBlocked}
          title={normalBlocked ? `배터리 ${WARNING_BATTERY}% 미만이라 위성이 NORMAL 전환을 거부함` : undefined}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t?.mode === 'SAFE' ? 'NORMAL로 전환' : 'SAFE로 전환'}
        </button>
      </header>

      {normalBlocked && t && (
        <div className="border-b border-gray-200 px-4 py-2 text-sm text-gray-600">
          NORMAL 전환 불가: 배터리 {t.battery.toFixed(1)}% &lt; {WARNING_BATTERY}% (위성이 명령을 거부함)
        </div>
      )}

      {commandResult && (
        <div
          role="status"
          data-status={commandResult.phase === 'no-response' ? 'NO_RESPONSE' : commandResult.status}
          className="border-b border-gray-200 px-4 py-2 text-sm text-gray-600 data-[status=FAILED]:bg-warning-bg data-[status=FAILED]:text-warning data-[status=NO_RESPONSE]:bg-warning-bg data-[status=NO_RESPONSE]:text-warning data-[status=SUCCESS]:text-contact data-[status=TIMEOUT]:bg-warning-bg data-[status=TIMEOUT]:text-warning"
        >
          {commandResult.mode} 전환 명령:{' '}
          {commandResult.phase === 'checking'
            ? '결과 확인 중…'
            : commandResult.phase === 'no-response'
              ? `응답 없음 (${COMMAND_CHECK_SECONDS}초 동안 결과가 오지 않음)`
              : `${RESULT_LABEL[commandResult.status]}${commandResult.message ? ` — ${commandResult.message}` : ''}`}
        </div>
      )}

      {commandError && (
        <div role="alert" className="border-b border-warning bg-warning-bg px-4 py-2 text-sm text-warning">
          모드 전환 명령 실패: {commandError}
        </div>
      )}

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
            {batterySeries === null ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">불러오는 중…</div>
            ) : batterySeries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">이 기간에 데이터 없음</div>
            ) : (
              <BatteryChart data={batterySeries} />
            )}
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
