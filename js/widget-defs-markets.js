/* ============================================================================
 *  IntMap · WIDGET DEFINITIONS — MARKETS
 * ----------------------------------------------------------------------------
 *  FX · crypto prices · crypto capitalisation · Fear & Greed · gold · silver · Bitcoin network.
 *
 *  ══ ⚠ NO INVENTED TIME SERIES, AND ONE REAL ONE (§2.6, §7.E) ═══════════════════════════════════
 *  Six of these seven sources publish a NUMBER and, at most, a change — not a history. So six of
 *  these cards show the number, the change and when it was measured, and draw nothing: a sparkline
 *  from one value is decoration shaped like evidence.
 *  The seventh is the exception that proves it. `alternative.me/fng/?limit=30` really does return
 *  thirty days, and it is the SAME request the S and M sizes read their single value from — one
 *  key, one fetch, three sizes, and the L size draws a line that exists.
 *
 *  ⚠ AND `requestKey` IS THE UNIT OF WORK. `markets:crypto` is one string however many cards want
 *  it; a set of coins is SORTED into its key, so {btc,eth} and {eth,btc} are the same question.
 * ==========================================================================*/
window.IntMapWidgetDefsMarkets = (function () {
  'use strict';

  var WC = window.IntMapWidgetCore;
  var R = window.IntMapWidgetRender;
  var el = WC.el;
  var L = WC.L;
  var D = window.IntMapWidgetDefsData;
  var getJSON = D.getJSON;
  var firstOf = D.firstOf;
  var round2 = function (v) { return Math.round(v * 100) / 100; };
  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     MARKETS
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  /* ⚠ ISO-4217 CODES, NOT PROSE. The label a reader sees is built by `ccyLabel` below, from
     Intl.DisplayNames in their own language; this list is only what the picker may offer. */
  var FX_CCY = ['USD', 'JPY', 'EUR', 'GBP', 'CNY', 'KRW', 'CHF', 'AUD', 'CAD', 'NZD', 'SGD', 'HKD', 'TWD',
    'INR', 'BRL', 'MXN', 'RUB', 'TRY', 'ZAR', 'SEK', 'NOK', 'PLN', 'THB', 'IDR', 'PHP', 'VND', 'SAR', 'AED', 'ILS', 'EGP'];
  var _ccyDN = {};
  function ccyLabel(c) {
    try {
      var tag = window.IntMapLang.locale(WC.lang());
      if (_ccyDN[tag] === undefined) { try { _ccyDN[tag] = new Intl.DisplayNames([tag], { type: 'currency' }); } catch (e) { _ccyDN[tag] = null; } }
      var n = _ccyDN[tag] && _ccyDN[tag].of(c);
      return n && n !== c ? c + ' · ' + n : c;
    } catch (e) { return c; }
  }
  function ccyOptions() { return FX_CCY.map(function (c) { return { value: c, label: ccyLabel(c) }; }); }
  /* ⚠ THE FIRST-CHOICE CURRENCY IS A TABLE, NOT A TERNARY (#R243) — and it is read INSIDE
     defaultConfig, at the moment a card is created, which is the whole reason that seed can no
     longer throw before the card exists. */
  var DEF_FX = { jp: 'JPY', ko: 'KRW', zh: 'TWD', 'zh-hans': 'CNY', de: 'EUR', fr: 'EUR', es: 'EUR', ru: 'RUB' };
  var langKey = D.langKey;

  WC.define({
    id: 'markets.fx', family: 'markets', variant: 'fx', category: 'markets', icon: 'coin',
    legacyIds: ['fx'], multi: true,
    nm: function () { return L('FX rate', '為替レート', 'Wechselkurs', 'Курс валют', 'Tipo de cambio'); },
    desc: function () { return L('Any currency pair, live', '好きな通貨ペアのライブレート', 'Beliebiges Währungspaar, live', 'Любая валютная пара, вживую', 'Cualquier par de divisas, en vivo'); },
    keywords: function () { return [L('exchange rate', '為替', 'Wechselkurs', 'обменный курс', 'tipo de cambio'), 'FX', L('currency', '通貨', 'Währung', 'валюта', 'divisa')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {
      base: { type: 'currency', default: 'USD', label: function () { return L('From', '基準通貨', 'Von', 'Из', 'De'); }, options: ccyOptions },
      quote: { type: 'currency', default: function () { return DEF_FX[langKey()] || 'EUR'; }, label: function () { return L('To', '対象通貨', 'Nach', 'В', 'A'); }, options: ccyOptions },
      others: { type: 'list', max: 4, of: function (x) { return /^[A-Z]{3}$/.test(x); }, default: [],
        label: function () { return L('Also compare', '併せて比較', 'Zusätzlich vergleichen', 'Также сравнить', 'Comparar también'); }, options: ccyOptions },
    },
    defaultConfig: function () { return { base: 'USD', quote: DEF_FX[langKey()] || 'EUR', others: [] }; },
    refreshPolicy: { kind: 'interval', minIntervalMs: 60000, staleAfterMs: 10 * 60000, cacheTtlMs: 30 * 60000 },
    title: function (cfg) { return L('FX', '為替', 'Devisen', 'Валюта', 'Divisas') + ' ' + cfg.base + '/' + cfg.quote; },
    requestKey: function (ctx, cfg) { return 'fx:' + cfg.base; },
    loader: function (ctx, cfg, signal) {
      return firstOf([
        'https://api.fxratesapi.com/latest?base=' + cfg.base,
        'https://open.er-api.com/v6/latest/' + cfg.base,
      ], signal, function (j) { return (j && j.rates) ? { rates: j.rates, at: j.timestamp ? j.timestamp * 1000 : (j.time_last_update_unix ? j.time_last_update_unix * 1000 : Date.now()) } : null; })
        .then(function (v) { return { data: v, source: 'fxratesapi / er-api' }; });
    },
    renderers: {
      s: function (ctx, cfg, st) {
        var r = st.data && st.data.rates[cfg.quote];
        if (r == null) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: fmtRate(r), caption: cfg.base + ' → ' + cfg.quote })]);
      },
      m: function (ctx, cfg, st, api) {
        var r = st.data && st.data.rates[cfg.quote];
        if (r == null) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: fmtRate(r), caption: '1 ' + cfg.base + ' = ' + fmtRate(r) + ' ' + cfg.quote }),
          R.facts([{ k: L('Inverse', '逆算', 'Umgekehrt', 'Обратный', 'Inverso'), v: '1 ' + cfg.quote + ' = ' + fmtRate(1 / r) + ' ' + cfg.base }]),
          R.actions([{ label: L('Change pair', 'ペアを変更', 'Paar ändern', 'Сменить пару', 'Cambiar par'), icon: 'gear', run: function () { api.openConfig(); } }]),
          R.source({ source: st.source, at: st.data.at }),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        var rates = st.data && st.data.rates;
        if (!rates) return null;
        var list = [cfg.quote].concat((cfg.others || []).filter(function (c) { return c !== cfg.quote; }));
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: fmtRate(rates[cfg.quote]), caption: '1 ' + cfg.base + ' = ' + fmtRate(rates[cfg.quote]) + ' ' + cfg.quote }),
          R.list(list.map(function (c) {
            return { icon: 'coin', title: ccyLabel(c), sub: '1 ' + cfg.base, trailing: rates[c] == null ? '—' : fmtRate(rates[c]) };
          }), { dense: true }),
          R.actions([{ label: L('Edit currencies', '通貨を編集', 'Währungen bearbeiten', 'Изменить валюты', 'Editar divisas'), icon: 'gear', run: function () { api.openConfig(); } }]),
          R.source({ source: st.source, at: st.data.at }),
        ]);
      },
    },
  });
  function fmtRate(x) {
    if (x == null || !isFinite(x)) return '—';
    return WC.num(x, { maximumFractionDigits: x < 0.01 ? 6 : x < 10 ? 4 : 2 });
  }

  WC.define({
    id: 'markets.crypto-prices', family: 'markets', variant: 'crypto-prices', category: 'markets', icon: 'chart',
    legacyIds: ['crypto'],
    nm: function () { return L('Crypto (BTC · ETH)', '暗号資産（BTC・ETH）', 'Krypto (BTC · ETH)', 'Криптовалюты (BTC · ETH)', 'Cripto (BTC · ETH)'); },
    desc: function () { return L('Price and 24-hour change', '価格と24時間の変動', 'Kurs und 24-Stunden-Änderung', 'Цена и изменение за 24 ч', 'Precio y variación en 24 h'); },
    keywords: function () { return ['bitcoin', 'ethereum', 'BTC', 'ETH', L('crypto', '暗号資産', 'Krypto', 'криптовалюта', 'cripto')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {
      coins: { type: 'list', max: 5, of: function (x) { return typeof x === 'string' && /^[a-z0-9-]{2,32}$/.test(x); },
        default: ['bitcoin', 'ethereum'], label: function () { return L('Coins', '銘柄', 'Kryptowährungen', 'Монеты', 'Monedas'); },
        options: function () { return [
          { value: 'bitcoin', label: 'Bitcoin (BTC)' }, { value: 'ethereum', label: 'Ethereum (ETH)' },
          { value: 'solana', label: 'Solana (SOL)' }, { value: 'cardano', label: 'Cardano (ADA)' },
          { value: 'ripple', label: 'XRP' }, { value: 'dogecoin', label: 'Dogecoin (DOGE)' },
        ]; } },
    },
    defaultConfig: function () { return { coins: ['bitcoin', 'ethereum'] }; },
    refreshPolicy: { kind: 'interval', minIntervalMs: 60000, staleAfterMs: 5 * 60000, cacheTtlMs: 10 * 60000 },
    /* ⚠ ONE KEY FOR THE WHOLE SET, SORTED — {btc,eth} and {eth,btc} are the same question. */
    requestKey: function (ctx, cfg) { return 'crypto:' + (cfg.coins || []).slice().sort().join(','); },
    loader: function (ctx, cfg, signal) {
      var ids = (cfg.coins || ['bitcoin']).slice().sort().join(',');
      return getJSON('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true', signal)
        .then(function (j) { return { data: j, source: 'CoinGecko' }; });
    },
    renderers: {
      s: function (ctx, cfg, st) {
        var id = (cfg.coins || [])[0], d = st.data && st.data[id];
        if (!d) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: '$' + WC.num(d.usd, { maximumFractionDigits: d.usd < 10 ? 4 : 0 }), delta: round2(d.usd_24h_change), deltaUnit: '%', caption: coinName(id) })]);
      },
      m: function (ctx, cfg, st) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [
          R.list((cfg.coins || []).map(function (id) {
            var d = st.data[id];
            return d ? { icon: 'coin', title: coinName(id), sub: d.usd_24h_change == null ? '' : (d.usd_24h_change >= 0 ? '▲ +' : '▼ −') + WC.num(Math.abs(d.usd_24h_change), { maximumFractionDigits: 2 }) + '% ' + L('24 h', '24時間', '24 Std.', '24 ч', '24 h'),
              trailing: '$' + WC.num(d.usd, { maximumFractionDigits: d.usd < 10 ? 4 : 0 }) } : null;
          }).filter(Boolean), { dense: true }),
          R.source({ source: st.source, at: st.lastSuccessfulAt }),
        ]);
      },
      l: function (ctx, cfg, st, api) {
        if (!st.data) return null;
        var rows = (cfg.coins || []).map(function (id) { var d = st.data[id]; return d ? { label: coinName(id), v: d.usd_24h_change || 0, text: (d.usd_24h_change >= 0 ? '+' : '−') + WC.num(Math.abs(d.usd_24h_change || 0), { maximumFractionDigits: 2 }) + '%', tone: (d.usd_24h_change || 0) >= 0 ? 'up' : 'down' } : null; }).filter(Boolean);
        return el('div', { class: 'wgt-body' }, [
          R.list((cfg.coins || []).map(function (id) {
            var d = st.data[id];
            return d ? { icon: 'coin', title: coinName(id), trailing: '$' + WC.num(d.usd, { maximumFractionDigits: d.usd < 10 ? 4 : 0 }) } : null;
          }).filter(Boolean), { dense: true }),
          el('div', { class: 'wgt-cap', text: L('24-hour change', '24時間の変動', 'Änderung in 24 Stunden', 'Изменение за 24 часа', 'Variación en 24 horas') }),
          R.bars(rows),
          R.actions([{ label: L('Edit coins', '銘柄を編集', 'Coins bearbeiten', 'Изменить монеты', 'Editar monedas'), icon: 'gear', run: function () { api.openConfig(); } }]),
          R.source({ source: st.source, at: st.lastSuccessfulAt }),
        ]);
      },
    },
  });
  function coinName(id) {
    return ({ bitcoin: 'Bitcoin', ethereum: 'Ethereum', solana: 'Solana', cardano: 'Cardano', ripple: 'XRP', dogecoin: 'Dogecoin' })[id] || id;
  }

  WC.define({
    id: 'markets.crypto-cap', family: 'markets', variant: 'crypto-cap', category: 'markets', icon: 'chart',
    legacyIds: ['cryptocap'],
    nm: function () { return L('Crypto market cap', '暗号資産の時価総額', 'Krypto-Marktkapitalisierung', 'Капитализация крипторынка', 'Capitalización del mercado cripto'); },
    desc: function () { return L('Total capitalisation and BTC dominance', '総時価総額とBTCドミナンス', 'Gesamtkapitalisierung und BTC-Dominanz', 'Общая капитализация и доминирование BTC', 'Capitalización total y dominancia de BTC'); },
    keywords: function () { return [L('market cap', '時価総額', 'Marktkapitalisierung', 'капитализация', 'capitalización'), L('dominance', 'ドミナンス', 'Dominanz', 'доминирование', 'dominancia')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'interval', minIntervalMs: 120000, staleAfterMs: 10 * 60000, cacheTtlMs: 30 * 60000 },
    requestKey: function () { return 'crypto:global'; },
    loader: function (ctx, cfg, signal) {
      return getJSON('https://api.coingecko.com/api/v3/global', signal).then(function (j) {
        if (!j || !j.data) throw new Error('no data');
        return { data: j.data, source: 'CoinGecko' };
      });
    },
    renderers: {
      s: function (ctx, cfg, st) {
        var d = st.data; if (!d) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: '$' + WC.compact(d.total_market_cap && d.total_market_cap.usd), delta: round2(d.market_cap_change_percentage_24h_usd), deltaUnit: '%' })]);
      },
      m: function (ctx, cfg, st) {
        var d = st.data; if (!d) return null;
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: '$' + WC.compact(d.total_market_cap && d.total_market_cap.usd), delta: round2(d.market_cap_change_percentage_24h_usd), deltaUnit: '%',
            caption: L('total market capitalisation', '総時価総額', 'Gesamtmarktkapitalisierung', 'общая капитализация', 'capitalización total') }),
          R.facts([
            { k: L('BTC dominance', 'BTCドミナンス', 'BTC-Dominanz', 'Доминирование BTC', 'Dominancia de BTC'), v: d.market_cap_percentage && d.market_cap_percentage.btc != null ? WC.pct(d.market_cap_percentage.btc, 1) : '—' },
            { k: L('Coins', '銘柄数', 'Kryptowerte', 'Монет', 'Monedas'), v: WC.num(d.active_cryptocurrencies) },
          ], { cols: 2 }),
          R.source({ source: st.source, at: st.lastSuccessfulAt }),
        ]);
      },
      l: function (ctx, cfg, st) {
        var d = st.data; if (!d) return null;
        var mc = d.market_cap_percentage || {};
        var top = Object.keys(mc).slice(0, 6).map(function (k) { return { label: k.toUpperCase(), v: mc[k], text: WC.pct(mc[k], 1) }; });
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: '$' + WC.compact(d.total_market_cap && d.total_market_cap.usd), delta: round2(d.market_cap_change_percentage_24h_usd), deltaUnit: '%',
            caption: L('total market capitalisation', '総時価総額', 'Gesamtmarktkapitalisierung', 'общая капитализация', 'capitalización total') }),
          el('div', { class: 'wgt-cap', text: L('Share of total capitalisation', '時価総額シェア', 'Anteil an der Gesamtkapitalisierung', 'Доля в общей капитализации', 'Cuota de la capitalización total') }),
          R.bars(top),
          R.facts([
            { k: L('24-hour volume', '24時間出来高', '24-Stunden-Volumen', 'Объём за 24 ч', 'Volumen 24 h'), v: d.total_volume && d.total_volume.usd ? '$' + WC.compact(d.total_volume.usd) : '—' },
            { k: L('Markets', '取引所数', 'Handelsplätze', 'Площадок', 'Mercados'), v: WC.num(d.markets) },
          ], { cols: 2 }),
          R.source({ source: st.source, at: st.lastSuccessfulAt }),
        ]);
      },
    },
  });

  WC.define({
    id: 'markets.fear-greed', family: 'markets', variant: 'fear-greed', category: 'markets', icon: 'activity',
    legacyIds: ['fng'],
    nm: function () { return L('Fear & Greed', 'Fear & Greed 指数', 'Fear & Greed', 'Индекс страха и жадности', 'Índice de miedo y codicia'); },
    desc: function () { return L('Crypto market sentiment, 0–100', '暗号資産市場の心理指数（0–100）', 'Stimmung am Kryptomarkt, 0–100', 'Настроения крипторынка, 0–100', 'Sentimiento del mercado cripto, 0–100'); },
    keywords: function () { return ['fear', 'greed', L('sentiment', '心理', 'Stimmung', 'настроение', 'sentimiento'), L('index', '指数', 'Index', 'индекс', 'índice')]; },
    supportedSizes: ['s', 'm', 'l'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'interval', minIntervalMs: 15 * 60000, staleAfterMs: 3 * 3600000, cacheTtlMs: 6 * 3600000 },
    requestKey: function () { return 'fng:30'; },
    /* ⚠ ONE REQUEST, THREE SIZES. `?limit=30` is the same endpoint the old card called with the
       default limit; asking for the history costs nothing extra and is what lets L draw a REAL
       series instead of a decorative one. S and M read element [0] of it. */
    loader: function (ctx, cfg, signal) {
      return getJSON('https://api.alternative.me/fng/?limit=30', signal).then(function (j) {
        var d = j && j.data;
        if (!d || !d.length) throw new Error('no data');
        return { data: d.map(function (x) { return { v: +x.value, cls: x.value_classification, at: (+x.timestamp) * 1000 }; }), source: 'alternative.me' };
      });
    },
    renderers: {
      s: function (ctx, cfg, st) {
        var d = st.data && st.data[0]; if (!d) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ value: d.v, caption: fngWord(d.v) })]);
      },
      m: function (ctx, cfg, st) {
        var d = st.data && st.data[0]; if (!d) return null;
        var prev = st.data[1];
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: d.v, caption: fngWord(d.v), delta: prev ? d.v - prev.v : null, deltaLabel: L('vs. yesterday', '前日比', 'ggü. gestern', 'ко вчера', 'vs. ayer') }),
          R.progress(d.v, { label: L('Fear and greed', 'Fear & Greed', 'Angst und Gier', 'Страх и жадность', 'Miedo y codicia') }),
          R.source({ source: st.source, at: d.at }),
        ]);
      },
      l: function (ctx, cfg, st) {
        var d = st.data && st.data[0]; if (!d) return null;
        var series = st.data.slice().reverse().map(function (x) { return { v: x.v }; });
        return el('div', { class: 'wgt-body' }, [
          R.value({ value: d.v, caption: fngWord(d.v) }),
          R.series(series, { height: 58, min: 0, max: 100,
            axis: [WC.date(new Date(st.data[st.data.length - 1].at), { month: 'short', day: 'numeric' }), WC.date(new Date(d.at), { month: 'short', day: 'numeric' })],
            label: L('Fear and greed, last 30 days', '過去30日のFear & Greed', 'Angst und Gier, letzte 30 Tage', 'Страх и жадность за 30 дней', 'Miedo y codicia, últimos 30 días') }),
          R.facts([
            { k: L('30-day low', '30日の最低', '30-Tage-Tief', 'Минимум за 30 дней', 'Mínimo de 30 días'), v: Math.min.apply(null, st.data.map(function (x) { return x.v; })) },
            { k: L('30-day high', '30日の最高', '30-Tage-Hoch', 'Максимум за 30 дней', 'Máximo de 30 días'), v: Math.max.apply(null, st.data.map(function (x) { return x.v; })) },
          ], { cols: 2 }),
          R.source({ source: st.source, at: d.at }),
        ]);
      },
    },
  });
  function fngWord(v) {
    if (v <= 24) return L('Extreme fear', '極端な恐怖', 'Extreme Angst', 'Экстремальный страх', 'Miedo extremo');
    if (v <= 44) return L('Fear', '恐怖', 'Angst', 'Страх', 'Miedo');
    if (v <= 55) return L('Neutral', '中立', 'Neutral', 'Нейтрально', 'Neutro');
    if (v <= 74) return L('Greed', '強欲', 'Gier', 'Жадность', 'Codicia');
    return L('Extreme greed', '極端な強欲', 'Extreme Gier', 'Экстремальная жадность', 'Codicia extrema');
  }

  function metalDef(key, symbol, legacy, nm) {
    WC.define({
      id: 'markets.' + key, family: 'markets', variant: key, category: 'markets', icon: 'coin',
      legacyIds: [legacy],
      nm: nm,
      desc: function () { return L('Spot price, US dollars per troy ounce', 'スポット価格（USD/トロイオンス）', 'Spotpreis in US-Dollar je Feinunze', 'Спот-цена, доллары за тройскую унцию', 'Precio al contado, dólares por onza troy'); },
      keywords: function () { return [symbol, L('metal', '貴金属', 'Metall', 'металл', 'metal'), L('spot price', 'スポット価格', 'Spotpreis', 'спот-цена', 'precio al contado')]; },
      supportedSizes: ['s', 'm'], defaultSize: 's',
      configSchema: {}, defaultConfig: function () { return {}; },
      refreshPolicy: { kind: 'interval', minIntervalMs: 60000, staleAfterMs: 15 * 60000, cacheTtlMs: 30 * 60000 },
      requestKey: function () { return 'metal:' + symbol; },
      loader: function (ctx, cfg, signal) {
        return getJSON('https://api.gold-api.com/price/' + symbol, signal).then(function (j) {
          if (!j || j.price == null) throw new Error('no data');
          return { data: { price: +j.price, at: j.updatedAt ? +new Date(j.updatedAt) : Date.now() }, source: 'gold-api.com' };
        });
      },
      renderers: {
        s: function (ctx, cfg, st) {
          if (!st.data) return null;
          return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: '$' + WC.num(st.data.price, { maximumFractionDigits: 2 }), caption: L('per troy ounce', '1トロイオンスあたり', 'je Feinunze', 'за тройскую унцию', 'por onza troy') })]);
        },
        m: function (ctx, cfg, st) {
          if (!st.data) return null;
          return el('div', { class: 'wgt-body' }, [
            R.value({ small: true, value: '$' + WC.num(st.data.price, { maximumFractionDigits: 2 }), caption: L('per troy ounce', '1トロイオンスあたり', 'je Feinunze', 'за тройскую унцию', 'por onza troy') }),
            R.facts([{ k: L('Per gram', '1グラムあたり', 'Je Gramm', 'За грамм', 'Por gramo'), v: '$' + WC.num(st.data.price / 31.1034768, { maximumFractionDigits: 2 }) }]),
            R.source({ source: st.source, at: st.data.at }),
          ]);
        },
      },
    });
  }
  metalDef('gold', 'XAU', 'gold', function () { return L('Gold', '金', 'Gold', 'Золото', 'Oro'); });
  metalDef('silver', 'XAG', 'silver', function () { return L('Silver', '銀', 'Silber', 'Серебро', 'Plata'); });

  WC.define({
    id: 'markets.bitcoin-network', family: 'markets', variant: 'bitcoin-network', category: 'markets', icon: 'bitcoin',
    legacyIds: ['btc'],
    nm: function () { return L('Bitcoin network', 'Bitcoin ネットワーク', 'Bitcoin-Netzwerk', 'Сеть Bitcoin', 'Red Bitcoin'); },
    desc: function () { return L('Block height and current fees', 'ブロック高と現在の手数料', 'Blockhöhe und aktuelle Gebühren', 'Высота блока и текущие комиссии', 'Altura de bloque y comisiones actuales'); },
    keywords: function () { return ['bitcoin', L('block', 'ブロック', 'Block', 'блок', 'bloque'), L('fee', '手数料', 'Gebühr', 'комиссия', 'comisión'), 'mempool']; },
    supportedSizes: ['s', 'm'], defaultSize: 'm',
    configSchema: {}, defaultConfig: function () { return {}; },
    refreshPolicy: { kind: 'interval', minIntervalMs: 60000, staleAfterMs: 10 * 60000, cacheTtlMs: 20 * 60000 },
    requestKey: function () { return 'btc:network'; },
    loader: function (ctx, cfg, signal) {
      return Promise.all([
        getJSON('https://mempool.space/api/blocks/tip/height', signal),
        getJSON('https://mempool.space/api/v1/fees/recommended', signal).catch(function () { return null; }),
      ]).then(function (r) { return { data: { height: +r[0], fees: r[1] }, source: 'mempool.space' }; });
    },
    renderers: {
      s: function (ctx, cfg, st) {
        if (!st.data) return null;
        return el('div', { class: 'wgt-body' }, [R.value({ small: true, value: '#' + WC.num(st.data.height), caption: L('block height', 'ブロック高', 'Blockhöhe', 'высота блока', 'altura de bloque') })]);
      },
      m: function (ctx, cfg, st) {
        if (!st.data) return null;
        var f = st.data.fees;
        return el('div', { class: 'wgt-body' }, [
          R.value({ small: true, value: '#' + WC.num(st.data.height), caption: L('block height', 'ブロック高', 'Blockhöhe', 'высота блока', 'altura de bloque') }),
          f ? R.facts([
            { k: L('Fast', '高速', 'Schnell', 'Быстро', 'Rápido'), v: f.fastestFee + ' sat/vB' },
            { k: L('Economy', '低速', 'Sparsam', 'Экономно', 'Económico'), v: f.economyFee + ' sat/vB' },
          ], { cols: 2 }) : null,
          R.source({ source: st.source, at: st.lastSuccessfulAt }),
        ]);
      },
    },
  });

  return { FX_CCY: FX_CCY, ccyLabel: ccyLabel, DEF_FX: DEF_FX, fngWord: fngWord, coinName: coinName };
})();
