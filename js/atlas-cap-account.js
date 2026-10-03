/* ============================================================================
 *  IntMap · Atlas capabilities — the `account.*` namespace   (js/atlas-cap-account.js)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place:
 *    row     its registry row (its columns are documented at «THE TABLE» in js/atlas-capabilities.js) — the id, the dispatch
 *            spelling, the aliases, the observer, the effects that are also its conflict keys …
 *    schema  its argument schema, built fresh on every call (the builders are in js/atlas-caps.js)
 *    run     what the dispatch runs for it: `run(a, dctx, K)` — the action, the execution context, and
 *            K, the Atlas kernel's internals it needs (js/atlas-console.js builds K; a `let` there is
 *            read and written as `K.name`, so the value is always the live one).
 *  The registry rows (copied into js/atlas-capabilities.js), the dispatch and the schema table are
 *  DERIVED from these entries — `node scripts/atlas-caps.mjs --write` rewrites what is generated after
 *  an entry is added or removed, and `npm run check:capabilities` fails while they disagree.
 *
 *  (account-data-center) What the reader's ACCOUNT holds, answered by the database: the inventory
 *  (public.account_data_inventory) and the full copy (public.export_account_data). Both are the same
 *  doors the account sheet uses (js/account-data.js), so Atlas and the UI cannot disagree about what
 *  «your data» is. Neither ever reads another account: the database decides the account from the
 *  verified session, and no argument here can name one.
 * ==========================================================================*/
import { noArgs } from './atlas-caps.js';
import { IntMapLang } from './lang-registry.js';

/* the reader is not signed in: only the reader can fix that, so it is input, not a failure to retry */
const SIGN_IN = { code: 'SIGN_IN_REQUIRED', category: 'input', retryable: false, userGoalSatisfied: false, produced: [] };

export default [
  {
    row: ['account.data',               'myData',         'accountData,dataInventory,whatDoYouKnowAboutMe,privacyInventory', 'account', 'none', '', 'explanation', 'read', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 160, text: '{"type":"myData"} = WHAT INTMAP HOLDS ABOUT THE SIGNED-IN READER — reads the account\'s own data inventory from the database: every kind of personal data the account has rows in (profile, synced settings, saved articles and events, community posts/comments/votes, feedback, AI usage, saved places …), how many records of each, why it is kept and for how long, and whether the reader wrote it or IntMap recorded it. Use for 「私のデータは何が保存されている？」「アカウントに何が残ってる？」「個人データの一覧」, "what data do you have about me?", "what does my account store?". To hand the reader the full copy use myDataExport; ' },
    ],
    schema: () => (noArgs('myData')),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to see what your account holds.', 'アカウントが保持しているデータを見るにはログインしてください。')), { meta: SIGN_IN });
      const M = await import('./account-data.js');
      const inv = await M.readInventory(HOST.DB);
      if (!inv.ok) return R(false, warn(esc(M.failureText(inv.error, lang))), inv.error === 'sign_in' ? { meta: SIGN_IN } : null);
      const v = M.inventoryView(inv.rows, lang);
      const line = (i) => '<div style="font-size:12px;line-height:1.6;"><b>' + esc(i.label) + '</b> · ' + i.rows + (i.purpose ? ' — ' + esc(i.purpose) : '') + (i.retention ? ' <span style="opacity:.75;">(' + esc(T('kept: ', '保持: ') + i.retention) + ')</span>' : '') + '</div>';
      let h = '<div style="font-weight:600;margin:2px 0 6px;">' + esc(T('Your data — ' + v.total + ' records', 'あなたのデータ — ' + v.total + ' 件')) + '</div>';
      if (v.you.length) h += '<div style="font-size:11px;font-weight:600;opacity:.7;margin:6px 0 2px;">' + esc(T('What you created', 'あなたが作ったもの')) + '</div>' + v.you.map(line).join('');
      if (v.intmap.length) h += '<div style="font-size:11px;font-weight:600;opacity:.7;margin:6px 0 2px;">' + esc(T('What IntMap recorded about your use', 'IntMap が利用について記録したもの')) + '</div>' + v.intmap.map(line).join('');
      if (v.none.length) h += note(esc(T('None held: ', '保持なし: ') + v.none.map((i) => i.label).join(' · ')));
      h += note(esc(T('This is the same set that deleting the account removes. A full copy can be downloaded from Account ▸ Your data.', 'アカウントを削除すると消えるものと同じ範囲です。完全なコピーは「アカウント ▸ あなたのデータ」からダウンロードできます。')));
      return R(true, h);
    },
  },
  {
    row: ['account.export',             'myDataExport',   'exportMyData,downloadMyData,dataExport,dataPortability', 'account', 'none', '', 'explanation', 'read', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 170, text: '{"type":"myDataExport"} = DOWNLOAD A COMPLETE COPY OF THE SIGNED-IN READER\'S ACCOUNT DATA as one JSON file (every record of every kind the account holds, with what each kind is) — data portability. Use for 「自分のデータを書き出して」「アカウントのデータをダウンロード」「個人データのエクスポート」, "export my data", "download everything you have about me". The file is saved on the reader\'s own device; nothing is sent anywhere else; ' },
    ],
    schema: () => (noArgs('myDataExport')),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
      if (!HOST.user) return R(false, warn(T('Sign in to download your data.', 'データをダウンロードするにはログインしてください。')), { meta: SIGN_IN });
      const M = await import('./account-data.js');
      const r = await M.downloadAccountData(HOST.DB);
      if (!r.ok) return R(false, warn(esc(M.failureText(r.error, lang))), r.error === 'sign_in' ? { meta: SIGN_IN } : null);
      return R(true, note(esc(T('Downloaded ' + r.filename + ' — ' + r.total + ' records from ' + r.tables + ' kinds of data.', r.filename + ' をダウンロードしました（' + r.tables + ' 種類・' + r.total + ' 件）。'))));
    },
  },
];
