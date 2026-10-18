/** The geometry and bindings shared with fully qualified Excalidraw elements. */
export interface DiagramElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  groupIds: readonly string[];
  isDeleted?: boolean;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  opacity?: number;
  roundness?: unknown;
  text?: string;
  originalText?: string;
  containerId?: string | null;
  fontSize?: number;
  textAlign?: string;
  verticalAlign?: string;
  points?: readonly (readonly [number, number])[];
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
}

export function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\r\n|\r|\n/g, '&#xa;');
}

type Bounds = { x: number; y: number; width: number; height: number };
const supported = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line']);
const number = (value: number) => String(Math.round(value * 1000) / 1000);
const color = (value: string | undefined, fallback: string) =>
  value === 'transparent' ? 'none' : value && /^#[\da-f]{3,8}$/i.test(value) ? value : fallback;

export function assertEditable(elements: readonly DiagramElement[]): void {
  const ids = new Set<string>();
  if (!elements.length) throw new Error('未取得可編輯的圖形元素。');
  for (const element of elements) {
    if (element.isDeleted) continue;
    if (!supported.has(element.type)) throw new Error(`包含無法保留為可編輯元素的類型：${element.type}。請改用一般流程圖節點。`);
    if (ids.has(element.id)) throw new Error('轉換結果包含重複的元素 ID，無法安全匯出。');
    ids.add(element.id);
    if (![element.x, element.y, element.width, element.height, element.angle ?? 0].every(Number.isFinite)) {
      throw new Error('轉換結果包含無效的圖形座標。');
    }
    if (element.angle) throw new Error('第一版不支援旋轉元素的可編輯匯出。');
    if (element.type === 'arrow' || element.type === 'line') {
      if (!element.points || element.points.length < 2 || element.points.some((p) => p.length !== 2 || !p.every(Number.isFinite))) {
        throw new Error('轉換結果包含無效的連線座標。');
      }
    }
  }
  for (const element of elements) {
    for (const reference of [element.startBinding?.elementId, element.endBinding?.elementId, element.containerId]) {
      if (reference && !ids.has(reference)) throw new Error('轉換結果遺失連線或標籤的綁定目標。');
    }
  }
}

function boundsOf(element: DiagramElement): Bounds {
  if (!element.points?.length) return element;
  const xs = element.points.map(([x]) => x + element.x);
  const ys = element.points.map(([, y]) => y + element.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function union(bounds: Bounds[]): Bounds {
  const x = Math.min(...bounds.map((b) => b.x));
  const y = Math.min(...bounds.map((b) => b.y));
  return { x, y, width: Math.max(...bounds.map((b) => b.x + b.width)) - x, height: Math.max(...bounds.map((b) => b.y + b.height)) - y };
}

function arrowStyle(head: string | null | undefined): string {
  switch (head) {
    case 'arrow': return 'open';
    case 'triangle': case 'triangle_outline': return 'block';
    case 'dot': case 'circle': case 'circle_outline': return 'oval';
    case 'diamond': case 'diamond_outline': return 'diamond';
    case 'bar': return 'dash';
    default: return 'none';
  }
}

export function toDrawio(input: readonly DiagramElement[], name: string): string {
  const elements = input.filter((element) => !element.isDeleted);
  assertEditable(elements);
  const elementIds = new Map(elements.map((element, index) => [element.id, `e${index + 1}`]));
  const labels = new Map(elements.filter((element) => element.type === 'text' && element.containerId).map((element) => [element.containerId!, element]));
  const groupMembers = new Map<string, DiagramElement[]>();
  const groupParents = new Map<string, string>();
  for (const element of elements) {
    element.groupIds.forEach((group, index) => {
      groupMembers.set(group, [...(groupMembers.get(group) ?? []), element]);
      const parent = element.groupIds[index + 1];
      if (parent) groupParents.set(group, parent);
    });
  }
  const groupIds = new Map([...groupMembers.keys()].map((group, index) => [group, `g${index + 1}`]));
  const groupBounds = new Map([...groupMembers].map(([group, members]) => [group, union(members.map(boundsOf))]));
  const origin = (group: string | undefined) => group ? groupBounds.get(group)! : { x: 0, y: 0 };
  const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  const emittedGroups = new Set<string>();

  function addGroup(group: string, ancestors = new Set<string>()) {
    if (emittedGroups.has(group)) return;
    if (ancestors.has(group)) throw new Error('轉換結果包含循環群組，無法安全匯出。');
    ancestors.add(group);
    const parent = groupParents.get(group);
    if (parent) addGroup(parent, ancestors);
    const bounds = groupBounds.get(group)!;
    const offset = origin(parent);
    cells.push(`<mxCell id="${groupIds.get(group)}" parent="${parent ? groupIds.get(parent) : '1'}" vertex="1" style="group;html=0;connectable=0;" connectable="0"><mxGeometry x="${number(bounds.x - offset.x)}" y="${number(bounds.y - offset.y)}" width="${number(bounds.width)}" height="${number(bounds.height)}" as="geometry"/></mxCell>`);
    emittedGroups.add(group);
  }
  for (const group of groupMembers.keys()) addGroup(group);

  for (const element of elements) {
    if (element.type === 'text' && element.containerId) continue;
    const group = element.groupIds[0];
    const offset = origin(group);
    const parent = group ? groupIds.get(group) : '1';
    const label = labels.get(element.id) ?? (element.type === 'text' ? element : undefined);
    const value = xml(label?.originalText ?? label?.text ?? '');
    const style = [
      'html=0', 'whiteSpace=wrap', 'fontFamily=Arial',
      `fontSize=${label?.fontSize ?? 20}`, `fontColor=${color(label?.strokeColor, '#1e293b')}`,
      `strokeColor=${color(element.strokeColor, '#1e293b')}`,
      `fillColor=${color(element.backgroundColor, 'none')}`,
      `strokeWidth=${element.strokeWidth ?? 2}`, `opacity=${element.opacity ?? 100}`,
      `align=${label?.textAlign === 'left' ? 'left' : label?.textAlign === 'right' ? 'right' : 'center'}`,
      `verticalAlign=${label?.verticalAlign === 'top' ? 'top' : label?.verticalAlign === 'bottom' ? 'bottom' : 'middle'}`,
      'spacing=5',
    ];
    if (element.strokeStyle === 'dashed' || element.strokeStyle === 'dotted') style.push('dashed=1');
    if (element.type === 'arrow' || element.type === 'line') {
      const points = element.points!.map(([x, y]) => ({ x: x + element.x - offset.x, y: y + element.y - offset.y }));
      style.push('edgeStyle=none', 'rounded=0', `startArrow=${arrowStyle(element.startArrowhead)}`, `endArrow=${arrowStyle(element.endArrowhead)}`, 'labelBackgroundColor=#ffffff');
      const start = element.startBinding?.elementId;
      const end = element.endBinding?.elementId;
      const bindings = `${start ? ` source="${elementIds.get(start)}"` : ''}${end ? ` target="${elementIds.get(end)}"` : ''}`;
      const point = (p: { x: number; y: number }, as = '') => `<mxPoint x="${number(p.x)}" y="${number(p.y)}"${as ? ` as="${as}"` : ''}/>`;
      cells.push(`<mxCell id="${elementIds.get(element.id)}" value="${value}" parent="${parent}" edge="1"${bindings} style="${xml(style.join(';'))}"><mxGeometry relative="1" as="geometry">${point(points[0], 'sourcePoint')}${point(points[points.length - 1], 'targetPoint')}<Array as="points">${points.slice(1, -1).map((p) => point(p)).join('')}</Array></mxGeometry></mxCell>`);
    } else {
      if (element.type === 'text') style.push('text', 'strokeColor=none', 'fillColor=none');
      else if (element.type === 'diamond') style.push('rhombus');
      else if (element.type === 'ellipse') style.push('ellipse');
      else style.push(`rounded=${element.roundness ? 1 : 0}`);
      cells.push(`<mxCell id="${elementIds.get(element.id)}" value="${value}" parent="${parent}" vertex="1" style="${xml(style.join(';'))}"><mxGeometry x="${number(element.x - offset.x)}" y="${number(element.y - offset.y)}" width="${number(element.width)}" height="${number(element.height)}" as="geometry"/></mxCell>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="Mermaid Studio"><diagram id="mermaid-flowchart" name="${xml(name)}"><mxGraphModel grid="1" gridSize="10" page="0"><root>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`;
}
