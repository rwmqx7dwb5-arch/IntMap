// web-browse-probe — the vertical slice against a REAL portal, with Node's fetch and DNS (no Edge Function, no login).
//   node scripts/web-browse-probe.mjs [query]
// search (data.go.jp) → open a dataset → find a data file link → download it → read it with the GIS file door's reader.
// Not part of CI (live network); it is how the engine is measured against the real thing.
import dns from "node:dns/promises";
import crypto from "node:crypto";
import { browse } from "../supabase/functions/_shared/web-browse.js";
import { publicAddress } from "../supabase/functions/_shared/relay-guard.js";

const deps = {
  userAgent: "IntMap/web-browse-probe",
  resolvesPublic: async (host) => { try { const a = await dns.lookup(host, { all: true }); return a.length > 0 && a.every((x) => publicAddress(x.address)); } catch (_) { return false; } },
  sha256: async (b) => crypto.createHash("sha256").update(b).digest("hex"),
};
const q = process.argv[2] || "人口";
let state = null;
const step = async (label, input) => {
  const t = Date.now();
  const r = await browse({ ...input, state }, deps);
  state = r.state;
  const p = r.page;
  console.log(`\n== ${label} → ${r.ok ? "ok" : r.code} (${Date.now() - t} ms)${p ? " · " + p.title : ""}${r.file ? " · file " + r.file.name + " " + r.file.bytes + "B " + r.file.type : ""}`);
  if (p) console.log(`   text ${p.text.length}c · files ${p.files.length} · links ${p.links.length} · forms ${p.forms.map((f) => f.ref + ":" + f.method + "[" + f.fields.map((x) => x.name).join(",") + "]").join(" ")}`);
  return r;
};
let r = await step("open search", { action: "open", url: "https://www.data.go.jp/data/dataset" });
const form = r.page && r.page.forms.find((f) => f.fields.some((x) => x.name === "q" || /keyword|search/i.test(x.name)));
if (!form) { console.log("no search form found", JSON.stringify(r.page && r.page.forms).slice(0, 600)); process.exit(1); }
const field = form.fields.find((x) => x.name === "q") || form.fields.find((x) => x.type === "text" || x.type === "search");
r = await step("submit search", { action: "submit", form: form.ref, values: { [field.name]: q } });
const ds = r.page.links.find((l) => /\/data\/dataset\/[^/?]+$/.test(l.href));
console.log("first dataset link:", ds && ds.href);
r = await step("open dataset", { action: "click", ref: ds.ref });
let files = r.page.files;
console.log("files on dataset page:", files.slice(0, 6).map((f) => f.ref + " " + f.file + " " + f.href.slice(0, 90)));
const csv = files.find((f) => f.file === "csv");
if (!csv) {
  const res = r.page.links.find((l) => /\/resource\//.test(l.href));
  if (res) { r = await step("open resource page", { action: "click", ref: res.ref }); files = r.page.files; console.log("files on resource page:", files.slice(0, 6).map((f) => f.ref + " " + f.file + " " + f.href.slice(0, 90))); }
}
const pick = files.find((f) => f.file === "csv") || files[0];
if (!pick) { console.log("no data file reachable"); process.exit(2); }
r = await step("download " + pick.ref, { action: "download", ref: pick.ref });
if (r.file) { const buf = Buffer.from(r.file.b64, "base64"); console.log("sha256", r.file.sha256.slice(0, 16), "head:", buf.subarray(0, 120).toString("utf8").replace(/\s+/g, " ")); }
