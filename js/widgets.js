/* ============================================================================
 *  IntMap · Widget board — IntMapModules.widgets
 * ----------------------------------------------------------------------------
 *  This file is the JOIN between the application and the widget platform, and nothing else. The
 *  platform is seven modules, each with one job:
 *
 *      js/widget-core.js       registry · context · state model · DOM toolkit · icons · the ticker
 *      js/widget-store.js      intmap_widgets4 · validation · the lossless v3 migration · cache
 *      js/widget-scheduler.js  one request per requestKey · TTL · SWR · abort · backoff · visibility
 *      js/widget-render.js     the seven card shapes every renderer is built from
 *      js/widget-defs-*.js     the definitions (time · data · map/IntMap)
 *      js/widget-layout.js     the grid, S/M/L, reorder, stacks, the card menu
 *      js/widget-gallery.js    search · categories · a real preview · settings before adding
 *      js/widget-smart.js      which card in a Smart Stack deserves the front, and why
 *
 *  ══ THE PUBLIC CONTRACT, UNCHANGED ════════════════════════════════════════════════════════════
 *  `window.IntMapWidgets2` keeps `sync`, `render`, `_active()` and `_setActive()` with the SAME
 *  shapes: the account preference sync in js/app-body.js round-trips a board through the last two,
 *  and tests/r164.spec.js reads `_active()`. A device still running the previous build has to be
 *  able to read what a device running this one wrote, so `_active()` still answers `[{u,t,cfg}]`
 *  with the LEGACY type string. The richer v4 record rides alongside it in `widgets4`, which an
 *  older build ignores — nothing is lost in either direction (see js/widget-store.js).
 *
 *  ⚠ THE CSS IS IN css/intmap.css. This file appends no <style> and builds no stylesheet string.
 * ==========================================================================*/
/* ⚠ THE PLATFORM'S OWN LOAD ORDER, DECLARED HERE RATHER THAN IN THE ENTRY. Each module resolves
   the ones above it at IMPORT time (`var WC = window.IntMapWidgetCore;`), so this list is
   load-bearing: the core publishes the registry the definitions register into, and every
   definition must be registered before the layout tries to draw a board out of them.
   ⚠ A bare sibling import is the reachability form tests/r175 ③ recognises — these files
   publish themselves on `window` and export nothing, so there is no name to import. */
import './widget-core.js';
import './widget-store.js';
import './widget-scheduler.js';
import './widget-render.js';
import './widget-smart.js';
import './widget-defs-time.js';
import './widget-defs-data.js';
import './widget-defs-markets.js';
import './widget-defs-map.js';
import './widget-layout.js';
import './widget-gallery.js';

window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.widgets=function(HOST){
  'use strict';

  var WC = window.IntMapWidgetCore;
  var ST = window.IntMapWidgetStore;
  var SCH = window.IntMapWidgetScheduler;
  var LAY = window.IntMapWidgetLayout;

  WC.bind(HOST);

  /* the countdown cards on the board, for the calendar card that shows them all (§7.J) */
  WC.boardCountdowns = function () {
    var out = [];
    ST.raw().forEach(function (it) {
      var walk = function (x) { if (x.d === 'time.countdown' && x.c && x.c.date) out.push({ title: x.c.title || '', date: x.c.date }); };
      if (it.k === 'stack') it.m.forEach(walk); else walk(it);
    });
    return out;
  };

  var built = false;

  function sync() {
    var b = LAY.el() || (LAY.render(), LAY.el());
    if (!b) return;
    /* the board occupies the sidebar when no tab is open — unchanged behaviour */
    var noTab = (typeof HOST.mode === 'undefined' || !HOST.mode);
    if (noTab) {
      b.style.display = 'block';
      if (!built) { built = true; LAY.render(); }
    } else {
      b.style.display = 'none';
      /* ⚠ AND THE CARDS GO WITH IT. See js/widget-layout.js `release()` — a hidden board that merely
         stopped being looked at kept a 1 Hz ticker running for a clock nobody could see. `built` is
         cleared with it, so coming back rebuilds rather than resurrecting a half-released board. */
      LAY.release();
      built = false;
    }
    /* ⚠ THE SCHEDULER IS TOLD, RATHER THAN ASKED. `visible()` used to be re-evaluated inside every
       refresh callback; now the one fact is pushed once and every policy reads it. */
    LAY.updateBoardVisibility();
  }

  function render() { built = true; LAY.render(); LAY.updateBoardVisibility(); }

  /* ── the events the board reacts to ─────────────────────────────────────────────────────── */
  SCH.attachEvents();
  LAY.attachKeys();

  /* a language change re-renders; it does NOT re-fetch (§12.16) */
  window.addEventListener('intmap-lang', function () { WC.invalidateContext(); if (built) LAY.render(); });
  /* a theme change does neither — the CSS carries it (§12.17) */
  WC.on('geo', function () { if (built) LAY.repaintAll(); });
  WC.on('map', function () { if (built) LAY.repaintAll(); });
  WC.on('online', function () { if (built) LAY.repaintAll(); });
  WC.on('brief', function () { if (built) LAY.repaintAll(); });
  WC.on('store-error', function () {
    try { HOST.imToast(WC.L('Your board could not be saved — storage is full', 'ボードを保存できませんでした（保存領域が不足しています）', 'Board konnte nicht gespeichert werden – Speicher voll', 'Не удалось сохранить доску — хранилище заполнено', 'No se pudo guardar el tablero: almacenamiento lleno')); } catch (e) {}
  });
  /* the layer registry has no event of its own, so the board re-reads it when the map settles */
  try {
    var E = window.IntMapGeoEngine;
    if (E && E.hasRenderer && E.hasRenderer() && E.events) {
      E.events.on('idle', function () { if (built && LAY.boardShown()) { WC.invalidateContext(); WC.emit('layers'); } });
    }
  } catch (e) {}

  /* ── the published contract ─────────────────────────────────────────────────────────────── */
  window.IntMapWidgets2 = {
    sync: sync,
    render: render,
    _active: function () { ST.load(); return ST.toLegacy(); },
    _setActive: function (a, rich) { ST.applyLegacy(a, rich); built = false; sync(); },
    /* the richer payload, for the account sync — an older build simply never asks for it */
    _payload: function () { ST.load(); return ST.syncPayload(); },
    _store: ST, _core: WC, _scheduler: SCH, _layout: LAY,
  };

  if (document.readyState !== 'loading') setTimeout(sync, 0);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(sync, 0); });
};
