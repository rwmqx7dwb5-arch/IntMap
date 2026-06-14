// ============================================================================
//  IntMap · refresh-news  —  Supabase Edge Function (Deno)
// ----------------------------------------------------------------------------
//  Runs on a schedule (every ~20 min via pg_cron, see supabase_news_setup.sql).
//  It does ALL the heavy news work that used to run in every visitor's browser
//  on startup (the 150-articles × 130-gazetteer-entries scoring loop):
//
//    1. Fetch Google News RSS server-side (no CORS, no proxy needed).
//    2. Resolve each story's SUBJECT location with the same scoring model the
//       client used, reading the gazetteer straight from the `geo_pins` table
//       (single source of truth) + an embedded publisher-HQ gazetteer.
//    3. OPTIONAL LLM pass (OPENAI_API_KEY secret) to geocode whatever the
//       dictionary missed — degrades gracefully when no key is set.
//    4. Write the clean, pre-analysed result into `current_news`.
//
//  The browser then does ONE `select * from current_news` (a few ms) instead
//  of fetching + parsing + scoring 150 articles on the main thread.
//
//  Deploy:   supabase functions deploy refresh-news --no-verify-jwt
//  Secrets:  supabase secrets set REFRESH_SECRET=<random>   (optional but recommended)
//            supabase secrets set OPENAI_API_KEY=sk-...      (optional — enables LLM geocoding)
//  (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-refresh-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ---- Editions: the two primary UI languages. (Multi-language auto-translate
//      stays an opt-in client AI feature, so we only pre-bake en + jp here.) ----
const EDITIONS: { lang: "en" | "jp"; topics: { topic: string; q: string }[] }[] = [
  {
    lang: "en",
    topics: [
      { topic: "world", q: "hl=en-US&gl=US&ceid=US:en" },
      { topic: "business", q: "hl=en-US&gl=US&ceid=US:en" },
    ],
  },
  {
    lang: "jp",
    topics: [
      { topic: "world", q: "hl=ja&gl=JP&ceid=JP:ja" },
      { topic: "business", q: "hl=ja&gl=JP&ceid=JP:ja" },
    ],
  },
];
const TOPIC_PATH: Record<string, string> = { world: "WORLD", business: "BUSINESS" };
const MAX_ITEMS = 150;

// ---- Scoring model (identical to the old client-side analyzeContext) ----
const TYPE_SCORE: Record<string, number> = { flashpoint: 5, city: 2, country: 0, region: 0 };
const TYPE_LOCAL: Record<string, number> = { flashpoint: 4, city: 3, country: 2, region: 1 };

// ---- Publisher-HQ gazetteer (mirror of the client `sourceDict`) ----
const SOURCE_DICT: Record<string, [number, number]> = {
  // UK
  "BBC": [-0.12, 51.50], "Reuters": [-0.12, 51.50], "ロイター": [-0.12, 51.50], "The Guardian": [-0.12, 51.50], "Guardian": [-0.12, 51.50], "Financial Times": [-0.12, 51.50], "Sky News": [-0.12, 51.50], "The Times": [-0.12, 51.50], "Telegraph": [-0.12, 51.50], "The Independent": [-0.12, 51.50], "Independent": [-0.12, 51.50], "Daily Mail": [-0.12, 51.50], "The Economist": [-0.12, 51.50], "Economist": [-0.12, 51.50], "Middle East Eye": [-0.12, 51.50], "Mirror": [-0.12, 51.50],
  // US
  "AP": [-74.00, 40.71], "Associated Press": [-74.00, 40.71], "Bloomberg": [-74.00, 40.71], "NYT": [-74.00, 40.71], "New York Times": [-74.00, 40.71], "WSJ": [-74.00, 40.71], "Wall Street Journal": [-74.00, 40.71], "CNN": [-84.39, 33.75], "Washington Post": [-77.03, 38.90], "NBC": [-74.00, 40.71], "CBS": [-74.00, 40.71], "ABC News": [-74.00, 40.71], "Fox News": [-74.00, 40.71], "NPR": [-77.03, 38.90], "Politico": [-77.03, 38.90], "Axios": [-77.03, 38.90], "The Hill": [-77.03, 38.90], "Newsweek": [-74.00, 40.71], "Forbes": [-74.00, 40.71], "USA Today": [-77.03, 38.90], "LA Times": [-118.24, 34.05], "Los Angeles Times": [-118.24, 34.05], "Business Insider": [-74.00, 40.71], "CNBC": [-74.00, 40.71],
  // Middle East
  "Al Jazeera": [51.53, 25.28], "Al Arabiya": [55.27, 25.20], "Arab News": [46.72, 24.69], "The National": [54.38, 24.45], "Gulf News": [55.27, 25.20], "Khaleej Times": [55.27, 25.20], "Haaretz": [34.78, 32.08], "Times of Israel": [35.21, 31.77], "Jerusalem Post": [35.21, 31.77], "Anadolu": [32.86, 39.93], "Daily Sabah": [28.98, 41.01], "Hurriyet": [28.98, 41.01], "TRT": [32.86, 39.93], "Press TV": [51.39, 35.69], "Tehran Times": [51.39, 35.69],
  // Europe
  "Deutsche Welle": [7.10, 50.74], "DW": [7.10, 50.74], "Der Spiegel": [9.99, 53.55], "Spiegel": [9.99, 53.55], "Die Welt": [13.40, 52.52], "FAZ": [8.68, 50.11], "Bild": [13.40, 52.52], "France 24": [2.35, 48.85], "AFP": [2.35, 48.85], "Le Monde": [2.35, 48.85], "Le Figaro": [2.35, 48.85], "RFI": [2.35, 48.85], "El País": [-3.70, 40.42], "El Pais": [-3.70, 40.42], "El Mundo": [-3.70, 40.42], "ANSA": [12.50, 41.90], "Corriere": [9.19, 45.46], "La Repubblica": [12.50, 41.90], "Euronews": [4.84, 45.76], "Kyiv Independent": [30.52, 50.45], "Kyiv Post": [30.52, 50.45], "TASS": [37.61, 55.75], "RT": [37.61, 55.75], "Moscow Times": [37.61, 55.75], "Interfax": [37.61, 55.75],
  // Asia-Pacific
  "NHK": [139.69, 35.66], "日経": [139.76, 35.68], "Nikkei Asia": [139.76, 35.68], "Nikkei": [139.76, 35.68], "朝日": [139.69, 35.66], "Asahi": [139.69, 35.66], "読売": [139.76, 35.68], "Yomiuri": [139.76, 35.68], "毎日": [139.76, 35.69], "Mainichi": [139.76, 35.69], "産経": [139.74, 35.66], "Japan Times": [139.76, 35.68], "Kyodo": [139.76, 35.68], "Xinhua": [116.40, 39.90], "CGTN": [116.40, 39.90], "Global Times": [116.40, 39.90], "People's Daily": [116.40, 39.90], "South China Morning Post": [114.16, 22.28], "SCMP": [114.16, 22.28], "Yonhap": [126.97, 37.56], "Korea Herald": [126.97, 37.56], "Korea Times": [126.97, 37.56], "Straits Times": [103.85, 1.29], "Channel News Asia": [103.85, 1.29], "CNA": [103.85, 1.29], "The Hindu": [80.27, 13.08], "Times of India": [72.88, 19.08], "Hindustan Times": [77.21, 28.61], "NDTV": [77.21, 28.61], "Indian Express": [77.21, 28.61], "India Today": [77.21, 28.61], "Dawn": [67.01, 24.86], "Jakarta Post": [106.85, -6.21], "Bangkok Post": [100.50, 13.75], "Sydney Morning Herald": [151.21, -33.87], "The Age": [144.96, -37.81],
  // Americas (non-US) / Africa
  "CBC": [-79.38, 43.65], "Globe and Mail": [-79.38, 43.65], "Toronto Star": [-79.38, 43.65], "CTV": [-79.38, 43.65], "Folha": [-46.63, -23.55], "O Globo": [-43.17, -22.91], "Clarín": [-58.38, -34.60], "News24": [18.42, -33.92], "Mail & Guardian": [28.05, -26.20], "The East African": [36.82, -1.29],
};

// ---- (#R27) Demonym gazetteer — a large share of geopolitical headlines name a country by its
//      ADJECTIVE ("Ukrainian", "Israeli", "Iranian", "Chinese") rather than its name. These map the
//      demonym → the country's representative point as a LOW-CONFIDENCE subject (docked in scoreGeo so
//      an explicit place from geo_pins always wins). Mirrors the client _DEMONYM_GZ. Big coverage gain.
const DEMONYM_DICT: Record<string, [number, number, string, string]> = {
  Ukrainian: [30.52, 50.45, "Ukraine", "ウクライナ"], Russian: [37.62, 55.75, "Russia", "ロシア"],
  Israeli: [35.21, 31.77, "Israel", "イスラエル"], Palestinian: [34.47, 31.50, "Palestinian territories", "パレスチナ"],
  Iranian: [51.39, 35.69, "Iran", "イラン"], Chinese: [116.40, 39.90, "China", "中国"],
  American: [-77.04, 38.91, "United States", "アメリカ"], British: [-0.13, 51.51, "United Kingdom", "イギリス"],
  French: [2.35, 48.85, "France", "フランス"], German: [13.40, 52.52, "Germany", "ドイツ"],
  Japanese: [139.69, 35.69, "Japan", "日本"], "South Korean": [126.98, 37.57, "South Korea", "韓国"],
  "North Korean": [125.76, 39.04, "North Korea", "北朝鮮"], Indian: [77.21, 28.61, "India", "インド"],
  Pakistani: [73.06, 33.69, "Pakistan", "パキスタン"], Taiwanese: [121.56, 25.03, "Taiwan", "台湾"],
  Syrian: [36.30, 33.51, "Syria", "シリア"], Lebanese: [35.50, 33.89, "Lebanon", "レバノン"],
  Turkish: [32.86, 39.93, "Turkey", "トルコ"], Saudi: [46.72, 24.69, "Saudi Arabia", "サウジアラビア"],
  Egyptian: [31.24, 30.04, "Egypt", "エジプト"], Yemeni: [44.21, 15.35, "Yemen", "イエメン"],
  Afghan: [69.18, 34.53, "Afghanistan", "アフガニスタン"], Sudanese: [32.53, 15.50, "Sudan", "スーダン"],
  Venezuelan: [-66.90, 10.49, "Venezuela", "ベネズエラ"], Mexican: [-99.13, 19.43, "Mexico", "メキシコ"],
  Brazilian: [-47.88, -15.79, "Brazil", "ブラジル"], Iraqi: [44.36, 33.31, "Iraq", "イラク"],
  Polish: [21.01, 52.23, "Poland", "ポーランド"], Greek: [23.73, 37.98, "Greece", "ギリシャ"],
  Nigerian: [7.49, 9.06, "Nigeria", "ナイジェリア"], Ethiopian: [38.74, 9.03, "Ethiopia", "エチオピア"],
  Thai: [100.50, 13.75, "Thailand", "タイ"], Vietnamese: [105.83, 21.03, "Vietnam", "ベトナム"],
  Indonesian: [106.85, -6.21, "Indonesia", "インドネシア"], Filipino: [120.98, 14.60, "Philippines", "フィリピン"],
  Qatari: [51.53, 25.29, "Qatar", "カタール"], Jordanian: [35.94, 31.95, "Jordan", "ヨルダン"],
  Argentine: [-58.38, -34.60, "Argentina", "アルゼンチン"], Colombian: [-74.07, 4.71, "Colombia", "コロンビア"],
  Serbian: [20.46, 44.79, "Serbia", "セルビア"], Belarusian: [27.57, 53.90, "Belarus", "ベラルーシ"],
  Armenian: [44.51, 40.18, "Armenia", "アルメニア"], Azerbaijani: [49.87, 40.41, "Azerbaijan", "アゼルバイジャン"],
};

// ---------------------------------------------------------------------------
//  Text helpers
// ---------------------------------------------------------------------------
const CJK = /[　-鿿ｦ-ﾟ]/;
const isCJK = (s: string) => CJK.test(s);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function decodeXml(s: string): string {
  return (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}
function stripHtml(s: string): string {
  return decodeXml((s || "").replace(/<font\b[^>]*>[\s\S]*?<\/font>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}
function pickTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? decodeXml(m[1]) : "";
}

interface RawItem { title: string; link: string; pubDate: string; description: string; source: string; }
function parseRss(xml: string): RawItem[] {
  const out: RawItem[] = [];
  const blocks = xml.split(/<item[ >]/i).slice(1);
  for (const raw of blocks) {
    const body = raw.split(/<\/item>/i)[0];
    const link = pickTag(body, "link").trim();
    if (!link) continue;
    const sm = body.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    out.push({
      title: pickTag(body, "title").trim(),
      link,
      pubDate: (pickTag(body, "pubDate") || pickTag(body, "published") || pickTag(body, "updated")).trim(),
      description: stripHtml(body.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || ""),
      source: sm ? decodeXml(sm[1]).trim() : "",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Gazetteer (subject) — compiled from geo_pins rows
// ---------------------------------------------------------------------------
interface GeoEntry {
  type: string; lng: number; lat: number; name_en: string; name_jp: string;
  terms: { term: string; jp: boolean; matchRe: RegExp | null; ctxRe: RegExp }[];
  maxLen: number;
  demonym?: boolean;   // (#R27) low-confidence adjective match → docked in scoreGeo
}
function compileGeo(rows: any[]): GeoEntry[] {
  const list: GeoEntry[] = (rows || []).map((r) => {
    const terms = (r.terms || []).map((term: string) => {
      const jp = isCJK(term), e = esc(term);
      return {
        term, jp,
        matchRe: jp ? null : new RegExp(`\\b${e}\\b`, "i"),
        ctxRe: jp ? new RegExp(`${e}(?:で|へ|に|を|から|では)`)
                  : new RegExp(`\\b(?:in|at|to|from|near|into)\\s+${e}\\b`, "i"),
      };
    });
    return {
      type: r.type, lng: r.lng, lat: r.lat, name_en: r.name_en, name_jp: r.name_jp || r.name_en,
      terms, maxLen: Math.max(1, ...(r.terms || []).map((t: string) => t.length)),
    };
  });
  // longer keywords first → "Tel Aviv" beats "Israel" (stable tiebreaker)
  list.sort((a, b) => b.maxLen - a.maxLen);
  return list;
}
function scoreGeo(g: GeoEntry, title: string, desc: string): number {
  let titleHit = false, descHit = false, ctx = false;
  for (const t of g.terms) {
    if (t.jp ? title.includes(t.term) : t.matchRe!.test(title)) { titleHit = true; if (!ctx && t.ctxRe.test(title)) ctx = true; }
    if (desc && (t.jp ? desc.includes(t.term) : t.matchRe!.test(desc))) { descHit = true; if (!ctx && t.ctxRe.test(desc)) ctx = true; }
  }
  if (!titleHit && !descHit) return 0;
  // (#R27) corroboration bonus (title AND desc) + demonym penalty so explicit places always outrank a demonym.
  const corro = (titleHit && descHit) ? 2 : 0;
  const demPen = g.demonym ? 3 : 0;
  return (titleHit ? 10 : 0) + (descHit ? 3 : 0) + (TYPE_SCORE[g.type] || 0) + (ctx ? 4 : 0) + corro - demPen;
}

// (#R27) Compile the demonym dictionary into low-confidence GeoEntry rows appended to the gazetteer.
function compileDemonyms(): GeoEntry[] {
  return Object.entries(DEMONYM_DICT).map(([dem, v]) => {
    const e = esc(dem);
    return {
      type: "country", lng: v[0], lat: v[1], name_en: v[2], name_jp: v[3], demonym: true,
      maxLen: dem.length,
      terms: [{ term: dem, jp: false, matchRe: new RegExp(`\\b${e}\\b`, "i"), ctxRe: new RegExp(`\\b(?:in|at|to|from|near|into)\\s+${e}\\b`, "i") }],
    };
  });
}

// Publisher matcher — longest key first, word-boundary for Latin, substring for CJK.
const PUB_MATCHERS = Object.entries(SOURCE_DICT)
  .map(([k, loc]) => ({ label: k, loc, cjk: isCJK(k), re: isCJK(k) ? null : new RegExp(`\\b${esc(k)}\\b`, "i") }))
  .sort((a, b) => b.label.length - a.label.length);
function matchPublisher(pub: string) {
  if (!pub) return null;
  for (const m of PUB_MATCHERS) if (m.cjk ? pub.includes(m.label) : m.re!.test(pub)) return m;
  return null;
}

function shortLabel(title: string, lang: string): string {
  if (lang === "jp") return title.length > 20 ? title.slice(0, 20) + "…" : title;
  return title.split(" ").slice(0, 5).join(" ") + "…";
}
function safeISO(s: string, fallback: string): string {
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : fallback;
}

// ---------------------------------------------------------------------------
//  Optional LLM geocoding for whatever the dictionary missed
// ---------------------------------------------------------------------------
async function llmGeocode(unmapped: { i: number; title: string }[], lang: string) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key || !unmapped.length) return new Map<number, { lng: number; lat: number; name: string }>();
  const result = new Map<number, { lng: number; lat: number; name: string }>();
  const batch = unmapped.slice(0, 40); // cap cost per run
  const list = batch.map((u) => `${u.i}. ${u.title}`).join("\n");
  const sys = "You geolocate news headlines. For each numbered headline, return the single most relevant real-world place (city/region/country) the story is ABOUT. Reply with ONLY a JSON array: [{\"i\":<number>,\"lat\":<deg>,\"lng\":<deg>,\"name\":\"<place>\"}]. Omit a headline if there is no clear geographic subject.";
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
        temperature: 0,
        messages: [{ role: "system", content: sys }, { role: "user", content: list }],
      }),
    });
    if (!r.ok) return result;
    const j = await r.json();
    let txt = j?.choices?.[0]?.message?.content || "";
    txt = txt.replace(/```json/gi, "").replace(/```/g, "");
    const arr = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1));
    for (const e of arr) {
      const i = Number(e.i), lat = Number(e.lat), lng = Number(e.lng);
      if (Number.isFinite(i) && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
        result.set(i, { lat, lng, name: String(e.name || "").slice(0, 80) });
    }
  } catch (_) { /* degrade silently — dictionary result still stands */ }
  return result;
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------
async function fetchEdition(topic: string, q: string): Promise<RawItem[]> {
  const url = `https://news.google.com/rss/headlines/section/topic/${TOPIC_PATH[topic] || "WORLD"}?${q}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (IntMap news refresher)" } });
    if (!r.ok) return [];
    return parseRss(await r.text());
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Optional shared-secret guard (set REFRESH_SECRET to lock the endpoint down).
  const secret = Deno.env.get("REFRESH_SECRET");
  if (secret) {
    const got = req.headers.get("x-refresh-secret") || new URL(req.url).searchParams.get("secret");
    if (got !== secret) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Gazetteer straight from the table the client also uses.
  const { data: geoRows, error: geoErr } = await db.from("geo_pins").select("type,terms,name_en,name_jp,lng,lat");
  if (geoErr) console.warn("[refresh-news] geo_pins read failed:", geoErr.message);
  // (#R27) gazetteer = geo_pins + the embedded demonym entries (low-confidence, docked in scoreGeo).
  const geo = compileGeo(geoRows || []).concat(compileDemonyms());

  const fetchedAt = new Date().toISOString();
  const counts: Record<string, number> = {};

  for (const ed of EDITIONS) {
    const byLink = new Map<string, RawItem & { topic: string }>();
    for (const tp of ed.topics) {
      for (const it of await fetchEdition(tp.topic, tp.q)) {
        if (it.link && !byLink.has(it.link)) byLink.set(it.link, { ...it, topic: tp.topic });
      }
    }
    const items = [...byLink.values()]
      .sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0))
      .slice(0, MAX_ITEMS);

    const rows = items.map((it) => {
      // Google News title = "Headline - Publisher"; prefer the explicit <source>.
      const sp = it.title.split(" - ");
      const publisher = it.source || (sp.length > 1 ? sp[sp.length - 1] : (ed.lang === "en" ? "News" : "報道"));
      const title = it.source ? it.title.replace(new RegExp("\\s*-\\s*" + esc(it.source) + "\\s*$"), "") : (sp.length > 1 ? sp.slice(0, -1).join(" - ") : it.title);
      const desc = it.description || "";

      // Subject — best-scoring gazetteer entry over title + description.
      let best: GeoEntry | null = null, bestScore = 0;
      for (const g of geo) {
        const s = scoreGeo(g, title, desc);
        if (s <= 0) continue;
        if (s > bestScore || (s === bestScore && (!best || (TYPE_LOCAL[g.type] || 0) > (TYPE_LOCAL[best.type] || 0)))) { best = g; bestScore = s; }
      }
      const pm = matchPublisher(publisher);
      return {
        lang: ed.lang, topic: it.topic, title, publisher, link: it.link,
        pub_date: safeISO(it.pubDate, fetchedAt),
        description: desc.slice(0, 600),
        subject_lng: best ? best.lng : null, subject_lat: best ? best.lat : null,
        subject_name_en: best ? best.name_en : null, subject_name_jp: best ? best.name_jp : null,
        mapped: !!best,
        pub_lng: pm ? pm.loc[0] : null, pub_lat: pm ? pm.loc[1] : null, pub_label: pm ? pm.label : null,
        short_en: shortLabel(title, "en"), short_jp: shortLabel(title, "jp"),
        fetched_at: fetchedAt,
      };
    });

    // LLM fallback for unmatched subjects (optional).
    const unmapped = rows.map((r, i) => ({ i, title: r.title, mapped: r.mapped })).filter((x) => !x.mapped);
    if (unmapped.length) {
      const geoMap = await llmGeocode(unmapped.map((u) => ({ i: u.i, title: u.title })), ed.lang);
      for (const [i, g] of geoMap) {
        rows[i].subject_lng = g.lng; rows[i].subject_lat = g.lat;
        rows[i].subject_name_en = rows[i].subject_name_en || g.name;
        rows[i].subject_name_jp = rows[i].subject_name_jp || g.name;
        rows[i].mapped = true;
      }
    }

    if (rows.length) {
      // Upsert by (lang, link), then drop anything from a previous run for this lang.
      const { error: upErr } = await db.from("current_news").upsert(rows, { onConflict: "lang,link" });
      if (upErr) { console.error("[refresh-news] upsert failed:", upErr.message); continue; }
      await db.from("current_news").delete().eq("lang", ed.lang).lt("fetched_at", fetchedAt);
      counts[ed.lang] = rows.length;
    }
  }

  return new Response(JSON.stringify({ ok: true, fetchedAt, counts }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
