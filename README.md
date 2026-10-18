<div align="center">

# Mermaid Studio

### 把 Mermaid 程式碼，變成能分享、能繼續編輯的圖表。

即時預覽 · 滑鼠縮放與拖移 · 四種格式匯出 · 繁體中文 / English

**[🚀 立即線上使用](https://rogertzeng.github.io/mermaid-tool/)** · [快速上手](#快速上手) · [本機執行](#本機執行)

無須註冊 · 無須 API key · 圖表在瀏覽器內處理

</div>

---

寫好流程，只是第一步。**Mermaid Studio** 讓你一邊編寫、一邊預覽，再依需求下載圖片，或匯出到 **draw.io / Excalidraw** 繼續調整文字、節點與連線。

適合整理系統流程、撰寫技術文件，以及呈現服務互動或多代理協作的時序。

## ✨ 你可以做什麼

| 功能 | 使用體驗 |
| --- | --- |
| ⚡ 即時預覽 | 貼上 Mermaid 程式碼，停止輸入後自動更新圖表 |
| 🖱️ 自由查看 | 滾輪以游標為中心縮放、滑鼠左鍵拖移，一鍵符合視窗 |
| 🧩 接著編輯 | 匯出 draw.io、Excalidraw，保留可編輯的圖形與文字 |
| 🖼️ 分享圖表 | 下載 PNG 或 SVG，放進簡報、文件與專案說明 |
| 🌐 雙語介面 | 切換繁體中文 / English，瀏覽器會記住你的選擇 |
| 🔒 瀏覽器內處理 | 不會將圖表程式碼與轉檔資料上傳至後端 |

## 🚀 快速上手

1. **[開啟 Mermaid Studio](https://rogertzeng.github.io/mermaid-tool/)**。
2. 貼上 Mermaid 程式碼、匯入 `.mmd` / `.mermaid` 檔案，或選擇內建範例。
3. 用滾輪縮放、按住滑鼠左鍵拖移，確認圖表內容。
4. 輸入檔名，選擇需要的格式下載。

> 想先試試看？內建「審核流程」、「分組與服務」、「多行與分支」與「多代理時序圖」範例，可以直接載入體驗。

## 📦 一張圖，四種用法

| 格式 | 適合用途 | 匯出內容 |
| --- | --- | --- |
| **PNG** | 簡報、訊息分享 | 白色背景、兩倍解析度圖片 |
| **SVG** | 文件、縮放檢視 | 保留 Mermaid 預覽外觀的向量圖片 |
| **draw.io** | 調整布局、協作製圖 | 可編輯的 `.drawio` 節點、文字、群組與連線 |
| **Excalidraw** | 視覺討論、延伸構圖 | 可編輯的 `.excalidraw` 圖形、文字與箭頭 |

**繼續編輯：** 在 draw.io / diagrams.net 選擇「檔案 → 開啟」；在 Excalidraw 使用「開啟」，或直接拖入匯出檔。

> 可編輯格式保留結構與大致布局，字型、線條與部分樣式可能和 Mermaid 預覽不同。若需要保留預覽外觀，請選 PNG 或 SVG。

## 📝 支援的圖表

- **流程圖**：`flowchart` / `graph`，支援 TD、TB、BT、LR、RL 方向，以及分支、連線與 subgraph。
- **時序圖**：`sequenceDiagram`，支援 participant 別名、自動編號、自我呼叫，以及巢狀 `loop` / `alt` / `else`。

兩種圖表皆支援預覽與四種格式匯出。特殊形狀可能依轉換器能力簡化為基本形狀。

## 💻 本機執行

需要 **Node.js 22.12 以上**（建議 Node.js 24）與 npm。

```bash
git clone https://github.com/RogerTzeng/mermaid-tool.git
cd mermaid-tool
npm ci
npm run dev
```

開啟終端機顯示的網址，預設為 `http://127.0.0.1:5173`。按 `Ctrl+C` 停止伺服器。

首次安裝需要網路；完成安裝後，本機開發及正式版本不依賴 CDN。推送至 `main` 時，GitHub Actions 會自動建置並更新 GitHub Pages 網站。

<details>
<summary>開發指令</summary>

```bash
npm test                # 單元測試
npm run typecheck       # 型別檢查
npm run build           # 建置正式版本至 dist/
npm run preview         # 預覽正式版本
```

瀏覽器整合測試：

```bash
npx playwright install chromium
npm run test:browser
```

首次下載 Chromium 需要網路；Linux 可能需要另外安裝瀏覽器系統相依套件。

</details>

## 📌 使用提醒

- **記得保存原始碼**：重新整理會清除當次輸入；目前沒有雲端儲存。
- 以桌面版 Chrome / Edge 為主要使用環境。
- 原始碼上限為 50,000 字元，流程圖最多 500 條連線。PNG 單邊上限為 16,384 像素、總面積上限為 64,000,000 像素；大型圖表可改用 SVG。
- 不支援 init / YAML 設定、互動 click 指令、外部圖片與圖示，或將編輯檔反向匯入並轉回 Mermaid。
- 語法錯誤或預覽更新期間會暫停下載；無法安全轉換的可編輯匯出會顯示原因。

---

使用 **React · TypeScript · Vite · Mermaid** 建置。已通過單元測試、瀏覽器整合測試與正式建置，並完成 draw.io、Excalidraw 匯出檔的開檔驗收。
