# IntMap — 現状仕様書 §13 触ってよい部分 / 慎重に触るべき部分

> **現状仕様書の §13。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §13.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 13. 触ってよい部分 / 慎重に触るべき部分

**比較的安全（加算的に拡張しやすい）**

- 辞書の追加（`geo_pins`、クライアントの追加辞書、サーバー側の埋め込み辞書）。
- データレイヤーの追加。宣言 `js/layers/<id>.js` を 1 本足し、実装はレイヤー・パッケージ `js/layer-pkg-<pkg>.js`
  （宣言の `pkg` が名指す・既存の 3 本に倣う）に書く——`js/data-layers.js` に分岐を足さない（行数・`window.*` への
  代入数・名前で切り替える行は下がるだけで、`check:static` の `layer-packages` 規則が拒む）。出典は `DATA_SOURCES` に追記する。
- i18n 文言、ウィジェット、設定項目の追加。
- Atlas の能力の追加。`js/atlas-cap-<名前空間>.js` に**項目を 1 つ**足し、説明文はその項目の `doc` に書く
  （既存のブロックに入るなら `{ in, at, text }` だけ）。続けて `node scripts/atlas-caps.mjs --write`。手順は §2 の
  Capability Registry。

**慎重に（壊れやすい中核）**

- `reorganizeLayerPanel()` / `_refreshActiveLayers()` / レイヤーパネルの DOM 順序とスクロール補正。
- レイヤーの宣言 `js/layers/<id>.js` と棚 `js/layers/_shelves.js`、そこから一覧を導く `js/layer-manifest.js`、それを読む `js/layer-rows.js`。
- レイヤー・パッケージの継ぎ目——`js/data-layers.js` の `packageKit()`（パッケージに渡す物の一覧）と `_pkgSwitch`
  （届く前の切替を順に再生する）。kit に物を足すときは写さず同じ物を渡し、作り直される束縛は `live` の getter にする。
- チェックボックスの決定論的トグル（`#layer-dropdown` の pointerdown/click ハンドラ）。
- `applyTheme()` / `_reassertBase()` / `styledata` の自己修復まわり。
- 投影・3D・compare の同期。Isolate のマスク順序。
- ai-proxy / refresh-news の鍵・上限・再利用ロジック。
- Atlas のカタログ: `js/atlas-catalog-text.js` のチャンクの順と見出し、項目の `doc` 断片の `at`——組み立てた本文が
  そのまま planner へ渡る（順も 1 バイトも回答品質に効く）。断片を言い換えない。項目の外に能力 ID の表を作らない
  （方針・事後条件・チップ・回答の族・監査の台帳は項目の欄。登録表の `GENERATED` の間は生成物）。
- `js/geo-engine.js` の契約（アダプタにだけメソッドを足さない。足すなら `types/geo-engine.d.ts` にも
  宣言する——`npm run check:types` が両エンジンを突き合わせる）。
