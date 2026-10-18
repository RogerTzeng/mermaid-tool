import mermaid from 'mermaid';
import { checkSource } from './flowchart';
import { diagramQueue } from './serial-queue';

let sequence = 0;

export interface RenderedDiagram {
  source: string;
  svg: string;
  width: number;
  height: number;
}

export function renderDiagram(source: string, isCurrent: () => boolean): Promise<RenderedDiagram | undefined> {
  return diagramQueue.run(async () => {
    if (!isCurrent()) return;
    checkSource(source);
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'default',
      htmlLabels: false,
      fontFamily: 'Arial, "Noto Sans TC", sans-serif',
      maxTextSize: 50_000,
      maxEdges: 500,
      flowchart: { curve: 'linear', useMaxWidth: false },
      suppressErrorRendering: true,
    });
    const host = document.createElement('div');
    host.className = 'render-host';
    host.setAttribute('aria-hidden', 'true');
    document.body.append(host);
    try {
      const { svg } = await mermaid.render(`mermaid-preview-${++sequence}`, source, host);
      if (!isCurrent()) return;
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const root = doc.documentElement;
      if (doc.querySelector('parsererror') || root.localName !== 'svg') throw new Error('無法產生有效的 SVG 預覽。');
      const [, , width, height] = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
      if (!(width > 0 && height > 0)) throw new Error('流程圖的圖片尺寸無效。');
      root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      root.setAttribute('width', String(width));
      root.setAttribute('height', String(height));
      root.removeAttribute('style');
      return { source, svg: new XMLSerializer().serializeToString(root), width, height };
    } finally {
      host.remove();
    }
  });
}
