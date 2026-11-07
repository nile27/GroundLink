import { AlarmTable } from './components/AlarmTable';
import { SatelliteDetail } from './components/SatelliteDetail';
import { SatelliteList } from './components/SatelliteList';
import { SummaryBar } from './components/SummaryBar';
import { mockAlarms, mockSatellites } from './mocks/data';

function App() {
  const satellites = mockSatellites;
  const alarms = mockAlarms;
  // 선택 위성은 첫 번째로 고정 (선택 동작은 다음 단계)
  const selected = satellites[0] ?? null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <SummaryBar satellites={satellites} />

      <div className="grid grid-cols-[18rem_1fr] gap-4">
        <SatelliteList satellites={satellites} selectedId={selected?.id ?? null} />
        {selected ? <SatelliteDetail satellite={selected} /> : <div className="border p-3">위성 없음</div>}
      </div>

      <AlarmTable alarms={alarms} />
    </div>
  );
}

export default App;
