# IntMap — 航空データ源 (Aviation data sources)

> **どの provider から、どんな条件で、何が取れるか。** ここが航空データの**出典と契約の正本**。
> 実装の構造は [`AVIATION-ARCHITECTURE.md`](AVIATION-ARCHITECTURE.md)、
> レイヤーの挙動は [`MAP-LAYERS.md`](MAP-LAYERS.md)、
> 鍵と信頼境界は [`SECURITY-ARCHITECTURE.md`](SECURITY-ARCHITECTURE.md) §5。
>
> ⚠ **表の数字は実測値である。** 「だいたい」で書かれた行は1つも無い。測り直したら値と日付を差し替える。

---

## 0. なぜこの文書があるか

航空データは「無料で全球が取れる」分野**ではない**。にもかかわらず、以前の実装は
`api.airplanes.live` を**ブラウザから利用者ごとに最大128回**叩いて全球を再構成しようとしていた。
上流負荷が利用者数に比例する構造で、結果は次のとおり:

```
GET https://api.airplanes.live/v2/point/50.040/8.570/250
→ HTTP 403   (Cloudflare, Access-Control-Allow-Origin なし)
```

**全リクエストが 403。** CORS ヘッダが無いのでブラウザ側では `net::ERR_FAILED` になり、
`if(!r.ok)` は一度も評価されない。掃引は全滅し、`genSyntheticPlanes()` が
**実在しない 270 機**を描いていた（本番実測。ICAO24 の 38/38 が `6TEB8M` のように
16進数ですらなく、登録記号・機種・スコークは 38/38 が空、昇降率は 38/38 がちょうど 0）。

だからこの文書の第一の仕事は、**「どの経路が実際に許されていて、何を返すか」を測って書き留めること**。

---

## 1. 採用している経路（2026-08-23 実測）

| 用途 | provider | ライセンス | 鍵 | 状態 |
|---|---|---|---|---|
| **位置（既定）** | [adsb.lol](https://www.adsb.lol/) | **ODbL 1.0** | 不要 | 稼働 |
| **位置（全球・要契約）** | [The OpenSky Network](https://opensky-network.org/) | ToU：**運用利用には事前の書面合意が必要** | OAuth2 | アダプタ完成・既定では無効 |
| 位置（旧） | airplanes.live | — | 不要 | **403（全リクエスト）** ・既定で無効 |
| 空港・滑走路 | [OurAirports](https://ourairports.com/) | public domain | 不要 | 稼働（`js/map-extras.js`） |
| 機体写真 | [Planespotters](https://www.planespotters.net/) | 各写真家 | 不要 | 稼働（`js/aircraft-detail.js`） |

### 1.1 adsb.lol —— 既定

- 文書化された上限は **250 nm**（`/v2/point/{lat}/{lon}/{radius}`）。それ以上の半径も応答するが、
  **文書化されていない挙動に依存しない**。
- **全機を返すエンドポイントは無い。** 全球のものは `/v2/mil`・`/v2/ladd`・`/v2/pia`・
  `/v2/sqk/{squawk}`・`/v2/type/{t}` で、いずれも「全部」ではない。
- ⚠ **User-Agent が必須。** 一般的な UA には
  `User-Agent too generic; include valid contact info.` を返す。IntMap は
  `IntMap/aviation-feed (+https://github.com/rwmqx7dwb5-arch/IntMap)` を送る。
- ⚠ **バースト予算はおよそ4リクエスト**（1アドレスあたり）。実測:

  | リクエスト間隔 | 成功 | 429 |
  |---|---|---|
  | 2000 ms | 4/10 | 6 |
  | 1500 ms | 4/10 | 6 |
  | 1000 ms | 4/10 | 6 |

  **間隔を空けても成功数が動かない**＝毎秒あたりの上限ではなく、ゆっくり回復する
  **バーストの持ち分**。45 秒空けた単発は毎回成功する。
  ⇒ **980 タイルの全球格子はこの provider では到達できない。** viewport には十分、world には不足。

- 1タイル（250 nm・ロンドン付近）の実測: **94 機 / 53 kB / 1.37 s**。
  4タイルの合併で **689 機**（うち位置 689・高度 689・登録記号 674・便名 667）。

### 1.2 OpenSky —— 全球を1リクエストで

- `/states/all` の実測: **6,838 機 / 900 kB / 2.7 s**（匿名）。位置あり 6,759・便名あり 6,677。
- クレジット制で、`/states/all` は**1回 4 クレジット**:

  | 区分 | 1日のクレジット | 全球の回数 | 実効間隔 |
  |---|---|---|---|
  | 匿名 | 400 | 100 | 約 14.4 分 |
  | 登録済み | 4,000 | 1,000 | 約 86 秒 |
  | feeder（月30%以上） | 8,000 | 2,000 | 約 43 秒 |
  | ライセンス | 14,400 / **時** | 3,600 / 時 | **約 1 秒** |

- ⚠⚠ **運用利用には事前の書面合意が必要。** 利用規約は「製品・サービス・自動化システムへの
  組み込みを含むあらゆる運用上の利用には、事前の書面による合意が必要」と定めており、
  これは**非営利であっても**同じ。営利主体は用途を問わず書面ライセンスが要る。
  ⇒ IntMap では `OPENSKY_AGREEMENT=1` という**別のフラグ**で明示的に有効化する。
  資格情報を持っていることと、それで運用してよいことは別の事実だから、鍵の有無では代用しない。
- 州ベクトルに**軍用フラグは無い**（`PROVIDER_FIELDS.opensky.military = false`）。
  UI は「この provider は報告しない」と「民間であると確認された」を**別のものとして**扱う。

### 1.3 検討して採用しなかったもの

| 候補 | 理由 |
|---|---|
| ADS-B Exchange Enterprise | 商用契約が必要（RapidAPI の基本枠は $10/月・10,000 リクエスト）。全球ストリームは個別見積り |
| FlightAware Firehose | 月額は個別見積り。**常時接続ストリーム**なので Edge Function では受けられず、常時稼働コンテナが要る（`AGENTS.md` §5.2） |
| FlightAware AeroAPI | $0.002/クエリ〜。便情報には有力だが、全球位置の主経路には量課金が合わない |
| Flightradar24 API | 商用契約が必要 |
| adsb.lol `re-api` | **network 全体を無加工で**返すが、**feeder のみ**・IP 許可制。IntMap は feeder ではない |
| adsb.lol `/api/0/routeset` | 便の出発地・目的地の解決器。**実測で 201 と空ボディを返し、機能していない** |
| 非公開の地図エンドポイント | **スクレイピングしない**（`AGENTS.md` の禁止事項） |

---

## 2. 取れないもの（＝推定と明記するもの）

**無料の経路で取れない**ことが確認できたもの:

- 定刻出発・定刻到着（scheduled）
- 実出発時刻・実到着時刻（actual）
- 遅延・欠航・diversion
- 正式な飛行計画（airway / waypoint）

⇒ `js/aviation-model.js` の `PROVIDER_FIELDS` は、どの provider についても
`route:false` / `schedule:false` を宣言している。`tests/r341-checks.test.mjs ⑧` が
**全 provider について**それを検査するので、将来 provider を足しても
「持っていない情報を持っているふりをする」ことはできない。

無い情報を推定で埋める場合は、**推定であることを表示に出す**こと（指示書 §15.3）。
現時点の実装は**推定を1つも作っていない**——無いものは無いままにしてある。

---

## 3. 出典表記の義務

- **adsb.lol は ODbL 1.0。** データベースの再配布には**出典表記が要る**。
  `aviation-feed` は `x-intmap-attribution` ヘッダで名前を運び、ツールチップの脚注が
  それを表示する（`js/data-layers.js` の `_planeSourceLine()`）。
  ⚠ **provider の名前を焼き込まないこと。** 以前の実装は `airplanes.live · ADS-B` を
  リテラルで書いており、**合成データの下にもそれが出ていた**。出典を間違えて名乗るのは、
  名乗らないより悪い。
- OurAirports は public domain、Planespotters は各写真家のクレジットを写真と一緒に出す。

---

## 4. 変えるときの手順

1. `js/aviation-model.js` に正規化関数と `PROVIDER_FIELDS` の行を足す（**正本**。
   `supabase/functions/_shared/` の写しは `node scripts/sync-aviation.mjs` が作る）。
2. `supabase/functions/aviation-feed/index.ts` の `TILE_BASE` / `ATTRIBUTION` /
   `providerName()` に足す。鍵が要るなら**環境変数だけ**から読む。
3. **この文書の §1 の表に、実測値と実測日を書いて足す。**
4. 利用規約・ライセンス・出典表記を `js/locales/pages.*.js`（9言語）に反映する。
5. `tests/r341-checks.test.mjs` に正規化の検査を足す。
