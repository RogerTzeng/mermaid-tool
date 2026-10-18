# Mermaid Studio

Mermaid 流程圖與時序圖預覽、轉檔工具。介面支援繁體中文與 English，程式碼與轉檔資料都在瀏覽器內處理，沒有後端或上傳功能。使用目前功能不需要登入其他網站或設定 API key。

[線上使用 Mermaid Studio](https://RogerTzeng.github.io/mermaid-tool/)

## 啟動

需要 Node.js 22.12 以上（建議 Node.js 24）與 npm。首次安裝需要連線至 npm；完成安裝後，開發及正式版本不依賴 CDN。

```bash
git clone https://github.com/RogerTzeng/mermaid-tool.git
cd mermaid-tool
npm ci
npm run dev
```

開啟終端機印出的本機網址，預設為 http://127.0.0.1:5173 。停止伺服器時按 Ctrl+C。

```bash
npm test             # 轉換、輸入檢查與佇列的單元測試
npm run typecheck
npm run build        # 型別檢查 + 產生 dist/
npm run preview      # 預覽正式版本
```

瀏覽器整合測試需另外安裝 Chromium（首次下載需要網路；Linux 也可能需要安裝瀏覽器系統相依套件）：

```bash
npx playwright install chromium
npm run test:browser
```

## 使用方式

頁首可切換繁體中文／English；瀏覽器會記住語言選擇。切換僅影響介面與提示，不會改動圖表程式碼。

1. 貼上 Mermaid 程式碼、匯入 `.mmd`／`.mermaid` 檔案，或載入內建範例。
2. 停止輸入約 400 毫秒後更新預覽；可用滾輪以游標為中心縮放、按住滑鼠左鍵拖移，或按「符合視窗」重設位置與比例。
3. 輸入檔名並選擇下載格式。

| 格式 | 用途 |
| --- | --- |
| PNG | 白色背景、兩倍解析度的圖片 |
| SVG | 保留 Mermaid 預覽的向量圖片 |
| draw.io | 未壓縮 XML `.drawio`；原生節點、文字、群組與連線 |
| Excalidraw | `.excalidraw` 場景；原生圖形、文字、群組與綁定箭頭 |

draw.io：在 diagrams.net 或桌面版使用「檔案 → 開啟」，選擇 `.drawio`。Excalidraw：使用「開啟」或將 `.excalidraw` 拖入編輯器。兩者的文字及節點可繼續編輯，不需透過圖片拆解。

## 支援與限制

- 支援 `flowchart`／`graph`（TD、TB、BT、LR、RL）及 `sequenceDiagram` 時序圖。
- 時序圖支援預覽及四種格式匯出；內建「多代理時序圖」範例包含 participant 別名、autonumber、自我呼叫與巢狀 loop／alt／else。可編輯格式的外觀與布局可能不同於 Mermaid 預覽。
- 可編輯匯出以矩形、圓角矩形、圓形、菱形、標籤、一般連線及 subgraph 為核心；特殊形狀依官方轉換器能力簡化為基本形狀。
- 圖片保留 Mermaid 外觀；可編輯匯出保留結構及大致布局，字型、線條、Markdown 與部分樣式可能不同。編輯檔採系統字型，沒有遠端字型需求。
- 遇到圖片元素、無效座標或遺失的綁定目標時，會阻止可編輯匯出並顯示原因。
- 語法錯誤或預覽更新期間停用下載；匯出期間若修改程式碼，舊結果不會下載。
- 原始碼限制為 50,000 字元；流程圖設定最多 500 條連線。PNG 單邊上限為 16,384 像素，總面積上限為 64,000,000 像素，超出時請改用 SVG。
- 不支援 init／YAML 設定、互動 click 指令、外部圖片、圖示、雲端儲存、反向匯入編輯檔或將圖形修改回寫成 Mermaid。
- 以桌面版 Chrome／Edge 為主要環境；重新整理會清除當次輸入，請自行保存原始碼。

## 技術與品質

使用 React、TypeScript、Vite 與 Mermaid，所有圖表處理皆在瀏覽器內完成。

已通過單元測試、瀏覽器整合測試與正式建置，並完成 draw.io、Excalidraw 匯出檔的開檔驗收。
