/**
 * 앞에서 꺼내고 뒤에 넣는 큐. Array.shift()/splice(0, n)는 매번 O(n)이라
 * 수만 건 버퍼에서 "오래된 것부터 버림"을 하면 CPU를 많이 쓴다.
 * head 인덱스만 옮기고, 앞쪽 빈 공간이 커지면 한 번에 정리한다.
 */
export class PendingQueue<T> {
  private items: T[] = [];
  private head = 0;

  get length(): number {
    return this.items.length - this.head;
  }

  push(item: T): void {
    this.items.push(item);
  }

  /** 앞에서 최대 n개를 꺼낸다 */
  take(n: number): T[] {
    const end = Math.min(this.head + n, this.items.length);
    const out = this.items.slice(this.head, end);
    this.head = end;
    this.compact();
    return out;
  }

  /** 앞에서 n개를 버린다. 실제로 버린 개수를 돌려준다 */
  dropFront(n: number): number {
    const k = Math.min(n, this.length);
    for (let i = this.head; i < this.head + k; i++) (this.items as unknown[])[i] = undefined;
    this.head += k;
    this.compact();
    return k;
  }

  private compact(): void {
    if (this.head === this.items.length) {
      this.items = [];
      this.head = 0;
    } else if (this.head > 4096 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
  }
}
