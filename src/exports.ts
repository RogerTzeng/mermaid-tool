import { checkSource, safeFilename } from './flowchart';
import { assertEditable, toDrawio } from './drawio';
import type { RenderedDiagram } from './render';
import { diagramQueue } from './serial-queue';
import { previewStyles, type Bounds, type LabelLayout } from './editable-style';

export type ExportFormat = 'svg' | 'png' | 'drawio' | 'excalidraw';

async function editableScene(source: string, svg: string) {
  checkSource(source);
  const [{ parseMermaidToExcalidraw }, { convertToExcalidrawElements, serializeAsJSON }] = await Promise.all([
    import('@excalidraw/mermaid-to-excalidraw'),
    import('@excalidraw/excalidraw'),
  ]);
  const { elements: skeleton } = await parseMermaidToExcalidraw(source, {
    flowchart: { curve: 'linear' },
    maxEdges: 500,
    maxTextSize: 50_000,
  });
  // Some converter versions reuse IDs for parallel arrows. Only nodes are binding targets.
  const ids = new Set<string>();
  const styles = previewStyles(svg);
  const isSequence = /^\s*sequenceDiagram\b/m.test(source);
  const edgeCounts = new Map<string, number>();
  const matchedEdges = new Set<string>();
  const geometry = new Map<string, Bounds & { points?: [number, number][]; label?: LabelLayout }>();
  const unique = skeleton.map((element, index) => {
    let id = element.id ?? `generated-${index}`;
    if (ids.has(id) && element.type !== 'arrow' && element.type !== 'line') {
      throw new Error('轉換結果包含重複節點，無法安全匯出。');
    }
    while (ids.has(id)) id += `-${index}`;
    ids.add(id);
    let edgeKey = '';
    if (element.type === 'arrow' && element.start?.id && element.end?.id) {
      const pair = `${element.start.id}_${element.end.id}`;
      const count = edgeCounts.get(pair) ?? 0;
      edgeCounts.set(pair, count + 1);
      const prefix = `L_${pair}_`;
      edgeKey = [...styles.edges.keys()].filter((key) => key.startsWith(prefix) && /^\d+$/.test(key.slice(prefix.length)))[count] ?? '';
    }
    const style = element.type === 'arrow' ? styles.edges.get(edgeKey) : styles.nodes.get(id);
    if (!isSequence && element.type === 'arrow' && (!style || matchedEdges.has(edgeKey))) {
      throw new Error('無法對應預覽中的連線，已停止匯出以避免遺失連線。');
    }
    if (style) {
      if (element.type === 'arrow') matchedEdges.add(edgeKey);
      if ('points' in style) {
        const [x, y] = style.points[0];
        geometry.set(id, { x, y,
          width: Math.max(...style.points.map(([px]) => px)) - Math.min(...style.points.map(([px]) => px)),
          height: Math.max(...style.points.map(([, py]) => py)) - Math.min(...style.points.map(([, py]) => py)),
          points: style.points.map(([px, py]) => [px - x, py - y]), label: style.label });
      } else geometry.set(id, style);
    }
    const layout = geometry.get(id);
    // System fonts keep conversion local. Match the preview's font size.
    return {
      ...element,
      ...(layout ? { x: layout.x, y: layout.y, width: layout.width, height: layout.height, ...(layout.points ? { points: layout.points } : {}) } : {}),
      id,
      roughness: 0,
      fillStyle: 'solid' as const,
      ...(style?.strokeColor ? { strokeColor: style.strokeColor } : {}),
      ...(style?.strokeWidth !== undefined ? { strokeWidth: style.strokeWidth } : {}),
      ...(style?.backgroundColor ? { backgroundColor: style.backgroundColor } : {}),
      ...(element.type === 'arrow' ? { roundness: null } : {}),
      ...(element.type === 'text' ? { fontFamily: 2 as const } : {}),
      ...('label' in element && element.label ? { label: { ...element.label, fontFamily: 2 as const,
        ...(style?.label ? { text: style.label.text, fontSize: style.label.fontSize, strokeColor: style.label.strokeColor } : {}) } } : {}),
    };
  });
  if (!isSequence && matchedEdges.size !== styles.edges.size) {
    throw new Error('轉換結果的連線數量與預覽不符，已停止匯出以避免遺失連線。');
  }
  const converted = convertToExcalidrawElements(unique, { regenerateIds: false });
  // Conversion can resize shapes and move endpoints/labels. Restore the SVG
  // coordinates after creating native elements, then bind that exact geometry.
  let routed = converted.map((element) => {
    if (element.type === 'text' && element.containerId) {
      const label = geometry.get(element.containerId)?.label;
      if (label) return { ...element, ...label, originalText: label.text, autoResize: false };
    }
    const layout = geometry.get(element.id);
    if (layout) {
      const { label: _label, ...position } = layout;
      return { ...element, ...position };
    }
    if (element.type !== 'arrow') return element;
    const original = unique.find((item) => item.id === element.id);
    if (original?.type !== 'arrow' || !original.points) return element;
    const points: [number, number][] = original.points.map(([x, y]: readonly [number, number]) => [x, y]);
    return { ...element, x: original.x ?? element.x, y: original.y ?? element.y, points,
      width: Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x)),
      height: Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y)) };
  });
  if (!isSequence) {
    // Recalculate editor bindings for the new ports. Keep our geometry: the
    // converter also nudges endpoints, which would change the preview paths.
    const bindingSkeleton: Parameters<typeof convertToExcalidrawElements>[0] = [];
    for (const element of routed) {
      if (element.type === 'arrow') bindingSkeleton.push({
        ...element,
        start: element.startBinding ? { id: element.startBinding.elementId } : undefined,
        end: element.endBinding ? { id: element.endBinding.elementId } : undefined,
      });
      else if (element.type === 'rectangle' || element.type === 'diamond' || element.type === 'ellipse') bindingSkeleton.push(element);
    }
    const rebound = convertToExcalidrawElements(bindingSkeleton, { regenerateIds: false });
    const bindings = new Map(rebound.filter((element) => element.type === 'arrow').map((element) => [element.id, element]));
    routed = routed.map((element) => {
      const binding = bindings.get(element.id);
      return element.type === 'arrow' && binding?.type === 'arrow' ? { ...element, startBinding: binding.startBinding, endBinding: binding.endBinding } : element;
    });
  }
  assertEditable(routed);
  return { elements: routed, serializeAsJSON };
}

export async function svgToPng(diagram: RenderedDiagram): Promise<Blob> {
  const width = Math.ceil(diagram.width * 2);
  const height = Math.ceil(diagram.height * 2);
  if (width > 16384 || height > 16384 || width * height > 64_000_000) {
    throw new Error('圖片超出 PNG 可匯出的大小，請改用 SVG 或縮小流程圖。');
  }
  await document.fonts.ready;
  const url = URL.createObjectURL(new Blob([diagram.svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('瀏覽器無法建立 PNG 畫布。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG 編碼失敗，請改用 SVG。')), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportDiagram(format: ExportFormat, diagram: RenderedDiagram, name: string): Promise<Blob> {
  if (format === 'svg') return new Blob([diagram.svg], { type: 'image/svg+xml;charset=utf-8' });
  if (format === 'png') return svgToPng(diagram);
  return diagramQueue.run(async () => {
    const { elements, serializeAsJSON } = await editableScene(diagram.source, diagram.svg);
    if (format === 'drawio') return new Blob([toDrawio(elements, safeFilename(name))], { type: 'application/xml;charset=utf-8' });
    const json = serializeAsJSON(elements, { viewBackgroundColor: '#ffffff' }, {}, 'local');
    return new Blob([json], { type: 'application/vnd.excalidraw+json' });
  });
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
