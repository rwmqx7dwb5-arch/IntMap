/* ============================================================================
 *  IntMap · RUSSIA — the State Duma, on the 225 single-mandate district map   (#R584)
 * ----------------------------------------------------------------------------
 *  ══ WHAT THIS PACK ACTUALLY CARRIES, AND WHY IT IS NOT WHAT IT LOOKS LIKE ═══════════════════
 *  ⚠ THE COLOUR HERE IS THE PARTY-LIST VOTE, NOT THE SEAT. Half the Duma is elected in the 225
 *  single-mandate districts drawn below and half from one federal party list, and the two are
 *  counted on two different ballot papers. Measured on 2026-09-09: the only machine-readable
 *  precinct-level record of either — Shpilkin/Kobak's scrape of the Central Election Commission —
 *  contains the FEDERAL LIST ballot only (its columns are the fourteen registered parties; there is
 *  no candidate column and no second file in that repository that has one). The single-mandate
 *  CANDIDATE results exist only on vybory.izbirkom.ru as per-district HTML.
 *
 *  So this pack does the one thing it can do honestly: it aggregates the federal-list ballot over
 *  the territory of each single-mandate district and says so — in the chamber name, in the note the
 *  legend prints under the bars, and here. It does NOT claim to name the member who took the seat.
 *  Writing 「United Russia won this district」 from a party-list plurality would be a different and
 *  unverified statement, and #R543 measured what happens when a layer states one number and means
 *  another.
 *
 *  ⚠ THE DISTRICTS ARE THE SAME MAP IN 2016 AND 2021 and that is a fact about the upstream, not an
 *  assumption: the publisher's own resource tree calls this scheme 「2016 - 2025」 and keeps the
 *  redrawn one for 2026 onwards in a separate group. Both elections therefore share one geo file,
 *  which is the whole point of the era/election split in scripts/lib/elections-schema.mjs.
 * ==========================================================================*/
import { mapCoords, simplifyGeoJSON, webMercatorToWgs84, zipEntries } from '../lib/elections-geo.mjs';

export const about = 'Russia — State Duma federal-list vote over the 225 single-mandate districts (2016, 2021)';

/* ── the sources ───────────────────────────────────────────────────────────────────────────────
   ⚠ THE BOUNDARY RESOURCE NUMBER IS A CHOICE AND IT WAS MEASURED. The publisher offers the same
   225 districts at five detail levels; on 2026-09-09 the unsimplified layer (resource 76) is
   137 MB and did not finish in ten minutes, resource 27 is 15.6 MB, 28 is 2.0 MB and 29 is 0.5 MB.
   27 is therefore the highest detail that a build can actually pull, and the vertices that survive
   are thinned here rather than upstream. If a future run wants more, 76 is the same geometry. */
const GEO_URL = 'https://duma2016.nextgis.com/api/resource/27/geojson';
const RESULTS_URL = (y) => 'https://raw.githubusercontent.com/dkobak/elections/master/data/' + y + '.csv.zip';

/* ⚠ TOLERANCE IN DEGREES, AND WHY THIS ONE. 0.005° of latitude is 555 m, which is 1.6 px at zoom 8
   — the zoom at which one of these districts fills the screen — so the thinning is at or below the
   width of the boundary line everywhere a reader can see it. Measured 2026-09-09: 15.6 MB raw
   → 5.87 MB rounded only → 2.81 MB at this tolerance. It becomes wrong if the layer is ever drawn
   at street zoom, which an electoral choropleth is not. */
const TOLERANCE = 0.005;

const SRC = 'Districts: GIS-Lab / NextGIS, from OpenStreetMap administrative boundaries and Federal ' +
  'Law 300-ФЗ. Results: Sergey Shpilkin / Dmitry Kobak, scraped from the Central Election Commission ' +
  'of the Russian Federation.';
/* ⚠ NEITHER UPSTREAM STATES A LICENCE, AND THAT IS RECORDED RATHER THAN GUESSED AWAY. The boundary
   service carries no licence notice at all (measured 2026-09-09); because it is derived from
   OpenStreetMap it is treated here as ODbL 1.0, which is the licence OSM's own share-alike term
   would impose on a derived database in any case. The results repository has no LICENSE file. */
const LIC = 'Districts: no licence is stated; derived from OpenStreetMap, so treated as ODbL 1.0 ' +
  '(© OpenStreetMap contributors). Results: no licence is stated; a third-party aggregation of ' +
  'figures published by the Central Election Commission.';

/* ── party identity ────────────────────────────────────────────────────────────────────────────
   ⚠ THE LIST OF PARTIES IS NOT WRITTEN DOWN. It is the set of columns whose header begins with the
   ballot position — 「4. Всероссийская политическая партия "ЕДИНАЯ РОССИЯ"」 — so a year with a
   different ballot contributes different parties without this file changing. What CANNOT be
   discovered is a colour: no upstream publishes one. The table below therefore holds only the two
   things a machine cannot derive, keyed by the party's own legal name with the punctuation and the
   ballot number removed so that 2016's hyphen and 2021's en dash in 「ЛДПР – Либерально-…」 are the
   same key. Anything the table does not know is still carried, with its full legal name and a
   colour derived from that name: a new party is never silently dropped (#R538 measured the layer
   where it was).
   Observed 2026-09-09 from the colours Russian broadcasters and the parties themselves use; it
   expires if a party changes its own livery, which costs nothing but recognition. */
const KNOWN = [
  { key: 'ВСЕРОССИЙСКАЯПОЛИТИЧЕСКАЯПАРТИЯЕДИНАЯРОССИЯ', slug: 'er', col: '#0057b8', en: 'United Russia' },
  { key: 'ПОЛИТИЧЕСКАЯПАРТИЯКОММУНИСТИЧЕСКАЯПАРТИЯРОССИЙСКОЙФЕДЕРАЦИИ', slug: 'kprf', col: '#d40000', en: 'Communist Party (KPRF)' },
  { key: 'ПОЛИТИЧЕСКАЯПАРТИЯЛДПРЛИБЕРАЛЬНОДЕМОКРАТИЧЕСКАЯПАРТИЯРОССИИ', slug: 'ldpr', col: '#005fce', en: 'LDPR' },
  { key: 'ПОЛИТИЧЕСКАЯПАРТИЯСПРАВЕДЛИВАЯРОССИЯ', slug: 'sr', col: '#ffcc00', en: 'A Just Russia' },
  { key: 'ПАРТИЯСПРАВЕДЛИВАЯРОССИЯЗАПРАВДУ', slug: 'srzp', col: '#ffcc00', en: 'A Just Russia — For Truth' },
  { key: 'ПОЛИТИЧЕСКАЯПАРТИЯНОВЫЕЛЮДИ', slug: 'nl', col: '#00b0f0', en: 'New People' },
  { key: 'ВСЕРОССИЙСКАЯПОЛИТИЧЕСКАЯПАРТИЯРОДИНА', slug: 'rodina', col: '#8b0000', en: 'Rodina' },
  { key: 'ПОЛИТИЧЕСКАЯПАРТИЯРОССИЙСКАЯОБЪЕДИНЕННАЯДЕМОКРАТИЧЕСКАЯПАРТИЯЯБЛОКО', slug: 'yabloko', col: '#4caf50', en: 'Yabloko' },
];

/* Cyrillic → Latin, so that a party the table does not know still gets a readable, stable id
   instead of a serial number. This is a transliteration RULE, not a list of party names. */
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
const slugify = (s) => s.toLowerCase().split('').map(c => (TRANSLIT[c] != null ? TRANSLIT[c] : c))
  .join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'party';

/* A colour for a party nobody has a colour for: a hue taken from the name, at a fixed saturation
   and lightness so that every derived colour sits at the same weight as the known ones. */
function derivedColour(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const hue = h % 360, s = 0.45, l = 0.45;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/** The stable identity of a ballot line: its legal name with the ballot position, the quotation
 *  marks and every dash removed. Two years spell the same party differently; this is what makes
 *  them one entry in the party table instead of two. */
const partyKey = (header) => header.replace(/^\s*\d+\.\s*/, '').toUpperCase().replace(/[^А-ЯЁA-Z0-9]/g, '');

/* ── CSV ───────────────────────────────────────────────────────────────────────────────────────
   The 2016 file is 41 MB and the 2021 file 33 MB, both with quoted headers that contain commas, so
   a split on commas produces a plausible and completely wrong table. This is the ordinary RFC 4180
   reader; rows are handed to a callback so that neither file is ever held twice. */
function eachCsvRow(text, onRow) {
  let i = 0, field = '', row = [], inQ = false, header = null;
  const n = text.length;
  const endRow = () => {
    row.push(field); field = '';
    if (!header) header = row; else onRow(row, header);
    row = [];
  };
  while (i < n) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQ = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    field += ch; i++;
  }
  if (field.length || row.length) endRow();
  return header;
}

/* ── the home box ──────────────────────────────────────────────────────────────────────────────
   ⚠ RUSSIA CROSSES THE ANTIMERIDIAN, so the naïve bounding box of its coordinates is the whole
   world: Chukotka's few degrees east of 180° drag the western edge to −180 and the map opens on the
   Pacific. The box is therefore computed twice — once as it stands and once with negative
   longitudes unwrapped past 180 — and the narrower of the two wins, then is clipped to the
   antimeridian. For a country that does not cross it the two are identical, so this is one rule
   rather than a special case for one country. */
function homeBox(fc) {
  let s = 90, n = -90, w0 = 180, e0 = -180, w1 = 360, e1 = -360;
  const visit = (c) => {
    if (typeof c[0] === 'number') {
      const [x, y] = c;
      if (y < s) s = y; if (y > n) n = y;
      if (x < w0) w0 = x; if (x > e0) e0 = x;
      const u = x < 0 ? x + 360 : x;
      if (u < w1) w1 = u; if (u > e1) e1 = u;
      return;
    }
    c.forEach(visit);
  };
  for (const f of fc.features) if (f.geometry) visit(f.geometry.coordinates);
  const useUnwrapped = (e1 - w1) < (e0 - w0);
  const west = useUnwrapped ? w1 : w0;
  const east = Math.min(useUnwrapped ? e1 : e0, 180);
  return [[west, s], [east, n]];
}

export async function build(ctx) {
  /* ── the districts ─────────────────────────────────────────────────────────────────────────
     ⚠ EPSG:3857 METRES. The file declares the CRS and the first coordinate is 4400332.73,
     5591944.79; handing those to the map does not throw, it draws Russia in the Gulf of Guinea. */
  const fc = await ctx.get(GEO_URL, { json: true });
  mapCoords(fc, webMercatorToWgs84);

  const geoId = 'ru-oik-2016.geo.json';
  const codes = new Set();
  for (const f of fc.features) {
    const p = f.properties || {};
    const num = Number(p.okrug);
    if (!Number.isInteger(num) || num < 1) throw new Error('ru: a district polygon has no okrug number');
    const cd = String(num);
    if (codes.has(cd)) throw new Error('ru: two polygons claim district ' + cd);
    codes.add(cd);
    /* The publisher's name is 「<federal subject> - <district> одномандатный избирательный округ」.
       There is no English form of it anywhere upstream, so English readers get the description the
       number itself supports and the popup shows the Russian name underneath it (`alt` in
       js/elections.js prints the native form whenever it differs from the one chosen). */
    f.properties = {
      cd,
      n: { native: String(p.wiki_name || '').replace(/\s+/g, ' ').trim(), en: 'Single-mandate district No. ' + num },
    };
  }
  if (codes.size !== 225) throw new Error('ru: expected 225 single-mandate districts, got ' + codes.size);
  simplifyGeoJSON(fc, { tolerance: TOLERANCE, decimals: 5 });

  /* ── the ballots ───────────────────────────────────────────────────────────────────────────── */
  const parties = {};
  const elections = [];
  const res = {};

  /* Both files are precinct-level. The single-mandate district a precinct belongs to is the only
     column this pack reads besides the party columns, and both years write it with the number
     first — 「1 Республика Адыгея (Адыгея) - Адыгейский」 in 2016, 「ОИК №39」 in 2021 — so the
     number is taken from the field rather than the field being parsed as a name. */
  for (const year of [2016, 2021]) {
    const entries = zipEntries(await ctx.get(RESULTS_URL(year)));
    const csv = [...entries.values()].find(b => b.length > 1024);
    if (!csv) throw new Error('ru ' + year + ': the archive holds no csv');

    const perDistrict = new Map();          /* cd → number[] parallel to the party columns */
    let cols = null, ids = null, nat = null;
    const header = eachCsvRow(csv.toString('utf8'), (row, hdr) => {
      if (!cols) {
        cols = hdr.map((h, i) => [i, h]).filter(([, h]) => /^\s*\d+\.\s/.test(h));
        if (!cols.length) throw new Error('ru ' + year + ': no party columns in the header');
        ids = cols.map(([, h]) => {
          const key = partyKey(h);
          const known = KNOWN.find(k => k.key === key);
          const native = h.replace(/^\s*\d+\.\s*/, '').trim();
          const id = 'ru:' + (known ? known.slug : slugify(native));
          if (!parties[id]) {
            parties[id] = {
              n: known ? { en: known.en, ru: native, native } : { en: native, native },
              col: known ? known.col : derivedColour(key),
            };
          }
          return id;
        });
        nat = cols.map(() => 0);
      }
      const oikCell = row[hdr.indexOf('oik')] || '';
      const num = (oikCell.match(/\d+/) || [])[0];
      if (!num) throw new Error('ru ' + year + ': a precinct row carries no district number');
      let acc = perDistrict.get(num);
      if (!acc) { acc = cols.map(() => 0); perDistrict.set(num, acc); }
      for (let k = 0; k < cols.length; k++) {
        /* ⚠ AN ABSENT NUMBER IS ABSENT, NOT ZERO — but a blank cell in a precinct protocol is a
           genuine zero for that party at that precinct, and every row of these files is a complete
           protocol. A cell that is not a number at all is a broken file, not a zero. */
        const raw = row[cols[k][0]];
        const v = raw === '' || raw == null ? 0 : Number(raw);
        if (!Number.isFinite(v)) throw new Error('ru ' + year + ': non-numeric vote «' + raw + '»');
        acc[k] += v; nat[k] += v;
      }
    });
    if (!header) throw new Error('ru ' + year + ': empty csv');
    if (perDistrict.size !== codes.size) {
      throw new Error('ru ' + year + ': ' + perDistrict.size + ' districts in the results, ' + codes.size + ' on the map');
    }

    const d = {};
    for (const [cd, acc] of perDistrict) {
      if (!codes.has(cd)) throw new Error('ru ' + year + ': results name district ' + cd + ', the map does not have it');
      const c = acc.map((v, k) => ({ n: parties[ids[k]].n.native, p: ids[k], v }))
        .filter(x => x.v > 0)
        .sort((a, b) => b.v - a.v);
      const total = acc.reduce((a, b) => a + b, 0);
      /* The protocol defines the number of valid ballots as the sum of the party lines, so `t` is
         that sum rather than a separately-scraped column whose Russian heading would have to be
         spelled out here. */
      d[cd] = { w: c.length ? c[0].p : null, c, t: total };
      if (!c.length) delete d[cd].w;
    }

    const natTotal = nat.reduce((a, b) => a + b, 0);
    const resId = 'ru-duma-' + year + '.res.json';
    res[resId] = {
      d,
      /* ⚠ NO SEAT COUNTS. The chamber's composition is not derivable from this ballot — 225 of the
         450 seats were won by candidates whose results are not in any machine-readable record this
         build can reach, and the other 225 are allocated from these votes by a quota this pack does
         not attempt to reproduce. What IS exact is each party's national share of the ballot that
         was counted, so that is what the bars carry, and the note says so. */
      n: Object.keys(parties)
        .filter(id => ids.includes(id))
        .map(id => ({ p: id, pct: natTotal ? nat[ids.indexOf(id)] / natTotal * 100 : 0 }))
        .sort((a, b) => b.pct - a.pct),
    };

    elections.push({
      id: 'ru-duma-' + year,
      polity: 'ru',
      body: {
        en: 'State Duma — party-list vote', native: 'Государственная дума — федеральный округ',
        ru: 'Государственная дума — федеральный округ',
        ja: '国家院 — 比例代表', de: 'Staatsduma — Listenstimme', es: 'Duma Estatal — voto de lista',
        fr: 'Douma d’État — scrutin de liste', ko: '국가두마 — 정당명부 득표',
        'zh-Hant': '國家杜馬 — 政黨名單得票', 'zh-Hans': '国家杜马 — 政党名单得票',
      },
      /* 2016-09-18 and 2021-09-19 are the polling days; 2021 polled over three days and the
         record is the last of them, which is the day the count began. */
      date: year === 2016 ? '2016-09-18' : '2021-09-19',
      y: year,
      geo: geoId,
      res: resId,
      seatsTotal: 450, districtSeats: 225, listSeats: 225,
      /* ⚠ A NOTE IS A NAME TABLE, NOT A STRING: it is prose the reader reads in the legend, so it
         obeys AGENTS.md §3.5 and exists in all nine languages. `src` and `lic` do not — an
         attribution line is the publisher's own wording and a licence is a legal condition.
         ⚠ WHAT THE COLOUR IS NOT IS THE WHOLE POINT OF THIS NOTE, so no translation is allowed to
         soften it: a reader who takes the fill for «the member who won this seat» is reading a
         different election from the one this map draws.
         ⚠ `jp` AND `ja` BOTH: 'jp' is the app's own code for Japanese (js/lang-registry.js) and the
         key js/elections.js looks up; 'ja' is the BCP-47 tag the rest of this data uses. */
      note: (() => {
        const jp = '色は、その選挙区内の連邦比例名簿票で首位となった政党であり、その選挙区の議席を得た議員では' +
          'ありません。中央選挙管理委員会は小選挙区候補の結果を選挙区ごとのウェブページとしてしか公表しておらず、' +
          '機械可読の記録は存在しません。バーは全国の有効な名簿票に占める各党の割合で、議席の割合でも投じられた' +
          '全票の割合でもありません（委員会自身の公表値は、無効票を含む投票用紙数で割っています）。450 議席の' +
          '下院は、半分が比例名簿の議席、半分が小選挙区の議席です。';
        return {
          en: 'The colour is the party that led the FEDERAL PARTY-LIST ballot inside this district, ' +
            'not the member who won its seat: the Central Election Commission publishes the ' +
            'single-mandate candidate results only as per-district web pages, and no machine-readable ' +
            'record of them exists. The bars are each party’s share of the valid list ballots ' +
            'nationally — not of the seats, and not of every ballot cast: the commission’s own ' +
            'headline percentage divides by the papers in the boxes, invalid ones included. The ' +
            '450-seat chamber is half list seats and half single-mandate seats.',
          ja: jp, jp,
          de: 'Die Farbe zeigt die Partei, die in diesem Wahlkreis bei der FÖDERALEN LISTENSTIMME vorn ' +
            'lag — nicht das Mitglied, das den Sitz gewonnen hat: Die Zentrale Wahlkommission ' +
            'veröffentlicht die Ergebnisse der Direktkandidaten nur als Webseite je Wahlkreis, ein ' +
            'maschinenlesbarer Datensatz existiert nicht. Die Balken zeigen den Anteil jeder Partei an ' +
            'den gültigen Listenstimmen im ganzen Land — nicht an den Sitzen und nicht an allen ' +
            'abgegebenen Stimmzetteln: Die Kommission selbst teilt durch alle Zettel in den Urnen, ' +
            'ungültige eingeschlossen. Die Kammer mit 450 Sitzen besteht zur Hälfte aus Listen- und zur ' +
            'Hälfte aus Direktmandaten.',
          ru: 'Цвет — партия, лидировавшая в этом округе по ФЕДЕРАЛЬНОМУ ПАРТИЙНОМУ СПИСКУ, а не ' +
            'депутат, победивший в округе: результаты кандидатов по одномандатным округам ЦИК ' +
            'публикует только отдельными веб-страницами, машиночитаемой записи о них не существует. ' +
            'Полосы — доля каждой партии от действительных бюллетеней по спискам в целом по стране, а ' +
            'не от мест и не от всех поданных бюллетеней: собственный итоговый процент комиссии ' +
            'считается от всех бюллетеней в ящиках, включая недействительные. Палата из 450 мест ' +
            'наполовину состоит из списочных мест и наполовину из одномандатных.',
          es: 'El color indica el partido que encabezó la papeleta de la LISTA FEDERAL dentro de esta ' +
            'circunscripción, no el diputado que ganó su escaño: la Comisión Electoral Central publica ' +
            'los resultados de los candidatos uninominales solo como páginas web por circunscripción y ' +
            'no existe ningún registro legible por máquina. Las barras son la proporción de cada ' +
            'partido sobre las papeletas de lista válidas en todo el país, no sobre los escaños ni ' +
            'sobre todas las papeletas emitidas: el porcentaje que publica la propia comisión divide ' +
            'entre todas las papeletas depositadas, nulas incluidas. La cámara de 450 escaños es mitad ' +
            'de lista y mitad uninominal.',
          fr: 'La couleur indique le parti arrivé en tête du scrutin de LISTE FÉDÉRALE dans cette ' +
            'circonscription, et non le député qui y a remporté le siège : la Commission électorale ' +
            'centrale ne publie les résultats des candidats au scrutin uninominal que sous forme de ' +
            'pages web par circonscription, sans aucun enregistrement exploitable par une machine. Les ' +
            'barres représentent la part de chaque parti dans les bulletins de liste valables au ' +
            'niveau national — ni la part des sièges, ni celle de tous les bulletins déposés : le ' +
            'pourcentage publié par la commission elle-même rapporte les voix à tous les bulletins ' +
            'déposés, nuls compris. La chambre de 450 sièges est pour moitié élue au scrutin de liste ' +
            'et pour moitié au scrutin uninominal.',
          ko: '색은 이 선거구 안에서 연방 정당명부 투표 1위를 차지한 정당이며, 그 선거구의 의석을 얻은 ' +
            '의원이 아닙니다. 중앙선거관리위원회는 소선거구 후보의 결과를 선거구별 웹페이지로만 공개하며, ' +
            '기계가 읽을 수 있는 기록은 존재하지 않습니다. 막대는 전국의 유효한 명부 투표에서 각 정당이 ' +
            '차지한 비율이며, 의석 비율도 투표된 모든 표의 비율도 아닙니다(위원회 자체 발표 수치는 무효표를 ' +
            '포함한 투표용지 수로 나눕니다). 450석의 하원은 절반이 명부 의석, 절반이 소선거구 의석입니다.',
          zh: '顏色代表在這個選區內聯邦政黨名單票得票最高的政黨，而不是贏得該選區議席的議員：中央選舉' +
            '委員會只以各選區的網頁公布單一席次候選人的結果，沒有任何機器可讀的記錄。長條圖是各政黨在全國' +
            '有效名單票中所占的比例，而不是議席比例，也不是所有投出選票的比例——委員會自己公布的百分比是' +
            '以票箱中的全部選票（含無效票）為分母。450 席的國家杜馬一半為名單議席，一半為單一席次議席。',
          'zh-hans': '颜色代表在这个选区内联邦政党名单票得票最高的政党，而不是赢得该选区议席的议员：中央' +
            '选举委员会只以各选区的网页公布单一席次候选人的结果，没有任何机器可读的记录。条形图是各政党在' +
            '全国有效名单票中所占的比例，而不是议席比例，也不是所有投出选票的比例——委员会自己公布的百分比' +
            '是以票箱中的全部选票（含无效票）为分母。450 席的国家杜马一半为名单议席，一半为单一席次议席。',
        };
      })(),
      src: SRC, lic: LIC,
    });
  }

  return {
    polities: [{
      id: 'ru',
      n: {
        en: 'Russia', native: 'Россия', ru: 'Россия', ja: 'ロシア', de: 'Russland', es: 'Rusia',
        fr: 'Russie', ko: '러시아', 'zh-Hant': '俄羅斯', 'zh-Hans': '俄罗斯',
      },
      home: homeBox(fc),
    }],
    parties,
    elections,
    geo: { [geoId]: fc },
    res,
  };
}
