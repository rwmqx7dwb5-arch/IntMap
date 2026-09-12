import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/playground.js', import.meta.url), 'utf8');
const start = source.indexOf('    function openGuess(');
const end = source.indexOf('    /* ===================== PANDEMIC', start);
assert.ok(start >= 0 && end > start);

function harness({ failCreate = false, failDestroy = false } = {}) {
  const views = [], overlays = [];
  let restores = 0, restarts = 0;
  function element() {
    return { children: [], style: {}, listeners: {}, removed: false,
      appendChild(el) { this.children.push(el); },
      remove() { this.removed = true; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      click(target = this) { for (const fn of this.listeners.click || []) fn({ target }); }
    };
  }
  const context = vm.createContext({
    HOST: { lang: 'en' }, document: { createElement: element },
    window: { IntMapLang: { t: (_lang, en) => en }, cartoTiles: () => [],
      _pgWorldExplorer: () => restarts++ },
    shell() {
      const ov = element(), card = element(); ov.appendChild(card);
      // The real shell removes its backdrop before the feature's listener runs.
      ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
      overlays.push({ ov, card }); return { ov, card };
    },
    xbtn(fn) { const el = element(); el.onclick = fn; return el; },
    haversine: () => 0,
    GE: () => ({ ui: { createSubView() {
      if (failCreate) throw new Error('allocation failed');
      const view = { handlers: {}, destroys: 0, markers: 0, projections: 0,
        events: { on(type, fn) { view.handlers[type] = fn; } },
        camera: { setProjection() { view.projections++; }, fitBounds() {} },
        ui: { addMarker() { view.markers++; return { remove() {} }; } },
        destroy() { view.destroys++; if (failDestroy) throw new Error('destroy failed'); }
      }; views.push(view); return view;
    } } })
  });
  vm.runInContext(source.slice(start, end), context);
  return { views, overlays, get restores() { return restores; }, get restarts() { return restarts; },
    open() {
      context.openGuess({ lng: 10, lat: 20 }, () => restores++, {});
      const entry = overlays.at(-1);
      return { ...entry, view: views.at(-1), close: entry.card.children[0],
        answer: entry.card.children.find(el => el.textContent === 'Answer') };
    }
  };
}

test('guess map close button destroys each repeated view exactly once', () => {
  const h = harness();
  for (let i = 0; i < 20; i++) {
    const g = h.open(); g.close.onclick();
    assert.equal(g.view.destroys, 1, 'the close button must release the renderer itself');
    g.close.onclick(); g.ov.click();
    assert.equal(g.view.destroys, 1); assert.equal(g.ov.removed, true);
  }
  assert.equal(h.restores, 0); assert.equal(h.restarts, 0);
});

test('backdrop closes the map; clicks inside the card leave it alive', () => {
  const g = harness().open(); g.ov.click(g.card);
  assert.equal(g.view.destroys, 0); assert.equal(g.ov.removed, false);
  g.ov.click(); assert.equal(g.view.destroys, 1); assert.equal(g.ov.removed, true);
});

test('play again destroys its view and preserves restore/restart behavior once', () => {
  const h = harness(), g = h.open();
  g.view.handlers.click({ lngLat: { lng: 10, lat: 20 } }); g.answer.onclick();
  const again = g.card.children.find(el => el.textContent === 'Play again');
  assert.ok(again); again.onclick(); again.onclick(); g.close.onclick();
  assert.equal(g.view.destroys, 1); assert.equal(h.restores, 1); assert.equal(h.restarts, 1);
});

test('queued renderer callbacks and detached answer clicks cannot revive a closed map', () => {
  const g = harness().open();
  g.view.handlers.click({ lngLat: { lng: 10, lat: 20 } });
  const markers = g.view.markers, projections = g.view.projections;
  g.close.onclick();
  g.view.handlers['style.load']();
  g.view.handlers.click({ lngLat: { lng: 30, lat: 40 } }); g.answer.onclick();
  assert.equal(g.view.markers, markers); assert.equal(g.view.projections, projections);
  assert.equal(g.card.children.some(el => el.textContent === 'Play again'), false);
});

test('allocation or destroy failures still close the overlay safely', () => {
  for (const opts of [{ failCreate: true }, { failDestroy: true }]) {
    const g = harness(opts).open();
    assert.doesNotThrow(() => { g.close.onclick(); g.ov.click(); });
    assert.equal(g.ov.removed, true);
    if (g.view) assert.equal(g.view.destroys, 1);
  }
});
