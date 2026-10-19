import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { examples } from '../../src/examples';

async function getDownload(page: Page, format: string): Promise<Buffer> {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: new RegExp(`^${format}`) }).click();
  const file = await waiting;
  return readFile((await file.path())!);
}

test('renders locally and exports images and editable files', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url());
  });
  await page.goto('/');
  const preview = page.getByRole('img', { name: 'Mermaid 流程圖預覽' });
  await expect(preview).toBeVisible();
  const svg = await getDownload(page, 'SVG');
  const source = svg.toString();
  const size = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('invalid SVG');
    return { width: Number(doc.documentElement.getAttribute('width')), height: Number(doc.documentElement.getAttribute('height')) };
  }, source);
  expect(source).toContain('提交申請');
  expect(source).not.toContain('<foreignObject');
  const png = await getDownload(page, 'PNG');
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBe(Math.ceil(size.width * 2));
  expect(png.readUInt32BE(20)).toBe(Math.ceil(size.height * 2));
  const pixel = await page.evaluate(async (bytes) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return [...context.getImageData(0, 0, 1, 1).data];
  }, [...png]);
  expect(pixel).toEqual([255, 255, 255, 255]);

  const drawio = (await getDownload(page, 'draw.io')).toString();
  const structure = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const cells = [...doc.querySelectorAll('mxCell')];
    const ids = new Set(cells.map((cell) => cell.id));
    return {
      valid: !doc.querySelector('parsererror'),
      unique: ids.size === cells.length,
      vertices: cells.filter((cell) => cell.getAttribute('vertex') === '1').length,
      edges: cells.filter((cell) => cell.getAttribute('edge') === '1').length,
      bound: cells.filter((cell) => cell.getAttribute('edge') === '1').every((cell) => ids.has(cell.getAttribute('source')!) && ids.has(cell.getAttribute('target')!)),
    };
  }, drawio);
  expect(structure).toEqual({ valid: true, unique: true, vertices: 6, edges: 6, bound: true });
  const scene = JSON.parse((await getDownload(page, 'Excalidraw')).toString());
  expect(scene.type).toBe('excalidraw');
  expect(scene.elements.some((element: { type: string }) => element.type === 'image')).toBe(false);
  const arrows = scene.elements.filter((element: { type: string }) => element.type === 'arrow');
  expect(arrows).toHaveLength(6);
  for (const arrow of arrows) {
    expect(arrow.startBinding?.elementId).toBeTruthy();
    expect(arrow.endBinding?.elementId).toBeTruthy();
  }
  expect(external).toEqual([]);
});

test('invalid and empty input disable downloads; only the latest edit is shown', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Mermaid 程式碼' });
  const svgButton = page.getByRole('button', { name: /^SVG/ });
  await expect(svgButton).toBeEnabled();
  await editor.fill('flowchart TD\nA[broken');
  await expect(svgButton).toBeDisabled();
  await expect(page.getByRole('alert')).toBeVisible();
  await editor.fill('classDiagram\nclass User');
  await expect(page.getByRole('alert')).toContainText('支援 flowchart');
  await editor.fill('');
  await expect(page.getByText('你的下一張流程圖，從這裡開始')).toBeVisible();
  await expect(svgButton).toBeDisabled();
  await editor.fill('flowchart TD\nA[舊內容] --> B[舊結果]');
  await editor.fill('flowchart LR\nA[最新內容] --> B[最新結果]');
  await expect(svgButton).toBeEnabled();
  const svg = (await getDownload(page, 'SVG')).toString();
  expect(svg).toContain('最新結果');
  expect(svg).not.toContain('舊結果');
  await page.getByRole('button', { name: '放大', exact: true }).click();
  await page.getByRole('button', { name: '符合視窗', exact: true }).click();
});

test('imports text files and exports nested groups and parallel edges', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: '服務圖.mmd', mimeType: 'text/plain', buffer: Buffer.from(examples.groups.code) });
  await expect(page.getByRole('textbox', { name: '檔案名稱' })).toHaveValue('服務圖');
  await expect(page.getByRole('button', { name: /^draw.io/ })).toBeEnabled();
  const nested = (await getDownload(page, 'draw.io')).toString();
  expect(nested).toContain('style="group;');
  expect(nested).toContain('獨立節點');
  await page.getByRole('textbox', { name: 'Mermaid 程式碼' }).fill('flowchart LR\nA[甲] -->|一| B[乙]\nA -->|二| B\nB --> B');
  await expect(page.getByRole('button', { name: /^Excalidraw/ })).toBeEnabled();
  const scene = JSON.parse((await getDownload(page, 'Excalidraw')).toString());
  const ids = scene.elements.map((element: { id: string }) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(scene.elements.filter((element: { type: string }) => element.type === 'arrow')).toHaveLength(3);
});

test('zooms around the cursor, drags the preview, and resets to fit', async ({ page }) => {
  await page.goto('/');
  const image = page.getByRole('img', { name: 'Mermaid 流程圖預覽' });
  await expect(image).toBeVisible();
  const viewport = page.locator('.preview-viewport');
  const bounds = (await viewport.boundingBox())!;
  const original = (await image.boundingBox())!;
  const anchor = { x: bounds.x + bounds.width * 0.6, y: bounds.y + bounds.height * 0.4 };
  const relative = { x: (anchor.x - original.x) / original.width, y: (anchor.y - original.y) / original.height };
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(original.width);
  const enlarged = (await image.boundingBox())!;
  expect(enlarged.x + relative.x * enlarged.width).toBeCloseTo(anchor.x, 0);
  expect(enlarged.y + relative.y * enlarged.height).toBeCloseTo(anchor.y, 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await page.mouse.down();
  await page.mouse.move(anchor.x + 60, anchor.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await image.boundingBox())!.x).toBeCloseTo(enlarged.x + 60, 0);
  expect((await image.boundingBox())!.y).toBeCloseTo(enlarged.y + 40, 0);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await image.boundingBox())!.width).toBeLessThan(enlarged.width);
  await page.getByRole('button', { name: '符合視窗', exact: true }).click();
  const reset = (await image.boundingBox())!;
  expect(reset.x).toBeCloseTo(original.x, 0);
  const resetViewport = (await viewport.boundingBox())!;
  expect(reset.y - resetViewport.y).toBeCloseTo(original.y - bounds.y, 0);
  expect(reset.width).toBeCloseTo(original.width, 0);
});

test('switches languages without changing the diagram and remembers the selection', async ({ page }) => {
  await page.goto('/');
  const language = page.getByRole('combobox', { name: 'Language / 語言' });
  const original = await page.getByRole('textbox', { name: 'Mermaid 程式碼' }).inputValue();
  await expect(page.getByRole('img', { name: 'Mermaid 流程圖預覽' })).toBeVisible();
  await language.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'From ideas to flowcharts' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Mermaid code' })).toHaveValue(original);
  await expect(page.getByRole('img', { name: 'Mermaid flowchart preview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fit to view', exact: true })).toBeEnabled();
  await getDownload(page, 'SVG');
  await expect(page.getByText('Downloaded mermaid-diagram.svg', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Mermaid code' }).fill('classDiagram\nclass User');
  await expect(page.getByRole('alert')).toContainText('Use a flowchart / graph declaration or sequenceDiagram.');
  await language.selectOption('zh-TW');
  await expect(page.getByRole('alert')).toContainText('支援 flowchart');
  await language.selectOption('en');
  await page.reload();
  await expect(language).toHaveValue('en');
  await expect(page.getByRole('heading', { name: 'From ideas to flowcharts' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(language).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await language.selectOption('zh-TW');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.getByRole('heading', { name: '從想法到流程圖' })).toBeVisible();
});

test('previews and exports the multi-agent sequence diagram in all formats', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url());
  });
  await page.goto('/');
  await page.getByLabel('載入範例').selectOption('sequence');
  await expect(page.getByRole('button', { name: /^SVG/ })).toBeEnabled();
  const svg = (await getDownload(page, 'SVG')).toString();
  for (const text of ['User', 'NeMo Evaluator', 'Each proposed delegation', 'Authorized', 'Rejected', 'Generate task plan', 'Final response']) expect(svg).toContain(text);
  expect(svg).not.toContain('<foreignObject');
  expect(svg).toContain('sequenceNumber');
  const png = await getDownload(page, 'PNG');
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const drawio = (await getDownload(page, 'draw.io')).toString();
  expect(drawio).toContain('Final response');
  expect(drawio).toContain('Each proposed delegation');
  const scene = JSON.parse((await getDownload(page, 'Excalidraw')).toString());
  expect(scene.elements.length).toBeGreaterThan(50);
  expect(scene.elements.some((element: { type: string }) => element.type === 'image')).toBe(false);
  expect(scene.elements.some((element: { text?: string }) => element.text?.includes('Final response'))).toBe(true);
  expect(external).toEqual([]);
});

test('editable exports retain class colors, link styles and routed endpoints', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Mermaid 程式碼' }).fill(`flowchart TD
    A[Start] -->|yes| B{Choice}
    B --> C[Accept]
    B --> D[Reject]
    D --> A
    classDef green fill:#dcfce7,stroke:#15803d,color:#14532d
    class A,C green
    style B fill:#fef3c7,stroke:#b45309,color:#78350f
    linkStyle 0 stroke:#e11d48,stroke-width:3px`);
  await expect(page.getByRole('button', { name: /^Excalidraw/ })).toBeEnabled();
  const scene = JSON.parse((await getDownload(page, 'Excalidraw')).toString());
  const start = scene.elements.find((e: { id: string }) => e.id === 'A');
  expect(start.backgroundColor).toBe('#dcfce7');
  expect(start.strokeColor).toBe('#15803d');
  expect(start.fillStyle).toBe('solid');
  const text = scene.elements.find((e: { containerId: string }) => e.containerId === 'A');
  expect(text.strokeColor).toBe('#14532d');
  const arrows = scene.elements.filter((e: { type: string }) => e.type === 'arrow');
  expect(arrows[0].strokeColor).toBe('#e11d48');
  expect(arrows[0].strokeWidth).toBe(3);
  expect(arrows.every((e: { roughness: number; roundness: unknown }) => e.roughness === 0 && e.roundness === null)).toBe(true);
  expect(arrows.some((e: { points: unknown[] }) => e.points.length > 2)).toBe(true);
  const drawio = (await getDownload(page, 'draw.io')).toString();
  for (const style of ['fillColor=#dcfce7', 'strokeColor=#15803d', 'fontColor=#14532d', 'strokeColor=#e11d48', 'exitX=', 'entryX=', 'exitPerimeter=0']) {
    expect(drawio).toContain(style);
  }
});

test('guardrail architecture routes editable connectors around nodes', async ({ page }) => {
  await page.goto('/');
  const source = await readFile('tests/fixtures/guardrails.mmd', 'utf8');
  await page.getByRole('textbox', { name: 'Mermaid 程式碼' }).fill(source);
  await expect(page.getByRole('button', { name: /^Excalidraw/ })).toBeEnabled();
  const scene = JSON.parse((await getDownload(page, 'Excalidraw')).toString());
  const nodes = scene.elements.filter((e: { type: string }) => ['rectangle', 'diamond', 'ellipse'].includes(e.type));
  const arrows = scene.elements.filter((e: { type: string }) => e.type === 'arrow');
  expect(nodes).toHaveLength(17);
  expect(arrows).toHaveLength(28);
  for (const edge of arrows) {
    const points = edge.points.map(([x, y]: number[]) => [edge.x + x, edge.y + y]);
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      expect(a[0] === b[0] || a[1] === b[1], `${edge.id} must be orthogonal`).toBe(true);
      for (const node of nodes) {
        if ([edge.startBinding?.elementId, edge.endBinding?.elementId].includes(node.id)) continue;
        const crosses = a[0] === b[0]
          ? a[0] > node.x + 0.01 && a[0] < node.x + node.width - 0.01 && Math.max(a[1], b[1]) > node.y + 0.01 && Math.min(a[1], b[1]) < node.y + node.height - 0.01
          : a[1] > node.y + 0.01 && a[1] < node.y + node.height - 0.01 && Math.max(a[0], b[0]) > node.x + 0.01 && Math.min(a[0], b[0]) < node.x + node.width - 0.01;
        expect(crosses, `${edge.id} crosses ${node.id}`).toBe(false);
      }
    }
  }
  const drawio = (await getDownload(page, 'draw.io')).toString();
  expect((drawio.match(/edge="1"/g) ?? [])).toHaveLength(28);
  expect(drawio).toContain('exitPerimeter=0');
  const paths = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    return [...doc.querySelectorAll('mxCell[edge="1"]')].map((edge) => {
      const geometry = edge.querySelector('mxGeometry')!;
      const point = (p: Element) => [Number(p.getAttribute('x')), Number(p.getAttribute('y'))];
      return [point(geometry.querySelector('[as="sourcePoint"]')!), ...[...geometry.querySelectorAll('Array mxPoint')].map(point), point(geometry.querySelector('[as="targetPoint"]')!)];
    });
  }, drawio);
  expect(paths).toEqual(arrows.map((edge: { x: number; y: number; points: number[][] }) => edge.points.map(([x, y]) => [Math.round((edge.x + x) * 1000) / 1000, Math.round((edge.y + y) * 1000) / 1000])));
});
