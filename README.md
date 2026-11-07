# 全時間工作重點回報

全時間工作者每週在 LINE 填寫工作重點回報，送出後以本人名義在群組貼出回報圖卡；管理員建立回報項目、每週一鍵在群組貼提醒，並看彙整、趨勢、匯出 Excel／PDF。

沿用「LINE簡易活動登記建立平台」的做法：LINE LIFF＋Google Apps Script＋Google 試算表＋GitHub Pages，IN CHRIST 配色。全部免費，不用官方帳號。

- 網站：https://isaiahovercomer.github.io/fulltime-weekly-report/
- 預覽（範例資料）：`?demo`（首頁）、`?demo=admin`（管理員項目頁）、`?demo=report`（填寫）、`?demo=first`（第一次填）、`?demo=done`（送出後）；加 `&notour` 跳過教學

## 運作方式

1. 管理員建立「回報項目」：期間、提醒時間（預設週日 20:00）、截止時間（週一 12:00）、回報欄位
2. 到了提醒時間，系統寄 Email 給管理員；點信裡的連結，按「發提醒到群組」，選群組
3. 群組裡的人點提醒卡的「填寫回報」，填好送出 → 自動以本人名義在群組貼出回報圖卡
4. 管理員在平台看每週已交／未交、合計、依專區／校園彙整、趨勢、每個人的紀錄，匯出 Excel 或列印成 PDF

回報週次：一週＝週一～週日。週六、週日打開預設填本週，週一到週五打開預設填上一週，也可以自己切換週次（補交會標示「逾期」）。

## 回報欄位

| 類型 | 說明 |
|---|---|
| 記住的資料 | 例如專區、校園。填一次就記住，下週自動帶入，可隨時修改 |
| 數字 | 例如青少年家聚會數，統計時加總 |
| 名單 | 預設幾格（填的人可再加），可設複選代號，例如 A追求/B禱告/C出訪；名單上顯示「甘樂與A」 |
| 文字 | 例如本週重點（選填） |
| 照片 | 最多 4 張，第一張會放在群組圖卡上方 |

可以「帶入上週的名單」，陪排成員不用每週重打。

## 檔案

- `index.html`：前端（單一檔案）。**由 `build/build.sh` 產生**，請改 `build/app.js`、`build/extra.css`，再執行 `build/build.sh`
- `Code.gs`：Apps Script 後端
- `manifest.webmanifest`、`sw.js`、`icons/`、`img/`：安裝到手機桌面（PWA）

## 試算表工作表

- `項目`：項目代碼、名稱、說明、開始週、結束週、提醒星期（0＝週日、1＝週一、6＝週六）、提醒時間、截止時間、欄位（JSON）、色調、開放…
- `名單`：LINE userId、姓名、LINE名稱、記住的資料（JSON）
- `項目成員`：回報過一次就加入；未交名單以這裡為準
- `回報`：回報時間、項目代碼、週次、姓名、內容（可讀文字）、資料（JSON）、逾期、修改時間
- `管理員`：A 欄 LINE userId；C 欄 Email（收提醒信，留白就寄給試算表擁有者）
- `登入`（隱藏）：平台通行證，60 天

## 第一次設定

1. **LINE**：在 LINE Developers 的 LINE Login channel 新增 LIFF：Size Full、Endpoint `https://isaiahovercomer.github.io/fulltime-weekly-report/`、scopes 勾 openid、profile、chat_message.write（要在網頁上實際點勾並按 Update）、開啟 Share target picker
2. **Google**：新建試算表「全時間工作重點回報」→ 擴充功能 → Apps Script，貼上 `Code.gs`，填 `CONFIG.LIFF_ID` → 執行 `setup()`（授權：試算表、雲端硬碟、寄信、排程）→ 部署為網頁應用程式（執行身分：我；存取權：所有人）
3. 把 LIFF ID 和 Apps Script 網址填到 `build/app.js` 最上面兩行，執行 `build/build.sh`，推上 GitHub
4. 從 LINE 打開 `https://liff.line.me/<LIFF ID>` 登入一次，到試算表「登入」工作表複製自己的 userId，貼到「管理員」A 欄
5. 可以在 Apps Script 執行 `testRemindMail()` 測試提醒信

## 更新

- 前端：改 `build/` → `build/build.sh` → push，GitHub Pages 自動部署
- 後端：Apps Script 換成新的 `Code.gs` → 有新工作表或欄位時執行 `setup()` → 部署 → 管理部署作業 → 鉛筆 → 建立新版本
- 新功能要在教學加一步（`since: 新版本`）並把 `TOUR_VERSION` 加 1
