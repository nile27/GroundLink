import { AlarmTable } from './components/AlarmTable';
import { SatelliteDetail } from './components/SatelliteDetail';
import { SatelliteList } from './components/SatelliteList';
import { SummaryBar } from './components/SummaryBar';
import { mockAlarms, mockBatterySeries, mockSatellites } from './mocks/data';

function App() {
  const satellites = mockSatellites;
  const alarms = mockAlarms;
  // 선택 위성은 첫 번째로 고정 (선택 동작은 다음 단계)
  const selected = satellites[0] ?? null;

  return (
    // 화면 높이 고정. 카드 목록·알람 표는 각자 스크롤
    <div className="flex h-screen flex-col gap-4 bg-gray-100 p-4 text-gray-900">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">GroundLink</h1>
      </header>

      <SummaryBar satellites={satellites} />

      <div className="grid min-h-0 flex-1 grid-cols-[20rem_1fr] gap-4">
        <SatelliteList satellites={satellites} selectedId={selected?.id ?? null} />
        {selected ? (
          <SatelliteDetail satellite={selected} batterySeries={mockBatterySeries} />
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
