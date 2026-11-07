import { useEffect, useState } from 'react';
import { AlarmTable } from './components/AlarmTable';
import { SatelliteDetail } from './components/SatelliteDetail';
import { SatelliteList } from './components/SatelliteList';
import { SummaryBar } from './components/SummaryBar';
import { errorMessage, getAlarms, getBatterySummary, getSatelliteStats, getSatellites, sendSetMode } from './lib/api';
import { poll } from './lib/poll';
import { RANGES, type RangeKey } from './lib/ranges';
import type { Alarm, BatteryPoint, SatelliteStats, SatelliteSummary } from './types/api';

/** 폴링 간격 (ms). 요청이 끝난 뒤 이만큼 기다렸다 다음 요청 */
const POLL_MS = 1000;
/** 알람 표 행 수 (서버 허용 1~500) */
const ALARM_LIMIT = 50;

type PollSource = 'satellites' | 'stats' | 'alarms' | 'summary';
const SOURCE_LABEL: Record<PollSource, string> = {
  satellites: '위성 목록',
  stats: '요약',
  alarms: '알람',
  summary: '배터리 추이',
};

function App() {
  // 상태는 모두 App에 useState로 둔다 (최적화 없음. 5단계 "개선 전" 기준선)
  // null = 아직 첫 응답 전
  const [satellites, setSatellites] = useState<SatelliteSummary[] | null>(null);
  const [stats, setStats] = useState<SatelliteStats | null>(null);
  const [alarms, setAlarms] = useState<Alarm[] | null>(null);
  // 위성 id로 저장 (배열이 매초 통째로 바뀌어도 유지). undefined = 첫 응답 전 (첫 위성으로 초기화)
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const [range, setRange] = useState<RangeKey>('1m');
  // null = 불러오는 중 (위성·기간이 바뀌면 비움)
  const [batterySeries, setBatterySeries] = useState<BatteryPoint[] | null>(null);
  // 폴링 실패 메시지. 다시 성공하면 지움
  const [pollErrors, setPollErrors] = useState<Partial<Record<PollSource, string>>>({});
  // 모드 명령
  const [commandPending, setCommandPending] = useState(false);
  const [commandError, setCommandError] = useState<{ satId: string; message: string } | null>(null);

  function setPollError(source: PollSource, error: unknown | null) {
    setPollErrors((prev) => {
      const next = { ...prev };
      if (error === null) delete next[source];
      else next[source] = errorMessage(error);
      return next;
    });
  }

  // 위성 목록 · 요약 · 알람: 각각 1초 폴링
  useEffect(() => {
    const stops = [
      poll(
        (signal) => getSatellites(signal),
        (data) => {
          setSatellites(data);
          // 첫 응답이면 첫 위성 선택, 선택한 위성이 응답에서 사라졌으면 null
          setSelectedId((prev) => {
            if (prev === undefined) return data[0]?.id ?? null;
            if (prev !== null && !data.some((s) => s.id === prev)) return null;
            return prev;
          });
          setPollError('satellites', null);
        },
        (e) => setPollError('satellites', e),
        POLL_MS,
      ),
      poll(
        (signal) => getSatelliteStats(signal),
        (data) => {
          setStats(data);
          setPollError('stats', null);
        },
        (e) => setPollError('stats', e),
        POLL_MS,
      ),
      poll(
        (signal) => getAlarms(ALARM_LIMIT, signal),
        (data) => {
          setAlarms(data);
          setPollError('alarms', null);
        },
        (e) => setPollError('alarms', e),
        POLL_MS,
      ),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  // 배터리 추이: 선택 위성 + 기간. 바뀌면 즉시 다시 호출하고 이전 폴링(늦은 응답 포함)은 버린다
  useEffect(() => {
    setBatterySeries(null);
    setPollError('summary', null);
    if (!selectedId) return;
    const option = RANGES.find((r) => r.key === range)!;
    return poll(
      (signal) => {
        const to = new Date();
        const from = new Date(to.getTime() - option.seconds * 1000);
        return getBatterySummary(selectedId, from, to, option.bucketSeconds, signal);
      },
      (data) => {
        setBatterySeries(data);
        setPollError('summary', null);
      },
      (e) => setPollError('summary', e),
      POLL_MS,
    );
  }, [selectedId, range]);

  /** 모드 명령. 낙관적 업데이트 없음: 화면의 mode 는 폴링으로 받은 텔레메트리만 따른다 */
  async function requestModeChange(satellite: SatelliteSummary) {
    const current = satellite.latestTelemetry?.mode;
    if (!current) return;
    setCommandPending(true);
    setCommandError(null);
    try {
      await sendSetMode(satellite.id, current === 'SAFE' ? 'NORMAL' : 'SAFE');
    } catch (e) {
      setCommandError({ satId: satellite.id, message: errorMessage(e) });
    } finally {
      setCommandPending(false);
    }
  }

  const selected = satellites?.find((s) => s.id === selectedId) ?? null;
  const errorEntries = Object.entries(pollErrors) as [PollSource, string][];

  return (
    // 화면 높이 고정. 카드 목록·알람 표는 각자 스크롤
    <div className="flex h-screen flex-col gap-4 bg-gray-100 p-4 text-gray-900">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">GroundLink</h1>
      </header>

      {/* 폴링 에러: 마지막 데이터는 유지하고 폴링은 계속. 다시 성공하면 사라짐 */}
      {errorEntries.length > 0 && (
        <div role="alert" className="rounded-lg border border-warning bg-warning-bg px-4 py-2 text-sm text-warning">
          {errorEntries.map(([source, message]) => (
            <div key={source}>
              {SOURCE_LABEL[source]} 갱신 실패: {message}
            </div>
          ))}
        </div>
      )}

      {satellites === null ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white text-muted">
          불러오는 중…
        </div>
      ) : (
        <>
          <SummaryBar stats={stats} />

          <div className="grid min-h-0 flex-1 grid-cols-[20rem_1fr] gap-4">
            <SatelliteList satellites={satellites} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            {selected ? (
              <SatelliteDetail
                satellite={selected}
                batterySeries={batterySeries}
                range={range}
                onRangeChange={setRange}
                onToggleMode={() => requestModeChange(selected)}
                commandPending={commandPending}
                commandError={commandError?.satId === selected.id ? commandError.message : null}
              />
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-muted">위성을 선택하세요</div>
            )}
          </div>

          <div className="flex h-56 shrink-0 flex-col">
            <AlarmTable alarms={alarms} />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
