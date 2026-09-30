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
 *  The prose the planner reads stays in js/atlas-catalog-text.js (a block names the ids it documents).
 * ==========================================================================*/
import { str, int } from './atlas-caps.js';
import { ATTACH_LOG } from './atlas-file-view.js';
import { ATL_FILE } from './atlas-attach.js';

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
     the MODEL's next input — column 8 'explicit' (js/atlas-executor.js 4b). */
  {
    row: ['attach.recall',              'recallAttachment','recall_attachment,recallFile,reopenAttachment',               'dialog',  'none',    '',                       'explanation',         'read',    'explicit','',        '', 'external'],
    /* (#R773) 取り寄せるものは名前で指す。名前は [ATTACHED EARLIER…] が述べたもので、無ければ
       その一覧が返る（存在しない名前に対して黙って別のものを返さない）。
       (#R790) `offset` は任意——長いテキストの続きを読むときだけ、前回の応答が返した
       `next` をそのまま渡す。省略すれば先頭の窓（画像・PDF は無関係、この欄は無視される）。 */
    schema: () => ({ type: 'object', properties: { name: str(), offset: int(0) }, required: ['name'] }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L, note = K.note;
      { const _r=ATTACH_LOG.find(K._curTurn,a&&a.name); if(!_r){ const _n=ATTACH_LOG.names(K._curTurn); return R(false,warn(L('No attachment called that. In this conversation: '+(_n.join(', ')||'none'),'その名前の添付はありません。この会話にあるのは: '+(_n.join('、')||'なし'),'Kein Anhang mit diesem Namen. In diesem Gespräch: '+(_n.join(', ')||'keine'),'Вложения с таким именем нет. В этом разговоре: '+(_n.join(', ')||'нет'),'No hay ningún adjunto con ese nombre. En esta conversación: '+(_n.join(', ')||'ninguno')))); } let _pg=null; if(_r.kind==='image') K._atlRecallImgs.push(_r.dataUrl); else if(_r.kind==='doc'){ if(K._atlRecallAtts) K._atlRecallAtts.docs.push({name:String(_r.name||'file'),mime:String(_r.mime||''),b64:String(_r.b64||'')}); } else if(K._atlRecallAtts){ _pg=ATTACH_LOG.page(_r,a&&a.offset,ATL_FILE.LIMITS.textPerFile); K._atlRecallAtts.files.push({name:String(_r.name||'file'),text:_pg.text,truncated:_pg.more}); } return R(true,note(L('Brought back '+_r.name+' — it is in front of you on the next step.','「'+_r.name+'」を取り戻しました。次の一手で目の前にあります。',_r.name+' wurde zurückgeholt — beim nächsten Schritt liegt es vor dir.','Вложение '+_r.name+' возвращено — оно перед вами на следующем шаге.','Se recuperó '+_r.name+' — lo tendrás delante en el siguiente paso.')),{exec:_pg?{recalled:_r.name,kind:_r.kind,offset:_pg.offset,next:_pg.more?_pg.next:null,total:_pg.total,more:_pg.more}:{recalled:_r.name,kind:_r.kind}}); }   /* ⚠⚠⚠ (#R773) 取り戻したものは**次のモデル呼び出しのチャネルに載る**（画像は vision、PDF は文書、テキストは添付チャネル）。tool の結果テキストに入れないのは #R493 と同じ理由——プロンプト本文に置いた data URL は画像ではなく数十万文字の base64 である。 ⚠⚠⚠ (#R790) テキストは窓で戻る（js/atlas-attach-log.js の page()）——`exec.more` が真なら、`exec.next` を次回の `offset` に渡せば続きが読める。 */
    },
  },
];
