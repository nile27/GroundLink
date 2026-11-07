import { useState } from 'react';
import { AlarmTable } from './components/AlarmTable';
import { SatelliteDetail } from './components/SatelliteDetail';
import { SatelliteList } from './components/SatelliteList';
import { SummaryBar } from './components/SummaryBar';
import type { RangeKey } from './lib/ranges';
import { mockAlarms, mockBatterySeriesByRange, mockSatellites } from './mocks/data';
import type { SatelliteSummary } from './types/api';

function App() {
  // 상태는 모두 App에 useState로 둔다 (최적화 없음. 5단계 "개선 전" 기준선)
  const [satellites, setSatellites] = useState<SatelliteSummary[]>(mockSatellites);
  // 인덱스가 아니라 id로 저장: 배열이 통째로 바뀌어도(4단계 폴링) 선택이 유지됨
  const [selectedId, setSelectedId] = useState<string | null>(mockSatellites[0]?.id ?? null);
  const [range, setRange] = useState<RangeKey>('1m');
  const alarms = mockAlarms;

  const selected = satellites.find((s) => s.id === selectedId) ?? null;
  const batterySeries = mockBatterySeriesByRange[range];

  /** 선택 위성의 mode를 SAFE ↔ NORMAL로 바꾼다. 목업 상태만 변경 (서버 명령 규칙은 적용하지 않음) */
  function toggleMode(satId: string) {
    setSatellites((prev) =>
      prev.map((s) => {
        if (s.id !== satId || !s.latestTelemetry) return s;
        const mode = s.latestTelemetry.mode === 'SAFE' ? 'NORMAL' : 'SAFE';
        return { ...s, latestTelemetry: { ...s.latestTelemetry, mode } };
      }),
    );
  }

  return (
    // 화면 높이 고정. 카드 목록·알람 표는 각자 스크롤
    <div className="flex h-screen flex-col gap-4 bg-gray-100 p-4 text-gray-900">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">GroundLink</h1>
      </header>

      <SummaryBar satellites={satellites} />

      <div className="grid min-h-0 flex-1 grid-cols-[20rem_1fr] gap-4">
        <SatelliteList satellites={satellites} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
        {selected ? (
          <SatelliteDetail
            satellite={selected}
            batterySeries={batterySeries}
            range={range}
            onRangeChange={setRange}
            onToggleMode={() => toggleMode(selected.id)}
          />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-muted">위성 없음</div>
        )}
      </div>

      <div className="flex h-56 shrink-0 flex-col">
        <AlarmTable alarms={alarms} />
      </div>
    </div>
  );
}

export default App;
