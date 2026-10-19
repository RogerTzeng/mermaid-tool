type Point = [number, number];
export type LabelLayout = Bounds & { text: string; fontSize: number; strokeColor?: string };
export type Bounds = { x: number; y: number; width: number; height: number };

// Use the displayed SVG as the single source of geometry and resolved styles.
export function previewStyles(svg: string) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  host.innerHTML = svg;
  document.body.append(host);
  const root = host.querySelector('svg')!;
  const matrix = (element: SVGGraphicsElement) => root.getScreenCTM()!.inverse().multiply(element.getScreenCTM()!);
  const bounds = (element: SVGGraphicsElement): Bounds => {
    const box = element.getBBox();
    const transform = matrix(element);
    const a = new DOMPoint(box.x, box.y).matrixTransform(transform);
    const b = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(transform);
    return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
  };
  const read = (element: Element | null, property: string) => {
    if (!element) return undefined;
    const value = getComputedStyle(element).getPropertyValue(property).trim();
    if (value === 'none') return 'transparent';
    const rgb = value.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    return rgb ? `#${rgb.slice(1).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : value || undefined;
  };
  const label = (container: Element | null): LabelLayout | undefined => {
    const text = container?.querySelector<SVGGraphicsElement>('text');
    if (!text) return undefined;
    const rows = [...text.querySelectorAll('.text-outer-tspan')];
    return {
      ...bounds(text),
      text: rows.length ? rows.map((row) => row.textContent ?? '').join('\n') : text.textContent ?? '',
      fontSize: Number.parseFloat(getComputedStyle(text).fontSize),
      strokeColor: read(text.querySelector('tspan.text-inner-tspan, tspan') ?? text, 'fill'),
    };
  };
  const styles = (shape: Element) => ({
    backgroundColor: read(shape, 'fill'),
    strokeColor: read(shape, 'stroke'),
    strokeWidth: Number.parseFloat(getComputedStyle(shape).strokeWidth),
  });
  try {
    const nodes = new Map<string, ReturnType<typeof styles> & Bounds & { label: ReturnType<typeof label> }>();
    for (const node of host.querySelectorAll('.node, .cluster')) {
      const localId = node.id.startsWith(`${root.id}-`) ? node.id.slice(root.id.length + 1) : node.id;
      const id = localId.match(/^flowchart-(.*)-\d+$/)?.[1] ?? localId;
      const shape = node.querySelector<SVGGraphicsElement>('.label-container, rect, polygon, circle, ellipse, path');
      if (shape) nodes.set(id, { ...styles(shape), ...bounds(shape), label: label(node) });
    }
    const edges = new Map<string, ReturnType<typeof styles> & { points: Point[]; label: ReturnType<typeof label> }>();
    for (const edge of host.querySelectorAll<SVGPathElement>('.edgePaths path.flowchart-link')) {
      const id = edge.getAttribute('data-id') ?? edge.id.replace(`${root.id}-`, '');
      const transform = matrix(edge);
      const length = edge.getTotalLength();
      const samples = Math.max(1, Math.ceil(length / 2));
      const points: Point[] = [];
      for (let i = 0; i <= samples; i++) {
        const p = edge.getPointAtLength(length * i / samples).matrixTransform(transform);
        points.push([p.x, p.y]);
      }
      const edgeLabel = [...host.querySelectorAll('.edgeLabels .label')].find((element) => element.getAttribute('data-id') === id);
      edges.set(id, { ...styles(edge), points: simplifyPath(points), label: label(edgeLabel ?? null) });
    }
    return { nodes, edges };
  } finally {
    host.remove();
  }
}

// Retain the rendered curves as editable polylines with subpixel error.
function simplifyPath(points: Point[]): Point[] {
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  let farthest = 0;
  let distance = 0.25;
  for (let i = 1; i < points.length - 1; i++) {
    const t = dx || dy ? Math.max(0, Math.min(1, ((points[i][0] - first[0]) * dx + (points[i][1] - first[1]) * dy) / (dx * dx + dy * dy))) : 0;
    const d = Math.hypot(points[i][0] - first[0] - t * dx, points[i][1] - first[1] - t * dy);
    if (d > distance) { farthest = i; distance = d; }
  }
  if (!farthest) return [first, last];
  return [...simplifyPath(points.slice(0, farthest + 1)).slice(0, -1), ...simplifyPath(points.slice(farthest))];
}
