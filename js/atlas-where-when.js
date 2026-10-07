/* ============================================================================
 *  IntMap · js/atlas-where-when.js — Atlas's run of `time.whereWhen`   (where-when-search)
 * ----------------------------------------------------------------------------
 *  Imported on first use by js/atlas-cap-time.js, so the Atlas chunk does not carry it (check:perf) — the pattern of
 *  js/atlas-hist-urban.js. The reading itself is js/where-when.js `interpret`, the one the search field and the palette
 *  use; this file turns its rows into Atlas's answer: the chosen row flown, the master clock set, or the candidates
 *  numbered for `pick` when more than one place answers (nothing is guessed).
 * ==========================================================================*/
export async function whereWhen(a, K) {
  const R = K.R, L = K.L, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
  const WW = await import('./where-when.js');
  const q = String(a.query == null ? '' : a.query).trim();
  const meta = (code, category, extra) => Object.assign({ code, category, retryable: category !== 'ok', produced: [], userGoalSatisfied: false }, extra || {});
  if (!q) return R(false, warn(esc(L('Give the place and the instant as one line, e.g. «Kyoto 1600».', '場所と時刻を1行で指定してください（例:「京都 1600」）。'))), { meta: meta('NEEDS_INPUT', 'input') });
  const r = await WW.interpret(q, { local: (x) => { try { return HOST.localFuzzyPlaces(x) || []; } catch (_) { return []; } }, lang: HOST.lang });
  const w = r.parsed.when;
  const read = w ? { place: r.parsed.place, year: w.y, month: w.m, day: w.d, precision: w.precision, calendar: w.calendar, era: w.era || null, text: WW.whenText(w, 'en'), dropped: w.dropped || null } : null;
  const exec = (more) => ({ whereWhen: Object.assign({ query: q, read, note: r.note }, more || {}) });
  if (!w) return R(false, warn(esc(r.note || L('No instant was read in «' + q + '». Read forms: a year (1600), an era year (44 BC, 紀元前44年), a month and year (May 1945), a date (1945-05-08, 8 May 1945, 1945年5月8日) and Japanese era years (慶長5年).', '「' + q + '」から時刻を読み取れませんでした。読める形: 年（1600）、紀元前・西暦の年（44 BC、紀元前44年）、年と月（May 1945）、日付（1945-05-08、1945年5月8日）、和暦の年（慶長5年）。'))), { exec: exec(), meta: meta(r.parsed.problem ? 'UNKNOWN_ERA' : 'NO_INSTANT', 'input') });
  if (r.parsed.problem) return R(false, warn(esc(r.note || '')), { exec: exec(), meta: meta(String(r.parsed.problem.code).toUpperCase().replace(/-/g, '_'), 'input') });
  const rows = r.rows;
  if (!rows.length) return R(false, warn(esc(L('No place named «' + r.parsed.place + '» is on the device or in the historical name records. view.flyTo asks the online geocoders for it; timeTravel sets the instant.', '「' + r.parsed.place + '」という場所は端末の地名にも歴史上の名称の記録にもありません。view.flyTo はオンラインのジオコーダーに尋ね、timeTravel は時刻を設定します。'))), { exec: exec({ candidates: [] }), meta: meta('NO_PLACE', 'input') });
  const cands = rows.map((x, i) => ({ n: i + 1, title: x.title, sub: x.sub, source: x.source, lng: x.lng == null ? null : x.lng, lat: x.lat == null ? null : x.lat, exact: x.timeOnly ? null : x.level >= 3 }));
  const exactOnes = rows.filter((x) => x.timeOnly || x.level >= 3);
  let pick = a.pick != null && isFinite(+a.pick) ? Math.round(+a.pick) : (exactOnes.length === 1 ? rows.indexOf(exactOnes[0]) + 1 : null);
  if (pick == null) return R(true, note(esc(L('Several places answer «' + r.parsed.place + '» — nothing was moved. Call again with pick:n:', '「' + r.parsed.place + '」に当たる場所が複数あります。何も動かしていません。pick:n で選んでください:')) + '<ol style="margin:4px 0 0 18px;padding:0;">' + cands.map((c) => '<li>' + esc(c.title) + ' <span style="color:var(--text-muted);font-size:12px;">' + esc(c.sub) + '</span></li>').join('') + '</ol>'), { exec: exec({ candidates: cands }), meta: meta('NEEDS_PICK', 'input', { retryable: true }) });
  if (!(pick >= 1 && pick <= rows.length)) return R(false, warn(esc(L('pick must be between 1 and ' + rows.length, 'pick は 1〜' + rows.length + ' で指定してください'))), { exec: exec({ candidates: cands }), meta: meta('BAD_PICK', 'input') });
  const row = rows[pick - 1];
  if (!row.timeOnly) { try { HOST.goToLocalPlace({ name: row.name, lng: row.lng, lat: row.lat, kind: row.kind, bbox: row.bbox }); } catch (_) { } }
  const clock = WW.applyWhen(w, { source: 'atlas' });
  if (!clock.ok) return R(false, warn(esc(r.note || L('The clock did not take that instant.', '時計はその時刻を受け付けませんでした。'))), { exec: exec({ candidates: cands }), meta: meta('CLOCK_REFUSED', 'input') });
  return R(true, note(esc(row.title + (row.sub ? ' — ' + row.sub : '')) + (r.note ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + esc(r.note) + '</div>' : '')),
    { exec: exec({ chosen: cands[pick - 1], clock: { iso: clock.iso, live: clock.live } }), meta: meta('OK', 'ok', { retryable: false, produced: row.timeOnly ? ['time'] : ['map', 'time'], userGoalSatisfied: true }) });
}
