/* ============================================================================
 *  IntMap · company atlas DATA ACCESS — IntMapCompanyData
 * ----------------------------------------------------------------------------
 *  The one way in to data/companies/. Two shapes, fetched at two different times:
 *
 *    index()        data/companies/index.json — one light row per company. Fetched
 *                   ONCE, the first time anything asks. ~500 rows.
 *    profile(id)    data/companies/profiles/<id>.json — the whole profile plus
 *                   every facility, fetched ONLY when that company is opened and
 *                   then kept. Nothing loads 500 companies' facilities.
 *
 *  ⚠ THIS FILE IS LAZY. src/main.js does not import it; js/lazy-modules.js does,
 *  under the name 'companyData'. Callers say `await IntMapLazy.need('companyData')`.
 *  Putting it in the entry would move ~500 companies of index into the boot bundle
 *  for a tab most sessions never open — see docs/COMPANIES.md §3.
 *
 *  ⚠ The literal 'data/companies/profiles/' below is what scripts/asset-report.mjs
 *  reads to classify the whole directory as `prefix` rather than `orphan`. The
 *  string must stay a literal prefix in this file.
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.companyData = function (HOST) {
  const API = (function () {
    const INDEX_URL = 'data/companies/index.json';
    const PROFILE_DIR = 'data/companies/profiles/';
    const STORE_DIR = 'data/companies/stores/';

    let _indexP = null;
    let _index = null;
    const _byId = new Map();
    const _byTicker = new Map();
    const _profiles = new Map();       /* id -> profile object (kept for the session) */
    const _profileP = new Map();       /* id -> in-flight promise (never fetch twice) */
    const _stores = new Map();

    /* ── the six map groups (docs/COMPANIES.md §5.1) ──────────────────────────
       `type` may grow without touching the legend, because the legend reads the
       group, not the type. An unknown type is 'other', never dropped. */
    const GROUP_OF = {
      headquarters: 'hq', secondary_headquarters: 'hq', regional_headquarters: 'hq',
      office: 'office', branch: 'office', subsidiary_office: 'office', sales_office: 'office',
      factory: 'factory', assembly_plant: 'factory', refinery: 'factory', smelter: 'factory',
      shipyard: 'factory', brewery: 'factory', mine: 'factory', power_plant: 'factory',
      research: 'rnd', rnd_center: 'rnd', tech_center: 'rnd', laboratory: 'rnd',
      test_facility: 'rnd', design_center: 'rnd',
      logistics: 'logistics', distribution_center: 'logistics', warehouse: 'logistics',
      data_center: 'logistics', port_terminal: 'logistics',
      store: 'other', museum: 'other', training_center: 'other', other: 'other',
    };
    const GROUPS = ['hq', 'office', 'factory', 'rnd', 'logistics', 'other'];
    const groupOf = (f) => (f && (f.group || GROUP_OF[f.type])) || 'other';


    /* ══ THE FACILITY VOCABULARY — ONE COPY, HERE ════════════════════════════════════════════════
       ⚠ It lived twice: js/company-panel.js and js/company-facilities.js each carried the same 30
       type labels and the six group labels, and the two copies had ALREADY DRIFTED before either
       shipped — "Data centre" against "Data center", "Offices" against "Office". The app's existing
       spelling is American (js/datacenters.js ships `Data center`, translated in all nine
       languages) and a second spelling would have opened a second translation row for one concept,
       which is how one of them goes stale (#R323). Both modules read these and nothing else.

       `type` may grow without touching the map, because the map colours by `group`; and it may grow
       without touching this table, because an unknown token humanises itself rather than taking a
       wrong label. */
    const LANG = () => { try { return HOST.lang; } catch (_) { return 'en'; } };
    const L = (function () { try { return window.IntMapLang.pick(LANG); } catch (_) { return (en) => en; } }());
    const LA = (function () { try { return window.IntMapLang.pickArgs(); } catch (_) { return (...a) => a; } }());

    const TYPE_L = {
      headquarters: LA('Headquarters', '本社', 'Hauptsitz', 'Штаб-квартира', 'Sede'),
      secondary_headquarters: LA('Secondary headquarters', '第二本社', 'Zweiter Hauptsitz', 'Второй головной офис', 'Sede secundaria'),
      regional_headquarters: LA('Regional headquarters', '地域統括本社', 'Regionale Zentrale', 'Региональная штаб-квартира', 'Sede regional'),
      office: LA('Office', '事業所', 'Büro', 'Офис', 'Oficina'),
      branch: LA('Branch', '支店', 'Niederlassung', 'Филиал', 'Sucursal'),
      subsidiary_office: LA('Subsidiary office', '子会社事業所', 'Büro einer Tochtergesellschaft', 'Офис дочерней компании', 'Oficina de filial'),
      sales_office: LA('Sales office', '営業所', 'Vertriebsbüro', 'Отдел продаж', 'Oficina comercial'),
      factory: LA('Factory', '工場', 'Werk', 'Завод', 'Fábrica'),
      assembly_plant: LA('Assembly plant', '組立工場', 'Montagewerk', 'Сборочный завод', 'Planta de ensamblaje'),
      refinery: LA('Refinery', '製油所', 'Raffinerie', 'Нефтеперерабатывающий завод', 'Refinería'),
      smelter: LA('Smelter', '製錬所', 'Schmelzhütte', 'Плавильный завод', 'Fundición'),
      shipyard: LA('Shipyard', '造船所', 'Werft', 'Верфь', 'Astillero'),
      brewery: LA('Brewery', '醸造所', 'Brauerei', 'Пивоварня', 'Cervecería'),
      mine: LA('Mine', '鉱山', 'Bergwerk', 'Рудник', 'Mina'),
      power_plant: LA('Power plant', '発電所', 'Kraftwerk', 'Электростанция', 'Central eléctrica'),
      research: LA('Research site', '研究拠点', 'Forschungsstandort', 'Научный центр', 'Centro de investigación'),
      rnd_center: LA('R&D center', '研究開発センター', 'F&E-Zentrum', 'Центр НИОКР', 'Centro de I+D'),
      tech_center: LA('Technical center', 'テクニカルセンター', 'Technisches Zentrum', 'Технический центр', 'Centro técnico'),
      laboratory: LA('Laboratory', '研究所', 'Labor', 'Лаборатория', 'Laboratorio'),
      test_facility: LA('Test facility', '試験施設', 'Versuchsanlage', 'Испытательный полигон', 'Instalación de pruebas'),
      design_center: LA('Design center', 'デザインセンター', 'Designzentrum', 'Дизайн-центр', 'Centro de diseño'),
      logistics: LA('Logistics site', '物流拠点', 'Logistikstandort', 'Логистический объект', 'Centro logístico'),
      distribution_center: LA('Distribution center', '配送センター', 'Verteilzentrum', 'Распределительный центр', 'Centro de distribución'),
      warehouse: LA('Warehouse', '倉庫', 'Lager', 'Склад', 'Almacén'),
      data_center: LA('Data center', 'データセンター', 'Rechenzentrum', 'Дата-центр', 'Centro de datos'),
      port_terminal: LA('Port terminal', '港湾ターミナル', 'Hafenterminal', 'Портовый терминал', 'Terminal portuaria'),
      store: LA('Store', '店舗', 'Geschäft', 'Магазин', 'Tienda'),
      museum: LA('Museum', '博物館', 'Museum', 'Музей', 'Museo'),
      training_center: LA('Training center', '研修センター', 'Schulungszentrum', 'Учебный центр', 'Centro de formación'),
      other: LA('Other site', 'その他の拠点', 'Sonstiger Standort', 'Прочий объект', 'Otra instalación'),
    };
    const GROUP_L = {
      hq: LA('Headquarters', '本社', 'Hauptsitz', 'Штаб-квартира', 'Sede'),
      office: LA('Offices', '事業所', 'Büros', 'Офисы', 'Oficinas'),
      factory: LA('Plants', '工場', 'Werke', 'Заводы', 'Plantas'),
      rnd: LA('R&D', '研究開発', 'F&E', 'НИОКР', 'I+D'),
      logistics: LA('Logistics', '物流', 'Logistik', 'Логистика', 'Logística'),
      other: LA('Other', 'その他', 'Sonstige', 'Прочие', 'Otros'),
    };
    /* ⚠ `presence[].kinds` is a DIFFERENT vocabulary from `group` (docs/COMPANIES.md §4.2): it says
       what KIND of presence the company has in a country, not which colour a point gets. */
    const KIND_L = {
      office: LA('Offices', '事業所', 'Büros', 'Офисы', 'Oficinas'),
      manufacturing: LA('Manufacturing', '製造', 'Fertigung', 'Производство', 'Manufactura'),
      rnd: LA('R&D', '研究開発', 'F&E', 'НИОКР', 'I+D'),
      logistics: LA('Logistics', '物流', 'Logistik', 'Логистика', 'Logística'),
      retail: LA('Retail', '小売', 'Einzelhandel', 'Розничная торговля', 'Comercio minorista'),
      corporate: LA('Corporate', '統括', 'Konzernfunktionen', 'Корпоративные функции', 'Corporativo'),
    };
    const STATUS_L = {
      operating: LA('In operation', '稼働中', 'In Betrieb', 'Действует', 'En operación'),
      /* ⚠ NOT the bare word "Closed": js/atlas-console.js already owns that English
         string for "the panel was closed", and the inline table is keyed by the English
         text — a shut factory came out as 닫힘 in Korean. */
      closed: LA('Closed permanently', '閉鎖', 'Dauerhaft geschlossen', 'Закрыт навсегда', 'Cerrado definitivamente'),
      announced: LA('Announced', '発表済み', 'Angekündigt', 'Объявлено', 'Anunciado'),
      under_construction: LA('Under construction', '建設中', 'Im Bau', 'Строится', 'En construcción'),
    };
    /* the six group colours — the map paints with them and the panel's key reads them, so the
       legend and the map cannot disagree */
    const GROUP_COLOR = { hq: '#ff9f0a', office: '#0a84ff', factory: '#ff453a', rnd: '#bf5af2', logistics: '#30d158', other: '#8e8e93' };

    const pick = (tbl, key) => { const t = tbl[key]; try { return t ? L.arr(t) : null; } catch (_) { return t ? t[0] : null; } };
    /* An unknown token is humanised, never mislabelled: `pilot_plant` prints "Pilot plant". */
    const humanise = (k) => String(k || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    const typeLabel = (k) => pick(TYPE_L, k) || humanise(k);
    const groupLabel = (k) => pick(GROUP_L, k) || humanise(k);
    const kindLabel = (k) => pick(KIND_L, k) || humanise(k);
    const statusLabel = (k) => pick(STATUS_L, k) || humanise(k);
    const groupColor = (k) => GROUP_COLOR[k] || GROUP_COLOR.other;

    /* ── index ───────────────────────────────────────────────────────────── */
    function index() {
      if (_indexP) return _indexP;
      _indexP = fetch(INDEX_URL)
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then((j) => {
          const list = (j && Array.isArray(j.companies)) ? j.companies : [];
          _index = { generatedAt: (j && j.generatedAt) || '', companies: list };
          list.forEach((c) => {
            _byId.set(c.id, c);
            if (c.tk) _byTicker.set(String(c.tk).toUpperCase(), c);
          });
          return _index;
        })
        .catch((e) => {
          /* A failed index must not become "there are no companies": the caller
             is told, and a later call retries rather than caching the failure. */
          _indexP = null;
          throw e;
        });
      return _indexP;
    }
    const indexReady = () => _index;
    const get = (id) => _byId.get(id) || null;
    const byTicker = (tk) => _byTicker.get(String(tk || '').toUpperCase()) || null;

    /* Resolve whatever the caller has — an id, a ticker, or a company name — to
       an index row. Used by the existing Companies list, whose rows are keyed by
       ticker, and by Atlas, which has only a name. */
    function resolve(key) {
      if (!key) return null;
      const s = String(key).trim();
      const direct = _byId.get(s);
      if (direct) return direct;
      const tk = _byTicker.get(s.toUpperCase());
      if (tk) return tk;
      if (!_index) return null;
      const low = s.toLowerCase();
      let hit = _index.companies.find((c) => String(c.n).toLowerCase() === low
        || String(c.ln || '').toLowerCase() === low);
      if (hit) return hit;
      hit = _index.companies.find((c) => {
        const loc = c.loc || {};
        for (const k in loc) if (String(loc[k]).toLowerCase() === low) return true;
        return false;
      });
      return hit || null;
    }

    /** Substring search over every name we hold, in every language we hold it. */
    function search(q, limit) {
      if (!_index) return [];
      const s = String(q || '').trim().toLowerCase();
      if (!s) return _index.companies.slice(0, limit || 40);
      const out = [];
      for (const c of _index.companies) {
        const hay = [c.n, c.ln, c.tk, c.dom].concat(Object.values(c.loc || {}));
        let score = -1;
        for (const h of hay) {
          if (!h) continue;
          const t = String(h).toLowerCase();
          if (t === s) { score = 3; break; }
          if (t.indexOf(s) === 0) { score = Math.max(score, 2); }
          else if (t.indexOf(s) >= 0) { score = Math.max(score, 1); }
        }
        if (score >= 0) out.push({ c, score });
      }
      out.sort((a, b) => (b.score - a.score) || (String(a.c.n).length - String(b.c.n).length));
      return out.slice(0, limit || 40).map((o) => o.c);
    }

    /* ── profile ─────────────────────────────────────────────────────────── */
    function profile(id) {
      if (!id) return Promise.reject(new Error('company id required'));
      if (_profiles.has(id)) return Promise.resolve(_profiles.get(id));
      if (_profileP.has(id)) return _profileP.get(id);
      const p = fetch(PROFILE_DIR + encodeURIComponent(id) + '.json')
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then((j) => {
          const prof = decorate(j);
          _profiles.set(id, prof);
          _profileP.delete(id);
          return prof;
        })
        .catch((e) => { _profileP.delete(id); throw e; });
      _profileP.set(id, p);
      return p;
    }
    const profileReady = (id) => _profiles.get(id) || null;

    /* Everything derived lives here, computed once per profile, so the panel and
       the map layer cannot disagree about what a company's facilities are. */
    function decorate(j) {
      const prof = j || {};
      const facs = Array.isArray(prof.facilities) ? prof.facilities : [];
      facs.forEach((f, i) => {
        f.group = groupOf(f);
        if (!f.id) f.id = (prof.id || 'co') + '-f' + i;
      });
      const byGroup = {};
      GROUPS.forEach((g) => { byGroup[g] = []; });
      facs.forEach((f) => { (byGroup[f.group] || byGroup.other).push(f); });
      const countries = [...new Set(facs.map((f) => f.cc).filter(Boolean))];
      prof.facilities = facs;
      prof._byGroup = byGroup;
      prof._groups = GROUPS.filter((g) => byGroup[g].length);
      prof._countries = countries;
      prof._hq = facs.find((f) => f.group === 'hq') || null;
      return prof;
    }

    /** GeoJSON for the map layer. `groups` (optional) filters by map group. */
    function facilityGeoJSON(prof, groups) {
      const want = (groups && groups.length) ? new Set(groups) : null;
      const feats = [];
      const facs = (prof && prof.facilities) || [];
      for (const f of facs) {
        if (!Number.isFinite(f.lon) || !Number.isFinite(f.lat)) continue;
        if (want && !want.has(f.group)) continue;
        feats.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
          properties: {
            fid: f.id, cid: prof.id, name: f.name || '', type: f.type || 'other', group: f.group,
            cc: f.cc || '', city: f.city || '', region: f.region || '',
            precision: f.precision || 'exact', status: f.status || 'operating',
            opened: f.opened || '', closed: f.closed || '', role: f.role || '',
          },
        });
      }
      return { type: 'FeatureCollection', features: feats };
    }

    /** Bounding box [w,s,e,n] over the facilities we would draw, or null. */
    function facilityBounds(prof, groups) {
      const gj = facilityGeoJSON(prof, groups);
      if (!gj.features.length) return null;
      let w = 180; let s = 90; let e = -180; let n = -90;
      for (const f of gj.features) {
        const c = f.geometry.coordinates;
        if (c[0] < w) w = c[0];
        if (c[0] > e) e = c[0];
        if (c[1] < s) s = c[1];
        if (c[1] > n) n = c[1];
      }
      return [w, s, e, n];
    }

    /* ── store networks (docs/COMPANIES.md §8) ────────────────────────────── */
    const hasStores = (prof) => !!(prof && prof.storeNetwork && prof.storeNetwork.count > 0);
    function stores(id) {
      if (_stores.has(id)) return Promise.resolve(_stores.get(id));
      return fetch(STORE_DIR + encodeURIComponent(id) + '.json')
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then((j) => { _stores.set(id, j); return j; });
    }

    return {
      index, indexReady, get, byTicker, resolve, search,
      profile, profileReady,
      facilityGeoJSON, facilityBounds, groupOf, GROUPS,
      typeLabel, groupLabel, kindLabel, statusLabel, groupColor,

      hasStores, stores,
      /* for tests: how much is actually held right now */
      _stats: () => ({ index: _index ? _index.companies.length : 0, profiles: _profiles.size }),
    };
  }());

  window.IntMapCompanyData = API;
  return API;
};
