# TriAspect Cards

紅、綠、藍三色的網頁卡牌對戰遊戲，規則版本 v1.0.2。目前可以和電腦 AI 對戰；線上兩人對戰開發中。

## 直接遊玩

打開 `index.html` 就能玩，不需要安裝任何東西。開啟 GitHub Pages（Settings → Pages → Deploy from branch → `main` / root）後，網址是：

https://xianyi117.github.io/TriAspect-Cards/

## 專案結構

| 路徑 | 內容 |
| --- | --- |
| `index.html` | 組好的遊戲，單一檔案即可遊玩（由 `tools/build.py` 產生，不要手動改） |
| `src/engine.js` | 規則引擎與電腦 AI，和畫面無關 |
| `src/ui.js` | 對戰畫面、牌組選擇、自組牌組 |
| `src/template.html` | 版面與樣式 |
| `data/卡牌圖鑑_v1.0.2.xlsx` | 卡表原始檔 |
| `data/cards.json` | 由卡表轉出的卡牌資料 |
| `assets/card-back.jpg` | 卡背 |
| `tools/` | 轉檔、組裝、模擬對戰的小工具 |

## 更新卡牌或程式

```bash
pip install openpyxl
python3 tools/xlsx_to_json.py "data/卡牌圖鑑_v1.0.2.xlsx"   # 卡表改了才需要
python3 tools/build.py                                       # 重新產生 index.html
node tools/simulate.js 400                                   # 電腦對電腦跑 400 局，檢查錯誤與勝率
```

卡牌效果由 `src/engine.js` 的 `parseOp` 依文字辨識。新增卡牌時沿用現有寫法（例如「魔法/紅1+灰1：敵方單位攻擊力-2」）就不用改程式；模擬工具會列出無法辨識的效果。

## 規則重點

- 牌組 20 張，同編號不重複，費用 3 的角色最多 3 張。主角生命 6。
- 每回合：同時抽 2 張 → 同時蓋牌召喚並翻開 → 先攻行動、後攻干擾 → 後攻行動、先攻干擾 → 結算。
- 發動效果的能量從手牌支付，橫置在消耗區，回合結束進入棄牌堆。
- 生命牌歸 0 敗北，雙方同時歸 0 平手。

遊戲內右上角「規則」有完整的實作規則說明。
