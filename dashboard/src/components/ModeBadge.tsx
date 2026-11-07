import type { SatMode } from '../types/api';

interface Props {
  mode: SatMode;
}

/** 모드 표시. SAFE는 주황 배지, NORMAL은 옅은 글자 */
export function ModeBadge({ mode }: Props) {
  return (
    <span
      data-mode={mode}
      className="rounded px-1.5 py-0.5 text-xs font-medium text-gray-500 data-[mode=SAFE]:bg-safe data-[mode=SAFE]:text-white"
    >
      {mode}
    </span>
  );
}
