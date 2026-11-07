import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { WARNING_BATTERY } from '../lib/status';
import type { BatteryPoint } from '../types/api';

interface Props {
  data: BatteryPoint[];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** avg는 선, min~max는 범위(면). y축 0~100%, 경고 기준선 20% */
export function BatteryChart({ data }: Props) {
  const rows = data.map((p) => ({ ...p, range: [p.min, p.max] as [number, number] }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="t" tickFormatter={formatTime} fontSize={12} />
        <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} unit="%" fontSize={12} />
        <Tooltip labelFormatter={(v) => formatTime(String(v))} />
        <Area
          dataKey="range"
          name="최소~최대"
          stroke="none"
          fill="var(--color-chart-range)"
          fillOpacity={0.5}
          isAnimationActive={false}
        />
        <Line
          dataKey="avg"
          name="평균"
          stroke="var(--color-chart-avg)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <ReferenceLine
          y={WARNING_BATTERY}
          stroke="var(--color-warning)"
          strokeDasharray="4 4"
          label={{ value: `경고 ${WARNING_BATTERY}%`, position: 'insideTopRight', fill: 'var(--color-warning)', fontSize: 12 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
