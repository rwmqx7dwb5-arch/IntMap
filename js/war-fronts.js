/* ============================================================================
 *  IntMap · THE TWO WORLD WARS — the Layers row   (#R349)
 * ----------------------------------------------------------------------------
 *  「WW1, WW2の月日ごとの勢力変遷も見れるように。」 Scope confirmed with the reader:
 *  「レイヤー1行＋Chronos 連動」 — a row that is OFF by default, and that binds itself to the master
 *  clock only while it is on.
 *
 *  ══ WHAT IS HERE, AND WHY THE REST IS NOT ═══════════════════════════════════════════════════
 *  Everything that RUNS AT BOOT: the row in the Layers panel, its label in nine languages, and the
 *  two IntMapOS commands so Atlas can reach the feature (CONSTITUTION — every feature is reachable
 *  from the control plane, and a command that only exists after the layer is on is not reachable).
 *  The layer itself — the fill, the front lines, the operations, the legend and the cut — is
 *  js/war-layer.js, fetched through js/lazy-modules.js the first time somebody asks.
 *
 *  ⚠ THE SPLIT IS MEASURED, NOT STYLISTIC. Eager and whole, js/war-layer.js + js/war-geom.js cost
 *  24.3 kB raw / 8.4 kB gzip on EVERY session, for a layer that is off by default — which is exactly
 *  the event scripts/perf-budget.mjs exists to notice. #R311 deferred six subsystems on this rule and
 *  #R322 split js/analysis-panels.js on it: keep what registers something at boot, defer the body.
 *  What could NOT be deferred is this file: a row that appears only after you have found the layer
 *  you cannot see is not a row.
 *
 *  ⚠ AND THE FACADE ANSWERS BEFORE THE BODY ARRIVES. `isOn()` is false, `date()` is null and
 *  `wars()` is empty for a layer nobody has asked for — which is the truth, and is what lets a
 *  caller ask without paying for the download.
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.warFronts = function (HOST) {
  const L = window.IntMapLang.pick(() => HOST.lang);

  let body = null, pending = null;
  /* the body, fetched once. `IntMapLazy.need` is the loader's own promise, so two clicks in the
     same second cannot mount it twice. */
  function need() {
    if (body) return Promise.resolve(body);
    if (!pending) {
      pending = window.IntMapLazy.need('warLayer')
        .then(() => { body = window.__imWarFronts || null; return body; })
        .catch(() => { pending = null; return null; });
    }
    return pending;
  }

  async function toggle(want) {
    /* switching OFF something that was never fetched is already true — do not download a layer in
       order to turn it off */
    if (!want && !body) return false;
    const b = await need();
    if (!b) {
      try {
        HOST.imToast(L('Could not load the war data', '大戦データを読み込めませんでした', 'Kriegsdaten konnten nicht geladen werden',
          'Не удалось загрузить данные о войнах', 'No se pudieron cargar los datos de la guerra'));
      } catch (_) { }
      const el = document.getElementById('dl-wars');
      if (el) { el.checked = false; el.closest('.lyr-row').classList.remove('on'); }
      return false;
    }
    return b.toggle(want);
  }

  /* ── the row ────────────────────────────────────────────────────────────────────────────────── */
  const label = () => L('World wars (day by day)', '両大戦（日ごと）', 'Weltkriege (Tag für Tag)',
    'Мировые войны (по дням)', 'Guerras mundiales (día a día)');

  function buildRow() {
    const dd = document.getElementById('layer-dropdown'); if (!dd || document.getElementById('dl-wars')) return;
    const w = document.createElement('div'); w.className = 'lyr-row'; w.id = 'lyrrow-wars';
    w.innerHTML = '<label class="layer-option"><input type="checkbox" id="dl-wars"> '
      + '<span class="lyr-sw" style="background:linear-gradient(90deg,#4a7fbd 50%,#b4544a 50%)"></span> '
      + '<span id="dl-wars-lbl"></span></label>';
    dd.appendChild(w);
    relabel();
    w.querySelector('input').addEventListener('change', (ev) => {
      ev.target.closest('.lyr-row').classList.toggle('on', ev.target.checked);
      toggle(ev.target.checked);
    });
    try { window.reorganizeLayerPanel && window.reorganizeLayerPanel(); } catch (_) { }
  }
  function relabel() { const e = document.getElementById('dl-wars-lbl'); if (e) e.textContent = label(); }
  if (document.readyState !== 'loading') setTimeout(buildRow, 0); else document.addEventListener('DOMContentLoaded', buildRow);
  window.addEventListener('intmap-lang', () => setTimeout(relabel, 20));

  /* ⚠ ATLAS DRIVES IT LIKE EVERYTHING ELSE. `wars.show` also MOVES THE CLOCK, because a layer that
     can only be switched on is useless to a planner that was asked about a date. Both go through the
     checkbox rather than through `toggle` so the row's own state cannot disagree with the map's. */
  try {
    window.IntMapOS.register('wars.toggle', (ctx) => {
      const want = !(ctx && ctx.params && ctx.params.on === false);
      const el = document.getElementById('dl-wars');
      if (el) { el.checked = want; el.dispatchEvent(new Event('change', { bubbles: true })); } else toggle(want);
    }, { label: 'World wars · show / hide', group: 'layers' });
    window.IntMapOS.register('wars.show', (ctx) => {
      const d = ctx && ctx.params && ctx.params.date;
      const el = document.getElementById('dl-wars');
      if (el && !el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
      if (d) { const x = new Date(String(d).length <= 10 ? (d + 'T12:00:00Z') : d); if (!isNaN(x)) window.IntMapTime.set(x, { source: 'os' }); }
    }, { label: 'World wars · show a date', group: 'layers' });
  } catch (_) { }

  window.IntMapWarFronts = {
    toggle,
    ready: need,
    isOn: () => !!(body && body.isOn()),
    date: () => (body ? body.date() : null),
    war: () => (body ? body.war() : null),
    wars: () => (body ? body.wars() : []),
    _build: (d) => (body ? body._build(d) : null),
  };
  return window.IntMapWarFronts;
};
