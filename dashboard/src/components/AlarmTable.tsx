import type { Alarm } from '../types/api';

interface Props {
  alarms: Alarm[];
}

export function AlarmTable({ alarms }: Props) {
  return (
    <table className="w-full border">
      <thead>
        <tr>
          <th className="border p-1">시각</th>
          <th className="border p-1">위성</th>
          <th className="border p-1">종류</th>
          <th className="border p-1">심각도</th>
          <th className="border p-1">값</th>
          <th className="border p-1">임계값</th>
          <th className="border p-1">메시지</th>
        </tr>
      </thead>
      <tbody>
        {alarms.map((a) => (
          <tr key={a.id}>
            <td className="border p-1">{a.ts}</td>
            <td className="border p-1">{a.satId}</td>
            <td className="border p-1">{a.type}</td>
            <td className="border p-1">{a.severity}</td>
            <td className="border p-1">{a.value}</td>
            <td className="border p-1">{a.threshold}</td>
            <td className="border p-1">{a.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
