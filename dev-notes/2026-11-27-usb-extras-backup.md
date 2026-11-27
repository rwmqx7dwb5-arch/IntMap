---
title: USB の extras\ — メモリ・設定・暗号化した資格情報と DB ダンプ・Supabase 秘密の名前
date: 2026-11-27
---

利用者の依頼（原本以外にも USB に控えておく 4 つ）。`scripts/backup-usb.ps1` のミラーは追跡ツリーだけで、メモリ・認証情報・DB は復元できなかった。

## 変えたこと

- `scripts/backup-extras.ps1`（新）: USB の `extras\` に メモリ（平文・秘密の形に当たるファイルは除外）／Claude・Codex の設定（`~/.codex/auth.json` は決して写さない）／`CLAUDE.local.md` の暗号化（gpg 対称 AES-256）／本番 DB の `pg_dump`（暗号化・3 世代）／Supabase 秘密の**名前だけ**／`MANIFEST.json`。
- パスフレーズは利用者のもの: 隠し入力（2 回）か `-PassphraseFromStdin` の 1 行。引数・ファイル・出力には出ない。尋ねる手段が無い（標準入力がリダイレクト）ときは暗号化の手順を skip して理由を述べ、`RESULT partial` で終わる。平文では置かない。
- `backup-usb.ps1`: ミラーが USB の余分を消す 3 つの歩き（削除・検証・空ディレクトリ掃除）が `extras` を飛ばす（`$NotMirrored`）。追跡対象に `extras/` があれば拒否。
- 検査 `tests/usb-extras-backup-checks.test.mjs`、復号手順は `docs/BACKUP-RESTORE.md` Layer 3。

## 実測と、できなかったこと

- 暗号は gpg 2.4.9（Git for Windows 同梱。PowerShell の PATH には無いので既知の場所を探す）。`-SelfTest` でダミーの暗号化→復号が一致。
- このマシンには `pg_dump` が無く Docker も止まっていて、`SUPABASE_ACCESS_TOKEN` も環境に無いので、**DB ダンプは実行できていない**（スクリプトは skip して理由を述べる）。必要な手作業は `scoop install postgresql` と、トークンを入れたうえでの本人のパスフレーズ入力。
- `supabase secrets list -o json` は値のダイジェストも返す。スクリプトは `name` だけを取り出す。
