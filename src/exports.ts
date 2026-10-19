import { checkSource, safeFilename } from './flowchart';
import { assertEditable, toDrawio } from './drawio';
import type { RenderedDiagram } from './render';
import { diagramQueue } from './serial-queue';
import { previewStyles } from './editable-style';

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
  let edgeIndex = 0;
  const unique = skeleton.map((element, index) => {
    let id = element.id ?? `generated-${index}`;
    if (ids.has(id) && element.type !== 'arrow' && element.type !== 'line') {
      throw new Error('轉換結果包含重複節點，無法安全匯出。');
    }
    while (ids.has(id)) id += `-${index}`;
    ids.add(id);
    const style = element.type === 'arrow' ? styles.edges[edgeIndex++] : styles.nodes.get(id);
    // Use the system font so conversion never needs remote font assets.
    return {
      ...element,
      id,
      roughness: 0,
      fillStyle: 'solid' as const,
      ...(style?.strokeColor ? { strokeColor: style.strokeColor } : {}),
      ...(style?.strokeWidth !== undefined ? { strokeWidth: style.strokeWidth } : {}),
      ...(style?.backgroundColor ? { backgroundColor: style.backgroundColor } : {}),
      ...(element.type === 'arrow' ? { roundness: null } : {}),
      ...(element.type === 'text' ? { fontFamily: 2 as const } : {}),
      ...('label' in element && element.label ? { label: { ...element.label, fontFamily: 2 as const, ...(style?.labelColor ? { strokeColor: style.labelColor } : {}) } } : {}),
    };
  });
  const converted = convertToExcalidrawElements(unique, { regenerateIds: false });
  // Binding adjusts arrow endpoints. Keep Mermaid's routed polyline instead.
  const elements = converted.map((element) => {
    if (element.type !== 'arrow') return element;
    const original = unique.find((item) => item.id === element.id);
    if (original?.type !== 'arrow' || !original.points) return element;
    const points: [number, number][] = original.points.map(([x, y]: readonly [number, number]) => [x, y] as [number, number]);
    return {
      ...element,
      x: original.x ?? element.x,
      y: original.y ?? element.y,
      points,
      width: Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x)),
      height: Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y)),
    };
  });
  assertEditable(elements);
  return { elements, serializeAsJSON };
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
