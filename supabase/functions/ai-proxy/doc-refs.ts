// ============================================================================
//  IntMap · ai-proxy · doc-refs — a document sent ONCE, then named
// ----------------------------------------------------------------------------
//  (atlas-mainloop-reliability) An Atlas turn is several model calls, and every one of them re-sent the reader's PDF whole
//  (up to 12 MB of base64 each, 8 calls a turn on a measured real turn). On the OpenAI path the first call of a turn now
//  uploads each document to the provider's Files API, uses it by `file_id`, and hands the page a REFERENCE; the page sends the
//  reference instead of the bytes on the turn's later calls.
//  · the file is uploaded with expires_after = 1 hour (the shortest the Files API takes) — a reader's PDF is not left at the
//    provider; a turn lasts at most EDGE_WALL_CLOCK_MS (400 s), so the reference outlives every turn it is made for;
//  · a reference is `{ name, mime, id, sig }` and `sig` is an HMAC of (account, id) under the project secret key, so a page can only
//    name a file THIS server uploaded FOR THIS ACCOUNT — a file id is not a capability the caller can bring from elsewhere;
//  · a failed upload is not a failed turn: the document simply stays inline, as it was.
// ============================================================================

import { providerCall } from "./provider-call.ts";
import type { Meter } from "./provider-call.ts";
import type { DocPart } from "./media.ts";
import { secretKey } from "../_shared/supabase-keys.js";

const FILE_ID = /^file-[A-Za-z0-9_-]{6,80}$/;

async function hmacHex(account: string, id: string): Promise<string> {
  const secret = secretKey((k: string) => Deno.env.get(k) || "");   /* the one resolver of the project key */
  if (!secret) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("docref\n" + account + "\n" + id)));
  return Array.from(sig.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type DocRef = { name: string; mime: string; id: string; sig: string };

/* the references a request carries, kept only if this server signed them for this account */
export async function acceptDocRefs(account: string, raw: unknown): Promise<DocPart[]> {
  const out: DocPart[] = [];
  for (const r of (Array.isArray(raw) ? raw : [])) {
    if (!r || typeof r !== "object") continue;
    const id = String((r as DocRef).id || "");
    if (!FILE_ID.test(id)) continue;
    const want = await hmacHex(account, id);
    if (!want || want !== String((r as DocRef).sig || "")) continue;
    out.push({ name: String((r as DocRef).name || "document").slice(0, 200), mime: String((r as DocRef).mime || "application/pdf").toLowerCase(), b64: "", fileId: id });
  }
  return out;
}

export async function signDocRefs(account: string, docs: DocPart[]): Promise<DocRef[]> {
  const out: DocRef[] = [];
  for (const d of docs) if (d.fileId) { const sig = await hmacHex(account, d.fileId); if (sig) out.push({ name: d.name, mime: d.mime, id: d.fileId, sig }); }
  return out;
}

/* upload each inline document once; the DocPart is marked in place, so a fallback model of the same request reuses the file */
export async function uploadDocs(key: string, docs: DocPart[], meter?: Meter): Promise<void> {
  await Promise.all(docs.map(async (d) => {
    if (d.fileId || !d.b64) return;
    try {
      const bin = Uint8Array.from(atob(d.b64), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.set("purpose", "user_data");
      form.set("expires_after[anchor]", "created_at");
      form.set("expires_after[seconds]", "3600");
      form.set("file", new Blob([bin], { type: d.mime }), d.name.replace(/[^\w.\- ]/g, "_") || "document.pdf");
      const r = await providerCall("https://api.openai.com/v1/files", { method: "POST", headers: { "Authorization": "Bearer " + key }, body: form }, undefined, meter);
      if (!r.ok) { await r.text().catch(() => ""); return; }
      const id = String((await r.json().catch(() => ({})))?.id || "");
      if (FILE_ID.test(id)) d.fileId = id;
    } catch (_) { /* the document stays inline */ }
  }));
}
