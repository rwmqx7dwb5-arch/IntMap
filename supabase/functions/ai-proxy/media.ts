// ============================================================================
//  IntMap · ai-proxy · media — the reader's attachments as the providers receive them
// ----------------------------------------------------------------------------
//  (atlas-core-split) Moved out of index.ts unchanged. The bounds are config.ts's (MAX_IMAGE_BYTES,
//  IMAGE_MIME and the #R540 channel bounds); the loops that apply them to a request are in ask.ts.
// ============================================================================

import { IMAGE_MIME, MAX_IMAGE_BYTES } from "./config.ts";

export interface ImgPart { mime: string; b64: string; }
/* (#R540) The two attachment channels (see MAX_FILES above). `truncated` is the report that the
   file was cut — by the client at ATL_FILE.LIMITS.textPerFile, or here at MAX_FILE_TEXT — and it is
   carried all the way to the model because a model that cannot see the cut answers about the part
   it was given as if that were the whole file. */
export interface FilePart { name: string; text: string; truncated: boolean; }
export interface DocPart { name: string; mime: string; b64: string; }
// (#R131) A single hosted-web-search citation the model emitted (Responses API url_citation
// annotation). Kept end-to-end so the client can show the sources the model ACTUALLY read/cited
// this turn, distinct from the articles IntMap gathered on the client. The old code threw these
// away, so a correctly web-verified source could vanish from the UI.
export interface WebCitation { url: string; title: string; startIndex?: number; endIndex?: number; }
/* Decoded length of a base64 string, without decoding it. */
export function b64Bytes(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor(b64.length / 4) * 3 - pad;
}
export function parseDataUrl(d: string): ImgPart | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(d || "");
  if (!m) return null;
  const mime = m[1].toLowerCase(), b64 = m[2];
  /* ⚠ ALL THREE CHECKS ARE ABOUT THE SAME THING: what goes into the provider request must be an
     image, and it must be an image of a size somebody could actually have taken. The old regex
     checked neither the format nor the length, and `.*` accepted any character at all after the
     comma — including a second `data:` URL, or a megabyte of text that is not base64. */
  if (!IMAGE_MIME.has(mime)) return null;
  if (b64.length % 4 !== 0) return null;
  if (b64Bytes(b64) > MAX_IMAGE_BYTES) return null;
  return { mime, b64 };
}
/* (#R540) ONE wording, three providers. The attached text is a `text` block on Anthropic, an
   `input_text` on OpenAI and a plain text part on Gemini; written at each of those three sites the
   wording would drift, and the models would be told three different things about the same files.
   The frame names the attachment explicitly because a model handed a wall of pasted text with
   nothing around it does sometimes reply that it cannot read attachments — about text it is holding.
   Empty in, empty out: a caller with no text attachments must push no block at all. */
export function filesBlock(files: FilePart[]): string {
  if (!files.length) return "";
  const out: string[] = [
    "[ATTACHED FILE" + (files.length > 1 ? "S" : "") +
    " — the user attached the following. Use the content to answer; do not claim you cannot read attachments.]",
  ];
  for (const f of files) {
    out.push("----- " + f.name + " -----");
    out.push(f.text);
    if (f.truncated) out.push("…(truncated — file was longer)");
  }
  return out.join("\n");
}
