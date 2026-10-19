import { useEffect, useRef, useState } from 'react';
import { translate, type Language } from './language';
import { examples } from './examples';
import { download, exportDiagram, type ExportFormat } from './exports';
import { MAX_SOURCE_LENGTH, messageOf, safeFilename } from './flowchart';
import { renderDiagram, type RenderedDiagram } from './render';

const formats: { id: ExportFormat; label: string; detail: string }[] = [
  { id: 'png', label: 'PNG', detail: '圖片 · 白底 2×' },
  { id: 'svg', label: 'SVG', detail: '向量 · 自由縮放' },
  { id: 'drawio', label: 'draw.io', detail: '節點與連線可編輯' },
  { id: 'excalidraw', label: 'Excalidraw', detail: '節點與連線可編輯' },
];

export function App() {
  const [language, setLanguage] = useState<Language>(() => {
    try { return localStorage.getItem('mermaid-language') === 'en' ? 'en' : 'zh-TW'; }
    catch { return 'zh-TW'; }
  });
  const t = (text: string) => translate(text, language);
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem('mermaid-language', language); } catch { /* Storage may be disabled. */ }
  }, [language]);
  const [source, setSource] = useState<string>(examples.basic.code);
  const [diagram, setDiagram] = useState<RenderedDiagram>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(true);
  const [filename, setFilename] = useState('mermaid-diagram');
  const [exporting, setExporting] = useState<ExportFormat>();
  const [notice, setNotice] = useState('');
  const [fileError, setFileError] = useState('');
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number; center: { x: number; y: number }; pan: { x: number; y: number } } | undefined>(undefined);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [svgUrl, setSvgUrl] = useState('');
  const sourceRef = useRef(source);
  const revision = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);

  function updateSource(value: string) {
    if (value === sourceRef.current) return;
    sourceRef.current = value;
    revision.current++;
    setSource(value);
    setDiagram(undefined);
    setError('');
    setNotice('');
    setFileError('');
    setPending(Boolean(value.trim()));
  }

  useEffect(() => {
    let cancelled = false;
    const currentRevision = revision.current;
    const isCurrent = () => !cancelled && currentRevision === revision.current;
    setDiagram(undefined);
    setError('');
    if (!source.trim()) { setPending(false); return; }
    setPending(true);
    const timer = window.setTimeout(() => {
      void renderDiagram(source, isCurrent).then((result) => {
        if (!isCurrent() || !result) return;
        setDiagram(result);
        setZoom('fit');
        setPan({ x: 0, y: 0 });
        setPending(false);
      }).catch((reason: unknown) => {
        if (!isCurrent()) return;
        setError(messageOf(reason));
        setPending(false);
      });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [source]);

  useEffect(() => {
    if (!diagram) { setSvgUrl(''); return; }
    const url = URL.createObjectURL(new Blob([diagram.svg], { type: 'image/svg+xml' }));
    setSvgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [diagram]);

  useEffect(() => {
    const node = preview.current!;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fitScale = diagram ? Math.max(0.01, Math.min((viewport.width - 64) / diagram.width, (viewport.height - 64) / diagram.height, 1)) : 1;
  const scale = zoom === 'fit' ? fitScale : zoom;
  const ready = Boolean(diagram && diagram.source === source && !pending && !error);

  useEffect(() => {
    const node = preview.current!;
    function wheel(event: WheelEvent) {
      if (!ready) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1);
      const nextScale = Math.max(Math.min(0.1, fitScale), Math.min(4, scale * Math.exp(-delta * 0.002)));
      const rect = node.getBoundingClientRect();
      const x = event.clientX - rect.left - node.clientWidth / 2;
      const y = event.clientY - rect.top - node.clientHeight / 2;
      const ratio = nextScale / scale;
      setPan((current) => ({ x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio }));
      setZoom(nextScale);
    }
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [ready, scale, fitScale]);

  function endPointer(id: number) {
    pointers.current.delete(id);
    pinch.current = undefined;
    if (!pointers.current.size) setDragging(false);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const currentRevision = revision.current;
    try {
      if (!/\.(mmd|mermaid)$/i.test(file.name)) throw new Error('請選擇 .mmd 或 .mermaid 文字檔。');
      if (file.size > MAX_SOURCE_LENGTH * 4) throw new Error('檔案太大，請選擇 50,000 字元以內的流程圖。');
      const text = (await file.text()).replace(/^\uFEFF/, '');
      if (revision.current !== currentRevision) return;
      if (text.length > MAX_SOURCE_LENGTH) throw new Error('檔案超過 50,000 字元。');
      updateSource(text);
      setFilename(file.name.replace(/\.(mmd|mermaid)$/i, ''));
      setFileError('');
    } catch (reason) {
      setFileError(messageOf(reason));
    }
  }

  async function save(format: ExportFormat) {
    if (!ready || !diagram || exporting) return;
    const currentRevision = revision.current;
    const name = safeFilename(filename);
    setExporting(format);
    setNotice('');
    try {
      const blob = await exportDiagram(format, diagram, name);
      if (revision.current !== currentRevision) {
        setNotice('程式碼已更新，請等待預覽完成後重新匯出。');
        return;
      }
      download(blob, `${name}.${format}`);
      setNotice(`已下載 ${name}.${format}`);
    } catch (reason) {
      if (revision.current === currentRevision) setNotice(`匯出失敗：${messageOf(reason)}`);
    } finally {
      setExporting(undefined);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand"><span className="brand-symbol" aria-hidden="true">🧜‍♀️</span><div><h1>Mermaid Studio</h1><p>{t("把程式碼，變成清楚的流程。")}</p></div></div>
        <span className="local-badge"><span />{t("本機處理 · 無需上傳")}</span>
        <label className="language-switch"><span>{language === 'en' ? 'Language' : '語言'}</span><select aria-label="Language / 語言" value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="zh-TW">繁體中文</option><option value="en">English</option></select></label>
      </header>

      <main>
        <div className="workspace-heading"><div><span className="eyebrow">DIAGRAM WORKSPACE</span><h2>{t("從想法到流程圖")}</h2></div><p>{t("編輯、預覽，然後帶到你習慣的工具。")}</p></div>
        <div className="workspace">
          <section className="editor-panel" aria-labelledby="editor-heading">
            <div className="panel-header"><h3 id="editor-heading"><span className="panel-number">01</span>{t("Mermaid 程式碼")}</h3><button className="text-button" onClick={() => fileInput.current?.click()}>{t("↥ 匯入檔案")}</button></div>
            <input ref={fileInput} type="file" accept=".mmd,.mermaid" hidden onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} />
            <div className="example-bar"><label htmlFor="example">{t("載入範例")}</label><select id="example" defaultValue="" onChange={(event) => { const key = event.target.value as keyof typeof examples; if (key) updateSource(examples[key].code); event.target.value = ''; }}><option value="" disabled>{t("選擇一個流程圖")}</option>{Object.entries(examples).map(([key, example]) => <option key={key} value={key}>{t(example.name)}</option>)}</select></div>
            <div className="code-editor"><div className="editor-gutter" ref={gutter} aria-hidden="true">{source.split('\n').map((_, index) => <div key={index}>{index + 1}</div>)}</div><textarea aria-label={t("Mermaid 程式碼")} value={source} onChange={(event) => updateSource(event.target.value)} onScroll={(event) => { if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop; }} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" placeholder={language === 'en' ? 'flowchart TD\n    A[Start] --> B[Done]' : 'flowchart TD\n    A[開始] --> B[完成]'} /></div>
            <div className="editor-footer"><span>flowchart / graph / sequenceDiagram</span><span>{source.length.toLocaleString()} {t("字元")}</span></div>
            {fileError && <div className="error-box" role="alert">{t(fileError)}</div>}
            {error && <div className="error-box" role="alert"><strong>{t("請檢查程式碼")}</strong><pre>{t(error)}</pre></div>}
          </section>

          <section className="preview-panel" aria-labelledby="preview-heading">
            <div className="panel-header"><h3 id="preview-heading"><span className="panel-number">02</span>{t("即時預覽")}</h3><span className={`render-status ${ready ? 'success' : ''}`} role="status">{pending ? t("更新中…") : error ? t("需要修正") : ready ? t("● 已更新") : t("等待輸入")}</span></div>
            <div className={`preview-viewport ${ready ? 'interactive' : ''} ${dragging ? 'dragging' : ''}`} ref={preview} aria-busy={pending}
              title={ready ? t("滾輪或雙指縮放・拖移圖表") : undefined}
              onPointerDown={(event) => {
                if (!ready || event.button !== 0 || pointers.current.size >= 2) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (pointers.current.size === 2) {
                  const [first, second] = [...pointers.current.values()];
                  const rect = event.currentTarget.getBoundingClientRect();
                  pinch.current = {
                    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
                    scale,
                    center: { x: (first.x + second.x) / 2 - rect.left - rect.width / 2, y: (first.y + second.y) / 2 - rect.top - rect.height / 2 },
                    pan,
                  };
                }
                setDragging(true);
              }}
              onPointerMove={(event) => {
                const previous = pointers.current.get(event.pointerId);
                if (!previous) return;
                const dx = event.clientX - previous.x;
                const dy = event.clientY - previous.y;
                pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (pinch.current && pointers.current.size === 2) {
                  const [first, second] = [...pointers.current.values()];
                  const rect = event.currentTarget.getBoundingClientRect();
                  const center = { x: (first.x + second.x) / 2 - rect.left - rect.width / 2, y: (first.y + second.y) / 2 - rect.top - rect.height / 2 };
                  const nextScale = Math.max(Math.min(0.1, fitScale), Math.min(4, pinch.current.scale * Math.hypot(second.x - first.x, second.y - first.y) / pinch.current.distance));
                  const ratio = nextScale / pinch.current.scale;
                  setPan({ x: center.x - (pinch.current.center.x - pinch.current.pan.x) * ratio, y: center.y - (pinch.current.center.y - pinch.current.pan.y) * ratio });
                  setZoom(nextScale);
                } else setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
              }}
              onPointerUp={(event) => {
                endPointer(event.pointerId);
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={(event) => endPointer(event.pointerId)}
              onLostPointerCapture={(event) => endPointer(event.pointerId)}
            >
              {ready && diagram && svgUrl ? <div className="diagram-stage" style={{ width: diagram.width * scale, height: diagram.height * scale, transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)` }}><img alt={t("Mermaid 流程圖預覽")} src={svgUrl} draggable={false} width={diagram.width * scale} height={diagram.height * scale} /></div> : <div className="empty-preview"><span aria-hidden="true">{pending ? '◌' : '⌘'}</span><h4>{pending ? t("正在繪製流程圖") : error ? t("修正程式碼後，圖表會出現在這裡") : t("你的下一張流程圖，從這裡開始")}</h4><p>{pending ? t("稍等一下，讓節點找到自己的位置。") : t("貼上 Mermaid 程式碼，或從左側載入範例。")}</p></div>}
            </div>
            <div className="preview-footer"><span>{diagram && ready ? `${Math.ceil(diagram.width)} × ${Math.ceil(diagram.height)}` : t("向量預覽")}</span><div className="zoom-controls"><button aria-label={t("縮小")} disabled={!ready} onClick={() => setZoom(Math.max(0.1, Math.round((scale - 0.1) * 100) / 100))}>−</button><output aria-label={t("縮放比例")}>{Math.round(scale * 100)}%</output><button aria-label={t("放大")} disabled={!ready} onClick={() => setZoom(Math.min(4, Math.round((scale + 0.1) * 100) / 100))}>＋</button><button disabled={!ready} onClick={() => { setZoom('fit'); setPan({ x: 0, y: 0 }); }}>{t("符合視窗")}</button></div></div>
          </section>
        </div>

        <section className="export-panel" aria-labelledby="export-heading">
          <div className="export-title"><h3 id="export-heading"><span className="panel-number">03</span>{t("帶走你的流程圖")}</h3><p>{t("圖片用於分享，可編輯檔案用於接續創作。")}</p><label className="filename-label">{t("檔案名稱")}<input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="mermaid-diagram" /></label></div>
          <div className="format-grid">{formats.map((format) => <button className={`format-button format-${format.id}`} key={format.id} disabled={!ready || Boolean(exporting)} onClick={() => void save(format.id)}><span className="format-icon" aria-hidden="true">{format.id === 'png' ? '▧' : format.id === 'svg' ? '◇' : format.id === 'drawio' ? '⊞' : '✎'}</span><span><strong>{exporting === format.id ? t("匯出中…") : format.label}</strong><small>{t(format.detail)}</small></span><span className="download-icon" aria-hidden="true">↓</span></button>)}</div>
          <p className="export-notice" role="status">{notice ? t(notice) : t("可編輯匯出保留結構與大致布局，特殊形狀與部分樣式可能簡化。")}</p>
        </section>
        <footer className="app-footer"><span>{t("專注流程，讓思路保持清晰。")}</span><span>{t("流程圖與時序圖 · PNG / SVG / draw.io / Excalidraw")}</span></footer>
      </main>
    </div>
  );
}
