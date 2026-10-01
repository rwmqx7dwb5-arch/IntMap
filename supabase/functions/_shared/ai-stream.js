/* ============================================================================
 *  IntMap · THE PROVIDER'S STREAM, READ TWICE   (atlas-live-stream)
 * ----------------------------------------------------------------------------
 *  「考え終わってから一度に出す」 was a property of the transport, not of Atlas. MEASURED (#R723,
 *  production): a six-operation turn took 57.2 s and 13.6 s of it was operations — the other ~43 s
 *  was the reader looking at a shimmering 「考え中」 while the model was, the whole time, producing
 *  tokens nobody could see. ai-proxy asked every provider for ONE finished JSON body, and
 *  relay-guard's fetchBounded buffered even that before handing it over.
 *
 *  This module reads a provider's server-sent events in two ways at once:
 *
 *    ① AS THEY ARRIVE — each delta becomes a PREVIEW for the reader (`sink`): what the model is
 *       thinking (a reasoning summary, where the provider publishes one), the words it is writing,
 *       and the name of each function it has decided to call, the moment that name exists.
 *    ② AT THE END — the same events are folded back into the exact body the non-streaming endpoint
 *       returns, and THAT is what ai-proxy's existing parsers read. So the items Atlas acts on, the
 *       usage the ledger records (_shared/ai-usage.js normalizeUsage), the empty / blocked / malformed
 *       classification and the fallback ladder are the ones that already ran — not a second copy
 *       written for the streaming case.
 *
 *  ⚠⚠⚠ A PREVIEW IS NOT AN ANSWER. Nothing in ① is acted on: no call runs from a `call` preview
 *  (it carries a name, never arguments), and no text in it is the reply until ② has produced the
 *  body, the ledger has settled the turn and ai-proxy has sent its `done` event. A stream that dies
 *  half-way has produced previews and no answer, and is reported as the failure it is.
 *
 *  ⚠ PLAIN JAVASCRIPT, NO DENO API — node's test runner imports it (tests/atlas-live-stream-checks).
 * ==========================================================================*/

/* ── SSE, as the three providers and ai-proxy all write it ────────────────────────────────────
   One event = lines up to a blank line; `event:` names it, `data:` lines are joined with "\n",
   a line starting ":" is a comment (a heartbeat). Bytes may split anywhere — inside a line, inside
   a multi-byte character — so decoding is streaming and only COMPLETE lines are parsed. */
export function sseReader(onEvent) {
  const dec = new TextDecoder("utf-8");
  let buf = "";
  let name = "";
  let data = [];
  const line = (l) => {
    if (l === "") {
      if (data.length || name) { try { onEvent({ event: name || "message", data: data.join("\n") }); } catch (_) { /* a reader's fault is not the stream's */ } }
      name = ""; data = [];
      return;
    }
    if (l.charCodeAt(0) === 58) return;                       /* ":" comment */
    const c = l.indexOf(":");
    const field = c < 0 ? l : l.slice(0, c);
    let value = c < 0 ? "" : l.slice(c + 1);
    if (value.charCodeAt(0) === 32) value = value.slice(1);
    if (field === "event") name = value;
    else if (field === "data") data.push(value);
  };
  const drain = () => {
    for (;;) {
      const i = buf.search(/\r\n|\n|\r/);
      if (i < 0) return;
      const eol = buf.charCodeAt(i) === 13 && buf.charCodeAt(i + 1) === 10 ? 2 : 1;
      if (eol === 1 && buf.charCodeAt(i) === 13 && i === buf.length - 1) return;   /* a lone CR at the end may be half of CRLF */
      const l = buf.slice(0, i);
      buf = buf.slice(i + eol);
      line(l);
    }
  };
  return {
    push(chunk) { buf += typeof chunk === "string" ? chunk : dec.decode(chunk, { stream: true }); drain(); },
    end() { buf += dec.decode(); drain(); if (buf) { line(buf); buf = ""; } line(""); },
  };
}

function parse(s) { try { return JSON.parse(s); } catch (_) { return null; } }

/* ── ② THE BODY THE NON-STREAMING ENDPOINT WOULD HAVE RETURNED, PER PROVIDER ─────────────────── */

/* OpenAI Responses: the terminal event (`response.completed` / `.incomplete` / `.failed`) carries the
   whole response object — output items with the encrypted reasoning, the usage, the status. Nothing
   needs to be rebuilt; it needs to be FOUND. */
function openaiFolder(sink) {
  let final = null, fail = null;
  return {
    event(ev) {
      const j = parse(ev.data);
      if (!j || typeof j !== "object") return;
      const t = String(j.type || ev.event || "");
      if (t === "response.output_text.delta" && typeof j.delta === "string") sink.text(j.delta);
      else if (t === "response.reasoning_summary_text.delta" && typeof j.delta === "string") sink.think(j.delta);
      else if (t === "response.reasoning_summary_part.added") sink.think("\n\n");
      else if (t === "response.output_item.added" && j.item && j.item.type === "function_call") sink.call({ id: String(j.item.call_id || ""), name: String(j.item.name || "") });
      else if (t === "response.output_item.added" && j.item && String(j.item.type || "").indexOf("web_search") === 0) sink.search();
      else if ((t === "response.completed" || t === "response.incomplete") && j.response) final = j.response;
      else if (t === "response.failed") {
        const e = (j.response && j.response.error) || {};
        fail = { status: /rate/i.test(String(e.code || "")) ? 429 : 503, text: String(e.code || "") + " " + String(e.message || ""), partial: j.response };
      } else if (t === "error") fail = { status: /rate/i.test(String(j.code || "")) ? 429 : 503, text: String(j.code || "") + " " + String(j.message || "") };
    },
    result() {
      if (final) return { json: final };
      return { fail: fail || { status: 503, text: "stream_incomplete" } };
    },
  };
}

/* Anthropic Messages: no event carries the whole message, so it is folded from its parts —
   message_start (id, model, input usage), one content block per index (text with its citations,
   tool_use with its input JSON streamed as fragments, server tools and their results arriving
   whole), message_delta (stop_reason, the output usage). */
function anthropicFolder(sink) {
  let msg = null, fail = null, stopped = false;
  const blocks = [];
  const partial = [];
  return {
    event(ev) {
      const j = parse(ev.data);
      if (!j || typeof j !== "object") return;
      const t = String(j.type || ev.event || "");
      if (t === "message_start" && j.message) { msg = Object.assign({}, j.message, { content: [] }); }
      else if (t === "content_block_start" && j.content_block) {
        const b = Object.assign({}, j.content_block);
        if (b.type === "text") { b.text = String(b.text || ""); if (b.text) sink.text(b.text); }
        if (b.type === "tool_use") { sink.call({ id: String(b.id || ""), name: String(b.name || "") }); partial[j.index] = ""; }
        if (b.type === "server_tool_use" && b.name === "web_search") sink.search();
        blocks[j.index] = b;
      } else if (t === "content_block_delta" && j.delta) {
        const b = blocks[j.index]; const d = j.delta;
        if (!b) return;
        if (d.type === "text_delta" && typeof d.text === "string") { b.text = (b.text || "") + d.text; sink.text(d.text); }
        else if (d.type === "input_json_delta") partial[j.index] = (partial[j.index] || "") + String(d.partial_json || "");
        else if (d.type === "thinking_delta" && typeof d.thinking === "string") { b.thinking = (b.thinking || "") + d.thinking; sink.think(d.thinking); }
        else if (d.type === "signature_delta") b.signature = (b.signature || "") + String(d.signature || "");
        else if (d.type === "citations_delta" && d.citation) (b.citations = b.citations || []).push(d.citation);
      } else if (t === "content_block_stop") {
        const b = blocks[j.index];
        if (b && b.type === "tool_use" && partial[j.index] != null) { const v = parse(partial[j.index] || "{}"); b.input = (v && typeof v === "object") ? v : {}; }
      } else if (t === "message_delta") {
        if (msg) {
          if (j.delta && j.delta.stop_reason != null) msg.stop_reason = j.delta.stop_reason;
          if (j.usage) msg.usage = Object.assign({}, msg.usage || null, j.usage);
        }
      } else if (t === "message_stop") stopped = true;
      else if (t === "error") {
        const e = j.error || {};
        const ty = String(e.type || "");
        fail = { status: ty === "rate_limit_error" ? 429 : ty === "overloaded_error" || ty === "api_error" ? 503 : 400, text: ty + " " + String(e.message || "") };
      }
    },
    result() {
      if (fail) return { fail: Object.assign({}, fail, msg ? { partial: msg } : null) };
      if (!msg || !stopped) return { fail: Object.assign({ status: 503, text: "stream_incomplete" }, msg ? { partial: msg } : null) };
      msg.content = blocks.filter(Boolean);
      return { json: msg };
    },
  };
}

/* Gemini streamGenerateContent (alt=sse): every event is a whole GenerateContentResponse holding the
   NEXT parts. Text parts of the same kind (thought or not) are joined; a functionCall part arrives
   whole and is kept as it came, with its thoughtSignature. The last usageMetadata / finishReason /
   modelVersion stand for the response. */
function geminiFolder(sink) {
  let last = null, any = false, good = null;
  const parts = [];
  let finishReason = "";
  return {
    event(ev) {
      const j = parse(ev.data);
      if (!j || typeof j !== "object") return;
      if (j.error) { last = j; return; }
      any = true;
      last = Object.assign({}, last && !last.error ? last : null, j);
      good = last;
      const c = j.candidates && j.candidates[0];
      if (c && c.finishReason) finishReason = c.finishReason;
      const ps = (c && c.content && Array.isArray(c.content.parts)) ? c.content.parts : [];
      for (const p of ps) {
        if (!p || typeof p !== "object") continue;
        if (p.functionCall) { parts.push(Object.assign({}, p)); sink.call({ id: "", name: String(p.functionCall.name || "") }); continue; }
        if (typeof p.text === "string") {
          if (p.thought === true) sink.think(p.text); else sink.text(p.text);
          const prev = parts[parts.length - 1];
          if (prev && typeof prev.text === "string" && !prev.functionCall && (prev.thought === true) === (p.thought === true)) {
            prev.text += p.text;
            if (typeof p.thoughtSignature === "string") prev.thoughtSignature = p.thoughtSignature;
          } else parts.push(Object.assign({}, p));
        } else if (typeof p.thoughtSignature === "string" && parts.length) parts[parts.length - 1].thoughtSignature = p.thoughtSignature;
      }
    },
    result() {
      if (last && last.error) {
        const e = last.error;
        return { fail: Object.assign({ status: Number(e.code) || 503, text: String(e.status || "") + " " + String(e.message || "") }, good ? { partial: good } : null) };
      }
      if (!any) return { fail: { status: 503, text: "stream_incomplete" } };
      const c0 = (last.candidates && last.candidates[0]) || {};
      const out = Object.assign({}, last, { candidates: [Object.assign({}, c0, { finishReason: finishReason || c0.finishReason, content: { role: "model", parts } })] });
      return { json: out };
    },
  };
}

const FOLDERS = { openai: openaiFolder, anthropic: anthropicFolder, gemini: geminiFolder };

/* providerStream(provider, sink) → { onChunk(bytes), result() }
   `onChunk` goes to providerFetch (which forwards the bytes of a 2xx answer as they arrive, under the
   same deadline and byte ceiling); `result()` is called once the body is complete and returns
   { json } — the body the non-streaming endpoint returns — or { fail: {status, text, partial?} } for
   an error the provider reported INSIDE a 200 stream, which the caller classifies like an HTTP error.
   `partial` is whatever part of the body had arrived — it carries the usage the provider had already
   billed (input tokens are counted at the start of a stream), so the ledger records a failure's cost
   exactly as it records a non-streamed answer's (ai-one-ledger: a failure the provider billed is a cost).
   Creating one marks a new provider attempt on the sink (see previewSink). */
export function providerStream(provider, sink) {
  const s = sink || nullSink();
  try { s.attempt(); } catch (_) { /* preview only */ }
  const safe = {
    text: (d) => { try { if (d) s.text(String(d)); } catch (_) { /* preview only */ } },
    think: (d) => { try { if (d) s.think(String(d)); } catch (_) { /* preview only */ } },
    call: (c) => { try { s.call(c); } catch (_) { /* preview only */ } },
    search: () => { try { s.search(); } catch (_) { /* preview only */ } },
  };
  const folder = (FOLDERS[String(provider || "").toLowerCase()] || openaiFolder)(safe);
  let ended = false;
  const sse = sseReader((ev) => folder.event(ev));
  return {
    onChunk(bytes) { if (!ended) sse.push(bytes); },
    result() { if (!ended) { ended = true; sse.end(); } return folder.result(); },
  };
}

function nullSink() { return { attempt() {}, text() {}, think() {}, call() {}, search() {} }; }

/* ── THE WIRE TO THE PAGE ─────────────────────────────────────────────────────────────────────
   previewSink(send) turns provider previews into ai-proxy's own events:
     think {d} · text {d} · call {id,name} · search {} · reset {}
   `reset` is said when a NEW provider request starts after something was already previewed — the
   fallback ladder, an empty-answer retry, a web-search timeout retry. What the reader was shown came
   from an attempt that will not be the answer, and the page must drop it rather than append to it. */
export function previewSink(send) {
  let shown = false;
  return {
    attempt() { if (shown) { shown = false; send("reset", {}); } },
    text(d) { shown = true; send("text", { d }); },
    think(d) { shown = true; send("think", { d }); },
    call(c) { shown = true; send("call", { id: String((c && c.id) || ""), name: String((c && c.name) || "") }); },
    search() { shown = true; send("search", {}); },
  };
}

export function sseEncode(event, data) {
  return "event: " + event + "\ndata: " + JSON.stringify(data == null ? {} : data) + "\n\n";
}

/* How often the page hears from a stream with nothing new in it. A reasoning model can be silent for
   tens of seconds; an intermediary that sees no bytes for that long may close the connection, and the
   page would read that as the stream breaking. OBSERVED: none measured on this path — the number is the
   conventional SSE keep-alive. EXPIRES WHEN a measured idle limit says otherwise. */
export const HEARTBEAT_MS = 15000;
