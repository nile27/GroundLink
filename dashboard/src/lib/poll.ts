/**
 * 요청이 끝난 뒤 intervalMs 후 다음 요청을 예약하는 폴링 (setInterval 아님 → 요청이 겹치지 않음).
 * 반환한 함수를 부르면 타이머를 지우고 진행 중 요청을 AbortController 로 취소한다.
 * 멈춘 뒤 도착한 응답은 버린다 (이전 위성·기간의 늦은 응답이 새 화면을 덮어쓰지 않게).
 */
export function poll<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  onData: (data: T) => void,
  onError: (error: unknown) => void,
  intervalMs = 1000,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | null = null;

  async function tick() {
    controller = new AbortController();
    try {
      const data = await fetcher(controller.signal);
      if (!stopped) onData(data);
    } catch (e) {
      if (!stopped) onError(e);
    } finally {
      controller = null;
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  }

  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
  };
}
