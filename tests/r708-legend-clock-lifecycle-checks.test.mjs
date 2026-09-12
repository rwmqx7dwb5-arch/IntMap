import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/data-layers.js', import.meta.url), 'utf8');
const begin = source.indexOf('    let _syncYearHints=');
const end = source.indexOf('    try{ window._legendClockYear=', begin);
assert.ok(begin >= 0 && end > begin);

// A DOM fixture for the actual legend builder, including numeric constraint validation.
// The browser before/after measurement covers native node memory; these tests cover its ownership.
function harness() {
  let elements = 0, live = true, year = new Date().getFullYear();
  const subscriptions = [], writes = [], timers = [];
  function element(tag = 'div') {
    elements++;
    const attrs = {}, handlers = {};
    const el = { tagName: tag.toUpperCase(), children: [], parentNode: null, style: {}, dataset: {},
      className: '', value: '', min: '', max: '', step: '', type: '', reported: 0,
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; },
      setAttribute(name, value) { attrs[name] = String(value); if (name === 'class') this.className = String(value); },
      getAttribute(name) { return attrs[name] ?? null; },
      removeAttribute(name) { delete attrs[name]; },
      addEventListener(name, fn) { (handlers[name] ||= []).push(fn); },
      dispatch(name) { for (const fn of handlers[name] || []) fn({ target: this }); if (this['on' + name]) this['on' + name]({ target: this }); },
      querySelectorAll(selector) {
        const all = this.children.flatMap(c => [c, ...c.querySelectorAll('*')]);
        if (selector === '*') return all;
        if (selector.startsWith('.')) return all.filter(c => c.className.split(/\s+/).includes(selector.slice(1)));
        return all.filter(c => c.tagName === selector.toUpperCase());
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      checkValidity() {
        if (this.value === '') return !this.required;
        const n = Number(this.value);
        return Number.isFinite(n) && (this.min === '' || n >= +this.min)
          && (this.max === '' || n <= +this.max) && (this.step !== '1' || Number.isInteger(n));
      },
      reportValidity() { this.reported++; return this.checkValidity(); }
    };
    el.classList = { add(cls) { el.className += ' ' + cls; }, remove(cls) { el.className = el.className.split(/\s+/).filter(c => c !== cls).join(' '); },
      toggle(cls, on) { this.remove(cls); if (on) this.add(cls); } };
    Object.defineProperty(el, 'valueAsNumber', { get: () => el.value === '' ? NaN : Number(el.value) });
    Object.defineProperty(el, 'validity', { get: () => ({ valid: el.checkValidity() }) });
    Object.defineProperty(el, 'innerHTML', { set(html) {
      this.children = [];
      for (const match of String(html).matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
        assert.ok(elements < 1000, 'a year range must not allocate a node per year');
        const child = element(match[1]);
        for (const a of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
          child.setAttribute(a[1], a[2]);
          if (['value', 'min', 'max', 'step', 'type'].includes(a[1])) child[a[1]] = a[2];
        }
        this.appendChild(child);
      }
    } });
    return el;
  }
  const body = element();
  const clock = {
    on(fn) { subscriptions.push(fn); return () => { const i = subscriptions.indexOf(fn); if (i >= 0) subscriptions.splice(i, 1); }; },
    isLive: () => live, year: () => year,
    setYear(y, opts) { live = false; year = y; writes.push({ y, source: opts.source }); this.emit(); },
    setNow(opts) { live = true; writes.push({ now: true, source: opts.source }); this.emit(); },
    emit() { for (const fn of [...subscriptions]) fn(); }
  };
  const HOST = { lang: 'en' };
  const context = vm.createContext({ HOST, document: { createElement: element, querySelectorAll: s => body.querySelectorAll(s) },
    window: { IntMapTime: clock, IntMapLang: { t: (lang, en, jp) => lang === 'jp' ? jp : en } },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); }, escapeHtml: s => s });
  vm.runInContext(source.slice(begin, end), context);
  return { body, HOST, clock, writes, subscriptions, timers, get elements() { return elements; },
    setHints(fn) { context.nextHints = fn; vm.runInContext('_syncYearHints=nextHints;', context); },
    registerHints() {
      const at = source.indexOf('      if(!_legendHintsSubscribed)');
      assert.ok(at >= 0, 'hint subscriptions must have one lifecycle owner');
      vm.runInContext(source.slice(at, source.indexOf('\n', at)), context);
    },
    build(opts, host) { host ||= body.appendChild(element()); return { host, row: context.legendClockYear(host, opts) }; }
  };
}

test('deep-time legend keeps its whole year range with constant DOM size', () => {
  const h = harness(), { row } = h.build({ min: -122999, max: 2025 });
  const input = row.querySelector('.dl-clockyear');
  assert.equal(input.tagName, 'INPUT'); assert.equal(input.type, 'number');
  assert.equal(+input.min, -122999); assert.equal(+input.max, 2025);
  assert.equal(row.querySelectorAll('option').length, 0); assert.ok(h.elements < 10);
  for (const year of [-122999, -100000, -1, 0, 1, 1850, 2025]) {
    input.value = String(year); input.dispatch('change');
    assert.equal(h.writes.at(-1).y, year); assert.equal(h.writes.at(-1).source, 'layer-legend');
  }
});

test('Now and external clock changes synchronize all live legends', () => {
  const h = harness();
  const a = h.build({ min: -122999 }).row, b = h.build({ min: -122999 }).row;
  h.clock.setYear(-44, { source: 'test' });
  for (const row of [a, b]) assert.equal(row.querySelector('.dl-clockyear').value, '-44');
  a.querySelector('.dl-clocknow').dispatch('click');
  assert.equal(h.clock.isLive(), true); assert.equal(h.writes.at(-1).source, 'layer-legend');
  for (const row of [a, b]) assert.equal(row.querySelector('.dl-clockyear').value, '');
  h.clock.setYear(2000, { source: 'test' });
  const input = b.querySelector('.dl-clockyear'); input.value = ''; input.dispatch('change');
  assert.equal(h.clock.isLive(), true, 'clearing the field preserves the previous Now choice');
});

test('invalid years do not write or clamp the master clock', () => {
  const h = harness(), { row } = h.build({ min: -100, max: 2020 });
  const input = row.querySelector('.dl-clockyear');
  h.clock.setYear(2000, { source: 'test' }); const before = h.writes.length;
  for (const value of ['-101', '2021', '2.5', 'NaN']) {
    input.value = value; input.dispatch('change');
    assert.equal(h.writes.length, before); assert.equal(input.value, '2000');
  }
});

test('updating a legend changes its bounds and language without stale closures', () => {
  const h = harness(), { host, row } = h.build({ min: 1960, max: 2020 });
  h.HOST.lang = 'jp'; h.build({ min: 0, max: 2025 }, host);
  const input = row.querySelector('.dl-clockyear');
  assert.equal(+input.min, 0); assert.equal(+input.max, 2025);
  assert.equal(row.querySelector('.dl-clocklbl').textContent, '年');
  assert.equal(row.querySelector('.dl-clocknow').textContent, '現在');
  input.value = '0'; input.dispatch('change'); assert.equal(h.writes.at(-1).y, 0);
  assert.equal(h.subscriptions.length, 1);
});

test('rebuilding removed legends retains one clock listener and visits only live rows', () => {
  const h = harness();
  for (let i = 0; i < 20; i++) {
    const { host, row } = h.build({ min: -122999, max: 2025 });
    const input = row.querySelector('.dl-clockyear');
    h.clock.setYear(1900, { source: 'test' }); host.remove();
    h.clock.setYear(2000, { source: 'test' });
    assert.equal(input.value, '1900', 'removed controls must no longer receive clock updates');
    assert.equal(h.subscriptions.length, 1, 'rebuilds must not accumulate retained legend closures');
  }
  assert.equal(h.body.querySelectorAll('.dl-clockrow').length, 0);
});

test('delayed legend hints keep one subscription and use the current rebuild callback', () => {
  const h = harness(); let retired = 0, current = 0;
  h.setHints(() => retired++);
  for (let i = 0; i < 20; i++) h.registerHints();
  assert.equal(h.subscriptions.length, 1);
  h.clock.emit();
  assert.deepEqual(h.timers.map(t => t.delay), [420, 2500], 'preserve both existing refresh timings');
  h.setHints(() => current++); // A language rebuild occurs while the timers are pending.
  for (const timer of h.timers) timer.fn();
  assert.equal(retired, 0); assert.equal(current, 2);
  h.setHints(null);
  assert.doesNotThrow(() => h.timers[0].fn());
});
