import type { Alarm } from '../types/api';

interface Props {
  /** null = 첫 응답 전 */
  alarms: Alarm[] | null;
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { hour12: false });
}

export function AlarmTable({ alarms }: Props) {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white">
      <h2 className="border-b border-gray-200 px-4 py-2 font-semibold">알람 ({alarms?.length ?? '-'})</h2>
      {/* 표만 스크롤 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-100 text-left text-xs text-gray-600">
            <tr>
              <th className="px-3 py-2 font-medium">시각</th>
              <th className="px-3 py-2 font-medium">위성</th>
              <th className="px-3 py-2 font-medium">종류</th>
              <th className="px-3 py-2 font-medium">심각도</th>
              <th className="px-3 py-2 text-right font-medium">값</th>
              <th className="px-3 py-2 text-right font-medium">임계값</th>
              <th className="px-3 py-2 font-medium">메시지</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {alarms === null && (
              <tr>
                <td colSpan={7} className="px-3 py-2 text-muted">
                  불러오는 중…
                </td>
              </tr>
            )}
            {alarms?.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2 tabular-nums">{formatTs(a.ts)}</td>
                <td className="px-3 py-2">{a.satId}</td>
                <td className="px-3 py-2">{a.type}</td>
                <td className="px-3 py-2">
                  {/* severity 색: CRITICAL 빨강, WARNING 주황 */}
                  <span
                    data-severity={a.severity}
                    className="rounded px-1.5 py-0.5 text-xs font-medium text-white data-[severity=CRITICAL]:bg-sev-critical data-[severity=WARNING]:bg-sev-warning"
                  >
                    {a.severity}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{a.value}</td>
                <td className="px-3 py-2 text-right tabular-nums">{a.threshold}</td>
                <td className="px-3 py-2">{a.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
