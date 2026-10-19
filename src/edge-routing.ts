import type { DiagramElement } from './drawio';

type Point = [number, number];
type Box = { left: number; right: number; top: number; bottom: number };
type Segment = { a: Point; b: Point };
const clearance = 16;
const inside = ([x, y]: Point, box: Box) => x > box.left + 0.01 && x < box.right - 0.01 && y > box.top + 0.01 && y < box.bottom - 0.01;
const blocked = (a: Point, b: Point, box: Box) => a[0] === b[0]
  ? a[0] > box.left + 0.01 && a[0] < box.right - 0.01 && Math.max(a[1], b[1]) > box.top + 0.01 && Math.min(a[1], b[1]) < box.bottom - 0.01
  : a[1] > box.top + 0.01 && a[1] < box.bottom - 0.01 && Math.max(a[0], b[0]) > box.left + 0.01 && Math.min(a[0], b[0]) < box.right - 0.01;

function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (previous && previous[0] === point[0] && previous[1] === point[1]) continue;
    const before = result[result.length - 2];
    if (before && previous && ((before[0] === previous[0] && previous[0] === point[0]) || (before[1] === previous[1] && previous[1] === point[1]))) result.pop();
    result.push(point);
  }
  return result;
}

// Search a rectilinear visibility grid. Existing routes add a crossing/overlap
// cost, while padded node bounds are hard obstacles.
function route(start: Point, end: Point, boxes: Box[], used: Segment[], lane: number): Point[] | undefined {
  const xs = [...new Set([start[0], end[0], ...boxes.flatMap((b) => [b.left, b.right]), Math.min(...boxes.map((b) => b.left)) - lane, Math.max(...boxes.map((b) => b.right)) + lane])].sort((a, b) => a - b);
  const ys = [...new Set([start[1], end[1], ...boxes.flatMap((b) => [b.top, b.bottom]), Math.min(...boxes.map((b) => b.top)) - lane, Math.max(...boxes.map((b) => b.bottom)) + lane])].sort((a, b) => a - b);
  const width = xs.length;
  const index = (p: Point) => ys.indexOf(p[1]) * width + xs.indexOf(p[0]);
  const point = (id: number): Point => [xs[id % width], ys[Math.floor(id / width)]];
  const target = index(end);
  const initial = index(start) * 3;
  const costs = new Map<number, number>([[initial, 0]]);
  const parents = new Map<number, number>();
  const heap: { state: number; score: number; cost: number }[] = [];
  function push(item: typeof heap[number]) {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].score <= item.score) break;
      heap[i] = heap[parent];
      i = parent;
    }
    heap[i] = item;
  }
  function pop() {
    const first = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
        if (heap[child].score >= last.score) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return first;
  }
  push({ state: initial, cost: 0, score: 0 });
  // Bound work on very dense graphs; callers retain the existing path on failure.
  let visited = 0;
  while (heap.length && visited++ < 20_000) {
    const current = pop();
    if (current.cost !== costs.get(current.state)) continue;
    const id = Math.floor(current.state / 3);
    const a = point(id);
    if (id === target) {
      const path: Point[] = [];
      let state: number | undefined = current.state;
      while (state !== undefined) {
        path.push(point(Math.floor(state / 3)));
        state = parents.get(state);
      }
      return simplify(path.reverse());
    }
    const col = id % width;
    const row = Math.floor(id / width);
    for (const [next, direction] of [[col > 0 ? id - 1 : -1, 1], [col + 1 < width ? id + 1 : -1, 1], [row > 0 ? id - width : -1, 2], [row + 1 < ys.length ? id + width : -1, 2]]) {
      if (next < 0) continue;
      const b = point(next);
      if (boxes.some((box) => inside(b, box) || blocked(a, b, box))) continue;
      const length = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
      let penalty = current.state % 3 && current.state % 3 !== direction ? 24 : 0;
      for (const segment of used) {
        const horizontal = a[1] === b[1];
        const otherHorizontal = segment.a[1] === segment.b[1];
        if (horizontal === otherHorizontal) {
          const axis = horizontal ? 0 : 1;
          if (a[1 - axis] === segment.a[1 - axis]) {
            penalty += Math.max(0, Math.min(Math.max(a[axis], b[axis]), Math.max(segment.a[axis], segment.b[axis])) - Math.max(Math.min(a[axis], b[axis]), Math.min(segment.a[axis], segment.b[axis]))) * 4;
          }
        } else {
          const h = horizontal ? { a, b } : segment;
          const v = horizontal ? segment : { a, b };
          if (v.a[0] >= Math.min(h.a[0], h.b[0]) && v.a[0] <= Math.max(h.a[0], h.b[0]) && h.a[1] >= Math.min(v.a[1], v.b[1]) && h.a[1] <= Math.max(v.a[1], v.b[1])) penalty += 40;
        }
      }
      const state = next * 3 + direction;
      const cost = current.cost + length + penalty;
      if (cost >= (costs.get(state) ?? Infinity)) continue;
      costs.set(state, cost);
      parents.set(state, current.state);
      push({ state, cost, score: cost + Math.abs(b[0] - end[0]) + Math.abs(b[1] - end[1]) });
    }
  }
}

export function routeFlowchart<T extends DiagramElement>(elements: readonly T[]): T[] {
  const nodes = elements.filter((e) => ['rectangle', 'diamond', 'ellipse'].includes(e.type) && !e.groupIds.some((id) => id === `subgraph_group_${e.id}`));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const boxes = nodes.map((n) => ({ left: n.x - clearance, right: n.x + n.width + clearance, top: n.y - clearance, bottom: n.y + n.height + clearance }));
  const used: Segment[] = [];
  const routes = new Map<string, Point[]>();
  const arrows = elements.filter((e) => e.type === 'arrow');
  // Route the main flow first so auxiliary dashed edges prefer free lanes.
  const sorted = [...arrows].sort((a, b) => Number(a.strokeStyle === 'dashed') - Number(b.strokeStyle === 'dashed'));
  for (const [index, arrow] of sorted.entries()) {
    const from = byId.get(arrow.startBinding?.elementId ?? '');
    const to = byId.get(arrow.endBinding?.elementId ?? '');
    if (!from || !to || from === to) continue;
    const absolute = arrow.points!.map(([x, y]) => [x + arrow.x, y + arrow.y] as Point);
    function port(node: T, endpoint: Point): { anchor: Point; outside: Point } {
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      const dx = (endpoint[0] - cx) / (node.width / 2);
      const dy = (endpoint[1] - cy) / (node.height / 2);
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const sign = (horizontal ? dx : dy) >= 0 ? 1 : -1;
      const anchor: Point = horizontal ? [cx + sign * node.width / 2, cy] : [cx, cy + sign * node.height / 2];
      const outside: Point = horizontal ? [anchor[0] + sign * clearance, anchor[1]] : [anchor[0], anchor[1] + sign * clearance];
      return { anchor, outside };
    }
    const start = port(from, absolute[0]);
    const end = port(to, absolute[absolute.length - 1]);
    const path = route(start.outside, end.outside, boxes, used, clearance * (index + 1));
    if (!path) continue; // Keep the original route if nodes leave no free corridor.
    const points = simplify([start.anchor, ...path, end.anchor]);
    routes.set(arrow.id, points);
    for (let i = 1; i < points.length; i++) used.push({ a: points[i - 1], b: points[i] });
  }
  return elements.map((element) => {
    const points = routes.get(element.id);
    if (points) return { ...element, x: points[0][0], y: points[0][1], points: points.map(([x, y]) => [x - points[0][0], y - points[0][1]]), width: Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x)), height: Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y)) } as T;
    const path = routes.get(element.containerId ?? '');
    if (element.type !== 'text' || !path) return element;
    // Put labels on the longest segment, away from corners.
    let longest = 0;
    let center: Point = path[0];
    for (let i = 1; i < path.length; i++) {
      const length = Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]);
      if (length > longest) {
        longest = length;
        center = [(path[i][0] + path[i - 1][0]) / 2, (path[i][1] + path[i - 1][1]) / 2];
      }
    }
    return { ...element, x: center[0] - element.width / 2, y: center[1] - element.height / 2 };
  });
}
