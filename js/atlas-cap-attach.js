/* ============================================================================
 *  IntMap · Atlas capabilities — the `attach.*` namespace   (js/atlas-cap-attach.js)
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
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
 * ==========================================================================*/
import { str, int } from './atlas-caps.js';
import { ATTACH_LOG } from './atlas-file-view.js';
import { ATL_FILE } from './atlas-attach.js';

function recallTextWindow(rec, offset, queued, limits = ATL_FILE.LIMITS) {
  const remaining = limits.textTotal - queued.reduce((n, f) => n + f.text.length, 0);
  const max = Math.min(limits.textPerFile, remaining);
  const wrapper = ATTACH_LOG.wrap(rec, '');
  const prefix = wrapper ? wrapper.indexOf('\n') + 1 : 0;
  const page = ATTACH_LOG.page(rec, offset, Math.max(1, max - wrapper.length));
  if (!page.text || queued.length >= limits.files || max <= wrapper.length) {
    return { offset: page.offset, next: page.offset, total: page.total, more: page.offset < page.total };
  }
  queued.push({
    name: String(rec.name || 'file'), text: ATTACH_LOG.wrap(rec, page.text), truncated: page.more,
    window: { offset: page.offset, length: page.text.length, total: page.total, prefix },
  });
  return { offset: page.offset, next: page.next, total: page.total, more: page.more, queued: true };
}

export function turnTextFiles(recalled, automatic, limits = ATL_FILE.LIMITS) {
  const files = recalled.slice();
  let used = files.reduce((n, f) => n + f.text.length, 0);
  for (const f of automatic) {
    if (files.length >= limits.files || used >= limits.textTotal) break;
    const text = f.text.slice(0, Math.min(limits.textPerFile, limits.textTotal - used));
    if (!text || (f.window && text.length < f.text.length)) continue;
    files.push({ ...f, text, truncated: f.truncated || text.length < f.text.length });
    used += text.length;
  }
  return files;
}

export function turnAttachmentImages(frames, recalled, current = []) {
  const namedFrames = (frames || []).map((dataUrl, index) => ({ dataUrl, name: 'view frame ' + (index + 1) }));
  const photos = new Map();
  for (const photo of [...(recalled || []), ...current]) photos.set(photo.name, { dataUrl: photo.dataUrl, name: photo.name });
  const images = [...photos.values(), ...namedFrames];
  return images.length ? images : null;
}

export default [
  /* ⚠ (#R773) 添付は会話に属する。読者が前のターンで付けた画像や PDF は、費用（1 件 8 MB）の
     ため毎ターンは載せない——在ることだけを述べ、要ると Atlas が決めたときにこれが**次の一手の
     目の前へ戻す**。地図も設定も触らないので observer は 'none'、writes は空、risk は 'read'。 */
  /* ⚠⚠ (#R783) COLUMN 9 IS EMPTY, AND IT HAS TO BE. It said 'text', and `hasTarget('text')`
     accepts query/text/question/value/place/term — this capability's only argument is `name`
     (js/atlas-schemas.js), so the one call its own schema declares sufficient could not satisfy
     its own target: every `run_capability{id:'attach.recall',args:{name:'paper.pdf'}}` answered
     `needs_input` 「使用する値を教えてください」 and the recall #R773 implemented never once
     reached the dispatch. ⚠ THE FIX IS NOT A WIDER `hasTarget` — adding `name` to the text list
     would loosen what «the reader gave me something to work on» means for every other capability
     that targets text. What refuses an argument-less call is `required:['name']` in
     js/atlas-schemas.js, enforced on what Atlas sends by js/atlas-toolsurface.js, exactly as for
     data.coverage above (#R760). tests/atlas-capabilities-checks.test.mjs #R783 ①/② measure
     both halves of that for all 145 rows rather than for these two. */
  /* ⚠ (#R801) WHAT LEAVES, TO WHOM: a file the reader attached in an EARLIER turn, back into
     the MODEL's next input — column 8 'none' (it only reaches the model that already holds the conversation) (js/atlas-executor.js 4b). */
  {
    row: ['attach.recall',              'recallAttachment','recall_attachment,recallFile,reopenAttachment',               'dialog',  'none',    '',                       'explanation',         'read',    'none'    ,'',        '', 'external'],
    ui: { none: '2026-11-16' },
    /* (#R773) 取り寄せるものは名前で指す。名前は [ATTACHED EARLIER…] が述べたもので、無ければ
       その一覧が返る（存在しない名前に対して黙って別のものを返さない）。
       (#R790) `offset` は任意——長いテキストの続きを読むときだけ、前回の応答が返した
       `next` をそのまま渡す。省略すれば先頭の窓（画像・PDF は無関係、この欄は無視される）。 */
    doc: [
      { in: 'attach.recall', text: 'BRING BACK A FILE THE READER ATTACHED EARLIER IN THIS CONVERSATION, OR READ FURTHER INTO A LONG TEXT ATTACHMENT: {"type":"recallAttachment","name":str,"offset"?:int}. The [ATTACHED EARLIER IN THIS CONVERSATION] block in your prompt lists what is there, by name and kind; pass that name. The file is put in front of you on your NEXT step — an image through the same channel your own captures use, a PDF as a document, text through the attachment channel. A TEXT ATTACHMENT LONGER THAN WHAT IS SENT AUTOMATICALLY IS NOT LOST, IT IS WINDOWED: the tool result tells you `total` (the file\'s full length in characters), `offset`/`next` (what you now have), and `more` (whether anything follows). The next model input includes an ATTACHMENT RECEIPT from the server naming the accepted range and its actual `next`; use that cursor when present. If `more` is true, call this again with the SAME name and `offset` set to the `next` you were given, and repeat until `more` is false — that is how you read the rest of a file too long for one turn. Images and PDFs are held back entirely until recalled (no windowing — they arrive whole), because re-sending megabytes every turn would charge the reader for a file they attached once. NEVER TELL THE READER YOU CANNOT SEE A FILE, OR THE REST OF ONE, THAT THIS BLOCK OR A PRIOR WINDOW NAMES — recall the next window and then answer. A name that matches nothing is REFUSED with the list of what is actually there.\n' },
    ],
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { name: str(), offset: int(0) }, required: ['name'] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, note = K.note;
      const rec = ATTACH_LOG.find(K._curTurn, a && a.name);
      if (!rec) {
        const names = ATTACH_LOG.names(K._curTurn);
        return R(false, warn(L('No attachment called that. In this conversation: ' + (names.join(', ') || 'none'), 'その名前の添付はありません。この会話にあるのは: ' + (names.join('、') || 'なし'), 'Kein Anhang mit diesem Namen. In diesem Gespräch: ' + (names.join(', ') || 'keine'), 'Вложения с таким именем нет. В этом разговоре: ' + (names.join(', ') || 'нет'), 'No hay ningún adjunto con ese nombre. En esta conversación: ' + (names.join(', ') || 'ninguno'))));
      }
      const attachments = K._atlRecallAtts;
      const exec = { recalled: rec.name, kind: rec.kind };
      if (rec.kind === 'image') {
        if (!K._atlRecallImgs.some((img) => img.name === rec.name)) K._atlRecallImgs.push(rec);
      } else if (!attachments) {
        return R(false, warn(L('Attachment delivery is unavailable.', '添付を送信できません。')), { meta: { code: 'attachment_unavailable' } });
      } else if (rec.kind === 'doc') {
        attachments.docs.push({ name: rec.name, mime: rec.mime, b64: rec.b64 });
        delete attachments.docRefs;
      } else {
        const pg = recallTextWindow(rec, a && a.offset, attachments.recalledFiles);
        Object.assign(exec, { offset: pg.offset, end: pg.next, next: pg.more ? pg.next : null, total: pg.total, more: pg.more });
        if (!pg.queued && pg.more) return R(false, warn(L('This step has no room for another text window.', 'この手順には追加のテキスト区間を送る枠がありません。')), { exec, meta: { code: 'attachment_window_full' } });
      }
      return R(true, note(L('Attachment requested: ' + rec.name, '添付を取り寄せました: ' + rec.name, rec.name + ' wurde zurückgeholt — beim nächsten Schritt liegt es vor dir.', 'Вложение ' + rec.name + ' возвращено — оно перед вами на следующем шаге.', 'Se recuperó ' + rec.name + ' — lo tendrás delante en el siguiente paso.')), { exec });
    },
  },
];
