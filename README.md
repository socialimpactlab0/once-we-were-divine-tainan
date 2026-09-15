# 《再次成為神》台南特映：報名與第一方流量追蹤

活動：2026/9/20（日）13:30 放映、13:00 入場，台南市勞工育樂中心。主辦／發行：雄獅影視。特映價 150 元／人（原價 250 元），現場付款。

[活動網站](https://socialimpactlab0.github.io/once-we-were-divine-tainan/) · [Google Sheet](https://docs.google.com/spreadsheets/d/18DyodHHYqps75aoWll0oHSwmx4oes4lCYlfmIoLNoxQ/edit#gid=326938945)

## 啟用狀態

本次提供網站追蹤程式、GAS 後端、表單與分析儀表板程式。**GitHub 更新並不會自動更新 Apps Script。請完成下方既有 GAS 部署，以及桌機、手機的實際寫入驗收，才算啟用完成。**

目前的程式測試使用模擬試算表，不能取代正式 Google Sheet 的驗收。舊報名資料缺少的廣告來源無法事後還原。

## 一次部署

1. 從本活動 Google Sheet 選「擴充功能 → Apps Script」，進入原本的綁定專案。先留存原始程式版本。
2. 用 [gas/Code.gs](gas/Code.gs) 完整取代原本的「程式碼.gs」或 Code.gs 內容；同一專案不要同時保留兩份相同函式。
3. 新增指令碼檔案 `Tracking`，貼上 [gas/Tracking.gs](gas/Tracking.gs)。
4. 用 [gas/Booking.html](gas/Booking.html) 完整取代原本的 Booking.html。檔名須為 Booking。
5. 確認專案使用 V8、時區 Asia/Taipei。沒有自訂授權範圍的專案可保留原本 appsscript.json；本資料夾亦附最小相容版本。若原專案有明訂 oauthScopes，需另涵蓋試算表及管理觸發器所需權限。
6. 儲存，在上方函式選單選 **setupTracking**（沒有底線），由擁有者執行並完成 Google 授權。這會保留原名單／活動設定、補齊欄位、建立每分鐘更新觸發器。可重跑，不會清除名單。
7. 選「部署 → 管理部署」，編輯**目前使用的網頁應用程式**，版本改「新增版本」。執行身分為自己，存取權須允許訪客使用。保留原 `/exec` 網址，既有 QR Code 無需更換。
8. 重新整理活動網站，依下一節驗收。GAS 只儲存程式碼而沒有更新部署，訪客仍會讀到舊版。

`setupTracking`、`updateTrafficDashboard`、`cleanupTrackingTest` 僅允許管理者在綁定專案／試算表操作；匿名網頁呼叫不能執行管理動作。`refreshAnalytics_` 為排程函式。

## 手機與桌機驗收

每個裝置使用獨立測試代碼。例如：

[桌機測試網址](https://socialimpactlab0.github.io/once-we-were-divine-tainan/?utm_source=facebook&utm_medium=paid_social&utm_campaign=0920_divine_tainan_qa&utm_content=poster_a&utm_term=qa_desktop&test_run_id=qa_0920_desktop)

[手機測試網址](https://socialimpactlab0.github.io/once-we-were-divine-tainan/?utm_source=instagram&utm_medium=paid_social&utm_campaign=0920_divine_tainan_qa&utm_content=poster_b&utm_term=qa_mobile&test_run_id=qa_0920_mobile)

1. 用尚未測試過的瀏覽器工作階段開啟網址，確認「流量紀錄」有 `page_view`。
2. 重新整理，確認同一 session 的 `page_view` 仍只有一筆。
3. 點「立即報名」，確認 `registration_click`。
4. 第一次填寫姓名等欄位，確認 `form_start`。
5. 使用主辦單位控制且未報名過的測試電話、姓名「驗收測試」，送出一位報名。確認畫面「報名成功」，名單新增一列，流量新增 `registration_success`。
6. 核對兩張表的 `visitor_id`、`session_id`、`record_id` 與 UTM 一致。匿名流量不得出現測試姓名／電話。
7. 等待排程，或在編輯器執行 `updateTrafficDashboard`。測試日範圍內四個漏斗各增加一個工作階段，裝置、素材、受眾、來源表可找到測試資料。
8. 手機與桌機各完成一次。請記錄實際驗收結果，不要把程式測試當成已送出正式測試。
9. 待資料全部確認後，**先關閉測試頁面**，在試算表「特映會報名 → 清除指定測試」或編輯器執行 `cleanupTrackingTest`，分別輸入 `qa_0920_desktop`、`qa_0920_mobile`。只刪除這個代碼的測試報名與流量。再確認分析數字還原。
10. 測試瀏覽器正式使用前，清除本網站儲存空間，或改用新的無痕工作階段，避免未送完的測試佇列再次送出。不要刪除其他人的正式資料。

開發者可在活動網站主框架 Console 檢查 `DivineTracking.status`：`backendReady: true` 表示新版表單已建立通訊，`pending: 0` 表示目前匿名佇列已獲後端確認；仍須核對 Sheet。原版 GAS 不支援此通訊時，網站會保留原報名流程並暫存匿名事件，不能據此宣稱流量已寫入。

## 固定 UTM 命名

| 欄位 | 本場約定 |
| --- | --- |
| utm_source | facebook / instagram；混合版位可用 Meta 動態來源 |
| utm_medium | paid_social |
| utm_campaign | 0920_divine_tainan |
| utm_content | poster_a、poster_b、video_a；每個素材不同 |
| utm_term | audience_a、audience_b；在投放表記錄各自受眾設定 |
| campaign_id / adset_id / ad_id | Meta 原始識別碼，用於活動、廣告組合、廣告對照 |

不要把姓名、電話、Email 或敏感受眾描述放進 UTM。用中性代碼對照廣告組合設定；本系統不推測個人的宗教信仰或健康狀況。

單一 Facebook 素材的完整網址範例：

```text
https://socialimpactlab0.github.io/once-we-were-divine-tainan/?utm_source=facebook&utm_medium=paid_social&utm_campaign=0920_divine_tainan&utm_content=poster_a&utm_term=audience_a
```

混合 Facebook／Instagram 版位時，在 Meta 廣告層級「網址參數」貼上以下內容；目的地網站欄位填原始活動網址，避免重複填同名參數：

```text
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign=0920_divine_tainan&utm_content=poster_a&utm_term=audience_a&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}
```

每換素材修改 `utm_content`，每換受眾修改 `utm_term`。系統將 `fb`／`ig` 正規化為 facebook／instagram。正式廣告點擊後要確認參數已換成實值，未替換的預覽參數不能作正式驗收。[Meta 網址參數說明](https://www.facebook.com/business/help/1016122818401732)、[動態參數規格](https://en-gb.facebook.com/business/help/2360940870872492)。

本場廣告設計的目的地是自有網站。建立「潛在顧客」活動時，從一開始選網站轉換位置；瀏覽器附加元件選無。若帳號介面要求尚未完成的 Meta 資料集／網站事件設定，先完成該設定或使用合適的網站流量投放方式，不能把即時表單當成這套網站漏斗。這份程式尚未安裝 Pixel，Google Sheet 的完成報名不會自動回傳 Meta；未來加入 Pixel／網站完成報名事件也須保留本套追蹤。

## 欄位與計算方式

- 「報名名單」保留原 A:N 欄位，O:AF 新增職業、record_id、visitor_id、session_id、UTM、廣告識別碼、入口網址、來源網站、裝置、user agent、test_run_id。record_id 與原報名編號相同，僅供後台串接，訪客不需保留。
- 「流量紀錄」逐筆記錄四類事件；前端三類事件按 visitor_id + session_id + event_name 去重，成功事件依 record_id 去重。這是漏斗紀錄，重新整理不會增加同一工作階段的進站列。
- 「流量分析」B3／D3 可填 `今天` 或 `YYYY-MM-DD`。漏斗依進站日與工作階段去重，另列匿名訪客數、實際報名筆數、有效報名人數；四者不可混用。跨日報名歸於原進站日，實際報名筆數則依報名日。
- 報名點擊率＝點報名／進站；開始填表率＝點過報名且開始填表／點報名；表單完成率＝開始填表且完成／開始填表；整體報名率＝完成報名工作階段／進站。直接捲至表單填寫者不會被捏造報名點擊。
- 素材、活動、廣告組合、來源、裝置表皆列出各階段人次與整體報名率；沒有廣告費資料，所以此處不能計算每筆成本或 ROAS。
- visitor_id 保存在 localStorage；session_id 保存在 sessionStorage，重新進站且閒置超過 30 分鐘或更換素材來源時建立新工作階段。來源採最後非直接來源，保留 7 天，直接回訪不覆蓋尚未過期的廣告來源。
- 瀏覽器、無痕模式、不同裝置或清除儲存空間會產生不同訪客；無法當成跨裝置真實人數。不同 UTM 被轉傳也會延用來源標籤。沒帶 UTM 時，fbclid 單獨只能標為 meta_unknown，不能可靠區分 FB／IG。
- page_url 移除非追蹤參數與 hash；referrer 僅存來源網域，不記錄表單內容。正式報名會把匿名識別碼與自願提供的報名資料關聯；告知文案已放在網站及表單。

## 寫入與維護

前端有本機待送佇列與重試，GAS iframe 的 `google.script.run` 回覆才作為匿名事件已接收的確認；`sendBeacon` 僅用於離站盡力送達，不能把送出成功當成 Sheet 已寫入。報名使用請求碼與鎖避免重送；先寫入並 flush 報名列，再記錄成功事件。若後者暫時失敗，每分鐘分析工作會依已保存的正式列補寫，不能生成沒有報名的成功事件。

每分鐘觸發器受 Google 的排程與執行配額影響，不保證精確到秒。前端被封鎖、網路一直離線或離站前沒有送達，仍可能漏記；此系統不是防詐欺或機器人辨識工具。活動結束可在 Apps Script 觸發器頁停用 `refreshAnalytics_`，需要時手動更新。

這個公開網站只含程式，不應上傳報名試算表匯出檔、個資或憑證。試算表共享權限請維持主辦管理者使用。

## 程式檢查

在此專案根目錄執行：

```sh
node tests/tracking.test.cjs
```

測試涵蓋匿名 ID、來源保留、裝置判斷、去重、報名重送、成功事件補寫、管理函式存取與模板語法。這些為模擬服務測試，實際部署仍須執行前述手機／桌機流程。
