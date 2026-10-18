export const MAX_SOURCE_LENGTH = 50_000;

export function checkSource(source: string): void {
  if (!source.trim()) throw new Error('貼上 Mermaid 流程圖程式碼，或載入一個範例。');
  if (source.length > MAX_SOURCE_LENGTH) throw new Error('程式碼超過 50,000 字元，請縮小流程圖。');
  // Configuration directives can override renderer settings. Keep v1 deterministic and local.
  if (/%%\s*\{/.test(source) || /^\s*---/m.test(source)) {
    throw new Error('第一版不支援 init 指令或 YAML 設定區塊，請保留流程圖程式碼。');
  }
  const first = source.split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('%%'));
  if (!first || !(/^(flowchart|graph)\s+(TD|TB|BT|LR|RL)\b/.test(first) || /^sequenceDiagram\s*(?:;|$)/.test(first))) {
    throw new Error('支援 flowchart／graph 流程圖與 sequenceDiagram 時序圖，請以對應宣告開頭。');
  }
  if (/^\s*click\s/m.test(source) || /@\{[^}]*\b(img|icon)\s*:/s.test(source) || /<\s*(img|image|iframe|script)\b/i.test(source)) {
    throw new Error('第一版不支援互動指令、外部圖片或圖示，請改用一般文字節點。');
  }
}

export function safeFilename(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 100) || 'mermaid-diagram';
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
