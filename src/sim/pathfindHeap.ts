export interface OpenNode {
  cell: number;
  f: number;
  g: number;
}

/** The A* open set. Ties break on cell index so expansion order is a function of the map alone. */
export class MinHeap {
  private readonly items: OpenNode[] = [];

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items.length = 0;
  }

  push(node: OpenNode): void {
    this.items.push(node);
    let child = this.items.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (!this.lessThan(child, parent)) break;
      this.swap(child, parent);
      child = parent;
    }
  }

  pop(): OpenNode | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (last !== undefined && this.items.length > 0) {
      this.items[0] = last;
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        if (left < this.items.length && this.lessThan(left, smallest)) smallest = left;
        if (right < this.items.length && this.lessThan(right, smallest)) smallest = right;
        if (smallest === parent) break;
        this.swap(parent, smallest);
        parent = smallest;
      }
    }
    return top;
  }

  // Cell index breaks f-score ties so expansion order never depends on insertion timing.
  private lessThan(a: number, b: number): boolean {
    const left = this.items[a] as OpenNode;
    const right = this.items[b] as OpenNode;
    if (left.f !== right.f) return left.f < right.f;
    return left.cell < right.cell;
  }

  private swap(a: number, b: number): void {
    const held = this.items[a] as OpenNode;
    this.items[a] = this.items[b] as OpenNode;
    this.items[b] = held;
  }
}
