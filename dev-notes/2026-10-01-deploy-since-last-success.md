---
title: Supabase の配備を「その push の差分」ではなく「最後に成功した配備からの差分」で決める——#869 と #874 の run が赤で何も出さず、#878 の緑の run は関数を 1 本も変えていないので 1 本も出さなかった。usage-count は本番に無いまま 404、#874 の _shared も未配備で、緑がそれを覆っていた。配備後に本番の関数一覧と config.toml を突き合わせ、宣言された関数が無ければ赤にする
date: 2026-10-01
---

〈依頼〉`.github/workflows/supabase-deploy.yml` が main への merge ごとに「その commit で変わった関数」だけを配備するので、赤い run の分が永久に落ちる。起点を「最後に配備が成功した commit」にし、起点は推測せず記録から読む。読めない・ancestry が切れているなら全関数。本番に無い関数は常に配備し、配備後に存在を検査する。

## 0. 測った

- `gh run list --workflow supabase-deploy.yml`（2026-10-02 取得）:
  `dec394cf` success → `680f6102`（#869）**failure** → `68141443`（#874）**failure** → `c553b0be`（#878）**success**。
- 各 commit の `supabase/` の差分（`git diff --name-status --no-renames <親> <commit>`）:
  - #869: `config.toml` M・`functions/usage-count/` A・migration A。⇒ 旧規則でも全関数が対象だったが、migration の dry run が拒まれ（時刻の逆転）「22 function(s) were NOT deployed」。
  - #874: `_shared/ai-ledger.js` M・`_shared/plans.js` A・`ai-proxy` M・migration A。⇒ 全関数が対象、同じ理由で赤。
  - #878: migration 2 本の D と A だけ。⇒ **HEAD^..HEAD の関数は 0 本**。migration は通り run は緑。
- `dec394cf..c553b0be` の差分は `config.toml` と `_shared/` を含み、**全 22 関数**が対象（`--plan` で確認）。migration の「足された」は改名後の 2 本だけ（改名前の 2 本は起点に一度も存在しない）。
- 本番の run 履歴（push・success）16 件のうち、新しい規則で走ったものは 0 件 ⇒ 次の最初の run は起点なし＝全関数（`--base-from-runs --plan` で確認）。

## 1. 決めたこと

- **起点＝この workflow の最も新しい成功した push run の `headSha`**（`gh run list --event push --status success`、`actions: read`）。配備した commit を別に書き残す仕組みは作らない——run の結論そのものが「そこまで出た」の記録で、`release-state.mjs` も受領証も配備した commit を持っていない（調べた。release-state は配備されたソースを中身で比べる計器で、commit を記録しない）。
- **workflow_dispatch の run は数えない。** drift だけの run もあり、run の一覧は inputs を持たない。数えないことは起点を古くする（出し過ぎる）向きにしか効かない。
- **前の規則の緑は信じない。** #878 の緑は「#878 までが本番にある」を意味しない。過去の run の commit の中の `scripts/supabase-deploy.mjs` が `DEPLOY_BASE_CONTRACT = 'since-last-successful-deploy'` を持つときだけ起点にする（`git show <sha>:<自分の位置>`）。持っていない緑は飛ばして古い方へ。
- **起点が HEAD の祖先でない run に当たったら全関数。** 本番はこの系譜に無い commit を走らせているので、それより古い起点からの差分はその commit が変えたものを出し直さない。
- **起点が無いときの migration。** どれを流すかを選べないので流さない。ただし `db push --dry-run` が流すものを残しているなら**赤**——緑の run は次の起点になり、残った migration は二度と差分に現れない。
- **本番に無い宣言済みの関数は差分に関係なく出す**（`supabase functions list` と `config.toml` の `[functions.*]`）。一覧が読めなければ全関数。
- **配備後の存在検査。** もう一度 `functions list` を取り、宣言された関数が 1 本でも無い・一覧が読めない ⇒ 赤。
- `functions list -o json` の読み方は `release-state.mjs` の `parseFunctionsList` に 1 つ（配列が無ければ throw——「読めなかった」を「0 本」にしない）。

## 2. 否定した見立て

- 「失敗した run を手で全関数配備すれば足りる」——今回は手で回復したが、次も誰かが気づく保証は無い。赤い run の分を次の run が拾う構造が無い限り、緑の run が欠落を覆う。
- 「workflow の `on.push.paths` に scripts を足せば」——起点の問題は triggers ではなく diff の範囲であり、効かない。

## 3. 残したこと

- 手で worktree から配備した版（merge 前）は run の記録に現れない。それを捕まえるのは nightly の drift（中身の比較）であって、この起点ではない。
- `docs/FILES.md` の `supabase-deploy.mjs` 行と `docs/architecture/15-ops-quality.md` の該当段落は「push の差分から」と述べたまま（この作業の触ってよい範囲の外。呼び出し元に報告）。

## 4. 検査

`tests/deploy-since-last-success-checks.test.mjs`: 実際の run 一覧と差分で #869→#874→#878 を再生し、旧規則では #878 で関数 0 本、新規則では起点 `dec394cf`・全関数（`usage-count`・`ai-proxy` を含む）・migration は改名後の 2 本になることを測る。赤い run・前の規則の緑・祖先でない緑・記録なしを起点にしないこと、本番に無い関数が空の差分でも出ること、読めない一覧が「0 本」にならないこと、workflow が `--base-from-runs`・`actions: read`・`GH_TOKEN`・`fetch-depth: 0` を持つことも。
