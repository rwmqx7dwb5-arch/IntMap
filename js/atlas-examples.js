/* ============================================================================
 *  IntMap · Atlas — the starter chips  (#R309 · rewritten #R313)
 * ----------------------------------------------------------------------------
 *  The four example questions the Atlas panel offers before a conversation starts, and the rule
 *  that decides WHICH four.
 *
 *  ══ ⚠⚠⚠ (#R313) 「いや、汎用文でごまかすな。」 ═══════════════════════════════════════════════
 *  #R309 answered 「今地図で見ている地域に応じて用意して変えるように」 by keeping FOUR FIXED
 *  SENTENCES and substituting the country's name into each one. Kenya got 「Compare Kenya with its
 *  neighbours — GDP, defense and population」 and so did Japan, and so did Liechtenstein: a mail
 *  merge, which is what the reader came back and called it. The chips changed; the QUESTIONS never
 *  did.
 *
 *  A question is region-specific when it is about something that is TRUE OF THAT REGION AND NOT OF
 *  THE NEXT ONE. So the chips are no longer a list — they are a POOL of candidate questions, each
 *  one carrying a predicate over facts this app already holds, and the four that appear are the
 *  four whose facts actually hold here:
 *
 *    · the country's own measured attributes — `countryStats` (js/countries-ui.js): population,
 *      area, density, GDP, GDP per head, HDI, democracy index, defence spending, life expectancy,
 *      internet reach, subregion, capital. Extremes are decided by RANK inside that same table, not
 *      by a threshold somebody typed, so 「one of the most densely populated countries on Earth」 is
 *      a claim the data makes and can stop making.
 *    · what the reader has switched ON right now — the weather alerts they are looking at, the
 *      earthquake layer, the wind field, the volcanoes — because a chip about the layer under the
 *      cursor is the most specific question there is.
 *    · where Chronos is — a reader who has wound the clock to 1962 is not asking about this week.
 *
 *  Mongolia and Bangladesh are both 「a country」 and share not one chip: Mongolia is last in the
 *  world on density and Bangladesh is near first, and the pool has a question for each end.
 *
 *  ⚠ THE POOL IS FIXED STRINGS, WHICH IS WHAT KEEPS NINE LANGUAGES REACHABLE. Every candidate is an
 *  ordinary `L(en, ja, de, ru, es)` call with a literal first argument — scripts/i18n-report.mjs
 *  drops any `L()` whose first argument is not a Literal, and #R309 found four chips reading English
 *  in zh/zh-Hans/fr/ko while the gate reported 100 %. What varies by region is WHICH candidates are
 *  eligible, never how a sentence is built.
 *  ⚠ AND EVERY LANGUAGE PUTS `{place}` WHERE A BARE PROPER NOUN IS GRAMMATICAL (#R309). `cName()`
 *  returns the CLDR name — no article, nominative — so Russian and German are written with the name
 *  first as an APPOSITIVE (`{place}: …`), never in a slot that governs a case or wants an article.
 *  ⚠ The ENGLISH string is the KEY the four keyed languages are resolved by. Do not reword one for
 *  grammar: the locale tables are indexed on it.
 *
 *  Lifted out of js/atlas-console.js in #R309 because that file is at #R199's 5,300-line ceiling and
 *  the ceiling is never raised — a subject moves out instead.
 * ==========================================================================*/
export function makeAtlasExamples(HOST, CTX) {
  const L=CTX.L, GE=CTX.GE, codeAtPoint=CTX.codeAtPoint, countryStats=CTX.countryStats,
        cName=CTX.cName, loadCountryData=CTX.loadCountryData, panelEl=CTX.panelEl, pick=CTX.pick;

    /* ══ the measured extremes ════════════════════════════════════════════════════════════════
       A rank inside `countryStats` rather than a number in this file. 「among the densest countries
       on Earth」 has to stop being true if the table changes, and a threshold cannot do that.
       Sovereign states only — js/countries-ui.js flags shoals, ice fields and Bir Tawil as `sov:
       false` (#R23) and ranking against them would let a disputed sandbar outrank Bangladesh. */
    let _rk=null, _rkN=-1;
    function ranks(){
      const codes=Object.keys(countryStats||{});
      if(_rk&&_rkN===codes.length) return _rk;
      const rows=codes.map(c=>countryStats[c]).filter(s=>s&&s.sov!==false);
      const by=(f)=>{ const m=Object.create(null);
        rows.filter(s=>{ const v=f(s); return v!=null&&isFinite(v)&&v>0; })
            .sort((a,b)=>f(b)-f(a))
            .forEach((s,i,arr)=>{ m[s.code]={hi:i+1, lo:arr.length-i, n:arr.length}; });
        return m; };
      _rk={ pop:by(s=>s.pop), area:by(s=>s.area), density:by(s=>s.density), gdp:by(s=>s.gdp),
            gdppc:by(s=>s.gdppc), hdi:by(s=>s.hdi), dem:by(s=>s.dem), life:by(s=>s.lifeExp),
            net:by(s=>s.internet), milShare:by(s=>(s.milSpend&&s.gdp)?(s.milSpend/s.gdp):null) };
      _rkN=codes.length;
      return _rk;
    }
    const hi=(k,code,n)=>{ const r=ranks()[k][code]; return !!(r&&r.hi<=n); };
    const lo=(k,code,n)=>{ const r=ranks()[k][code]; return !!(r&&r.lo<=n&&r.n>=40); };

    /* ══ what the reader has switched on ══════════════════════════════════════════════════════
       Read from the layer registry's own checkboxes — the widest and most honest answer to 「which
       layers are on」 (js/atlas-console.js's `layerCatalog` reads the same boxes). Base map rows are
       skipped: they are on in every session and say nothing about what the reader came to look at. */
    const BASE_SKIP=/^(dl-(labels|borders|country|coast|grid|terrain|places))$/;
    function onLayers(){
      const out=[];
      try{
        const dd=document.getElementById('layer-dropdown'); if(!dd) return out;
        dd.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
          if(!cb.checked||!cb.id||BASE_SKIP.test(cb.id)) return;
          const row=cb.closest('.layer-option')||cb.parentElement;
          let lbl=''; try{ lbl=String((row&&row.textContent)||'').replace(/\s+/g,' ').trim().slice(0,42); }catch(_){}
          out.push({ id:cb.id, label:lbl });
        });
      }catch(_){}
      return out;
    }

    /* ══ the facts, gathered once per redraw ══════════════════════════════════════════════════ */
    function exFacts(){ try{
      const c=GE().camera.getCenter(); if(!c||!isFinite(c.lng)) return null;
      const z=GE().camera.getZoom();
      /* ⚠ (#R309) THE ZOOM FLOOR IS PART OF THE ANSWER, NOT A TUNING KNOB. At z<2.5 the centre pixel
         lands in some country by arithmetic, but the reader is looking at a hemisphere — naming that
         country would be the same "a name for a guess" mistake #R302 removed from the daylight panel. */
      const near=(z>=2.5)?codeAtPoint(c.lng,c.lat):null;
      const st=near?((typeof countryStats!=='undefined'&&countryStats)?countryStats[near]:null):null;
      const nm=st?cName(st):null;
      const ly=onLayers(), ids=new Set(ly.map(x=>x.id));
      let year=null, live=true;
      try{ const t=window.IntMapTime.state(); live=!!t.isLive; year=t.year; }catch(_){}
      return { code:(st&&nm)?near:'', name:nm||'', st:st||null,
               layers:ly, has:(id)=>ids.has(id), year:year, live:live, zoom:z };
    }catch(_){ return null; } }

    /* ══ the pool ═════════════════════════════════════════════════════════════════════════════
       `w` is how DISTINCTIVE the fact is, not how interesting the question sounds: a measured
       extreme outranks an attribute every country has. The four generic ones #R309 shipped are kept
       at the bottom — they are real questions and their nine translations exist, and something has
       to fill the fourth slot for a country the tables know little about. They can no longer crowd
       out a question about the thing that makes this place different, which was the complaint. */
    const P=[
      /* ── what the reader is looking at right now ─────────────────────────────────────────── */
      { k:'alerts', w:10, on:(f)=>f.st&&f.has('wp-dl-alerts'),
        t:()=>L('Which weather warnings are in force over {place} right now, and who issued them?',
                '{place}でいま発表中の気象警報は？ 発表元はどこ？',
                '{place}: Welche Wetterwarnungen gelten dort gerade, und von wem stammen sie?',
                '{place}: какие метеопредупреждения действуют прямо сейчас и кто их выпустил?',
                '{place}: ¿qué avisos meteorológicos están vigentes ahora y quién los emitió?') },
      { k:'quake', w:10, on:(f)=>f.st&&f.has('bx-eq'),
        t:()=>L('What has been shaking near {place}, and which fault or plate boundary is behind it?',
                '{place}の近くで最近起きた地震は？ どの断層・プレート境界のせい？',
                '{place}: Wo hat es dort zuletzt gebebt, und welche Störung oder Plattengrenze steckt dahinter?',
                '{place}: где рядом недавно трясло и какой разлом или граница плит за это отвечает?',
                '{place}: ¿dónde ha temblado cerca y qué falla o límite de placas lo explica?') },
      { k:'volc', w:10, on:(f)=>f.st&&f.has('beta-dl-volc2'),
        t:()=>L('Which volcanoes near {place} are restless, and what would an eruption reach?',
                '{place}周辺で活動中の火山は？ 噴火したらどこまで影響する？',
                '{place}: Welche Vulkane in der Nähe sind unruhig, und wie weit reichte ein Ausbruch?',
                '{place}: какие вулканы поблизости активны и куда дотянется извержение?',
                '{place}: ¿qué volcanes cercanos están activos y hasta dónde llegaría una erupción?') },
      { k:'wind', w:9, on:(f)=>f.st&&f.has('dl-wind'),
        t:()=>L('What is driving the wind pattern over {place} today?',
                '{place}上空のいまの風の流れは何で決まっている？',
                '{place}: Was treibt das Windmuster über dem Land heute an?',
                '{place}: чем определяется сегодняшний рисунок ветра над страной?',
                '{place}: ¿qué está impulsando el patrón de viento de hoy?') },
      { k:'cables', w:9, on:(f)=>f.st&&f.has('dl-subcables'),
        t:()=>L('Which submarine cables land in {place}, and what happens if one is cut?',
                '{place}に陸揚げされている海底ケーブルは？ 1本切れたら何が起きる？',
                '{place}: Welche Seekabel landen dort an, und was passiert, wenn eines reißt?',
                '{place}: какие подводные кабели туда заходят и что будет, если один перережут?',
                '{place}: ¿qué cables submarinos llegan allí y qué pasa si se corta uno?') },
      { k:'planes', w:8, on:(f)=>f.st&&f.has('dl-planes'),
        t:()=>L('What is flying over {place} right now, and where are those aircraft going?',
                'いま{place}の上空を飛んでいるのは？ どこへ向かっている？',
                '{place}: Was fliegt gerade darüber, und wohin?',
                '{place}: что сейчас летит над страной и куда?',
                '{place}: ¿qué está sobrevolando ahora y hacia dónde va?') },
      { k:'ships', w:8, on:(f)=>f.st&&f.has('dl-ships'),
        t:()=>L('What is moving through {place}’s waters right now, and what is it carrying?',
                'いま{place}の海域を通っている船は？ 何を運んでいる？',
                '{place}: Was fährt gerade durch die Gewässer, und was hat es geladen?',
                '{place}: что сейчас идёт через её воды и что везёт?',
                '{place}: ¿qué navega ahora por sus aguas y qué transporta?') },
      /* ── where Chronos is ────────────────────────────────────────────────────────────────── */
      { k:'year', w:9, on:(f)=>f.st&&!f.live&&f.year&&f.year<new Date().getFullYear(),
        t:()=>L('What was happening in {place} in {year}?',
                '{year}年の{place}では何が起きていた？',
                '{place}: Was geschah dort im Jahr {year}?',
                '{place}: что там происходило в {year} году?',
                '{place}: ¿qué estaba pasando allí en {year}?') },
      /* ── measured extremes ───────────────────────────────────────────────────────────────── */
      { k:'dense', w:9, on:(f)=>f.st&&hi('density',f.code,10),
        t:()=>L('{place} is one of the most crowded countries on Earth — how does it absorb that?',
                '{place}は世界有数の人口密度。どうやって吸収している？',
                '{place}: eines der am dichtesten besiedelten Länder der Erde — wie verkraftet es das?',
                '{place} — одна из самых густонаселённых стран мира. Как она это выдерживает?',
                '{place} es uno de los países más densos del mundo: ¿cómo lo absorbe?') },
      { k:'empty', w:9, on:(f)=>f.st&&lo('density',f.code,10)&&f.st.area>100000,
        t:()=>L('Almost nobody lives per square kilometre in {place} — so where do people actually live?',
                '{place}は人口密度が世界最低水準。人は実際どこに住んでいる？',
                '{place}: kaum jemand pro Quadratkilometer — wo leben die Menschen dann wirklich?',
                '{place}: плотность населения одна из самых низких в мире. Где же люди живут?',
                '{place} tiene una de las densidades más bajas del mundo: ¿dónde vive la gente?') },
      { k:'vast', w:8, on:(f)=>f.st&&hi('area',f.code,8),
        t:()=>L('{place} spans enormous distances — how is it physically held together?',
                '{place}は国土が極端に広い。物理的にどうつながっている？',
                '{place}: gewaltige Entfernungen — wie hält das Land physisch zusammen?',
                '{place}: колоссальные расстояния. Что физически связывает страну воедино?',
                '{place} abarca distancias enormes: ¿cómo se mantiene unido físicamente?') },
      { k:'micro', w:9, on:(f)=>f.st&&f.st.area>0&&f.st.area<1500,
        t:()=>L('{place} is tiny — what does its economy actually run on?',
                '{place}はごく小さい国。経済は実際何で回っている？',
                '{place}: ein winziges Land — wovon lebt seine Wirtschaft tatsächlich?',
                '{place}: совсем маленькая страна. На чём в самом деле держится её экономика?',
                '{place} es diminuto: ¿de qué vive realmente su economía?') },
      { k:'bigecon', w:8, on:(f)=>f.st&&hi('gdp',f.code,10),
        t:()=>L('{place} is one of the largest economies in the world — what is actually carrying it?',
                '{place}は世界有数の経済規模。実際に支えているのは何？',
                '{place}: eine der größten Volkswirtschaften der Welt — was trägt sie wirklich?',
                '{place} — одна из крупнейших экономик мира. Что её на самом деле держит?',
                '{place} es una de las mayores economías del mundo: ¿qué la sostiene realmente?') },
      { k:'rich', w:8, on:(f)=>f.st&&hi('gdppc',f.code,10),
        t:()=>L('How does {place} sustain one of the highest incomes per person anywhere?',
                '{place}はなぜ1人あたり所得が世界最高水準を保てている？',
                '{place}: Wie hält es eines der höchsten Pro-Kopf-Einkommen der Welt?',
                '{place}: как стране удаётся удерживать один из самых высоких доходов на душу?',
                '{place}: ¿cómo sostiene una de las rentas por habitante más altas del mundo?') },
      { k:'mil', w:9, on:(f)=>f.st&&hi('milShare',f.code,12),
        t:()=>L('{place} spends an unusually large share of its economy on defense — on what, and against what?',
                '{place}は経済規模に対して国防費が突出している。何に、何に備えて？',
                '{place}: ein ungewöhnlich großer Teil der Wirtschaft geht ins Militär — wofür, und gegen wen?',
                '{place}: на оборону уходит необычно большая доля экономики. На что именно и против чего?',
                '{place} dedica a defensa una parte inusualmente grande de su economía: ¿en qué y frente a qué?') },
      { k:'hdilow', w:8, on:(f)=>f.st&&lo('hdi',f.code,25),
        t:()=>L('What single change would do the most for everyday life in {place}?',
                '{place}の暮らしを最も大きく変えるとしたら、何を1つ変える？',
                '{place}: Welche eine Veränderung würde dem Alltag dort am meisten bringen?',
                '{place}: какое одно изменение сильнее всего улучшило бы повседневную жизнь?',
                '{place}: ¿qué único cambio mejoraría más la vida cotidiana?') },
      { k:'demlow', w:8, on:(f)=>f.st&&f.st.dem!=null&&f.st.dem<4,
        t:()=>L('How is {place} actually governed, and who really decides?',
                '{place}は実際どう統治されている？ 本当に決めているのは誰？',
                '{place}: Wie wird das Land tatsächlich regiert, und wer entscheidet wirklich?',
                '{place}: как страна управляется на деле и кто на самом деле решает?',
                '{place}: ¿cómo se gobierna realmente y quién decide de verdad?') },
      { k:'demhigh', w:6, on:(f)=>f.st&&hi('dem',f.code,12),
        t:()=>L('What keeps {place}’s institutions working as well as they do?',
                '{place}の制度はなぜうまく機能し続けている？',
                '{place}: Was hält die Institutionen dort so funktionsfähig?',
                '{place}: за счёт чего институты страны работают так устойчиво?',
                '{place}: ¿qué hace que sus instituciones funcionen tan bien?') },
      { k:'lifehigh', w:7, on:(f)=>f.st&&hi('life',f.code,8),
        t:()=>L('Why do people in {place} live longer than almost anywhere else?',
                '{place}の人はなぜ世界でも際立って長生きなのか？',
                '{place}: Warum leben die Menschen dort länger als fast überall sonst?',
                '{place}: почему там живут дольше, чем почти где-либо ещё?',
                '{place}: ¿por qué se vive allí más que en casi cualquier otro sitio?') },
      { k:'netlow', w:7, on:(f)=>f.st&&f.st.internet!=null&&f.st.internet<45,
        t:()=>L('How much of {place} is actually online, and what is the bottleneck?',
                '{place}で実際にネットにつながっているのはどれくらい？ 何が詰まっている？',
                '{place}: Wie viele sind dort wirklich online, und wo klemmt es?',
                '{place}: какая часть страны реально в сети и что этому мешает?',
                '{place}: ¿qué parte está realmente conectada y dónde está el cuello de botella?') },
      { k:'crowdpop', w:7, on:(f)=>f.st&&hi('pop',f.code,12),
        t:()=>L('Where are {place}’s people concentrated, and where is that shifting?',
                '{place}の人口はどこに集中していて、どこへ動いている？',
                '{place}: Wo konzentrieren sich die Menschen, und wohin verschiebt sich das?',
                '{place}: где сосредоточено население и куда оно смещается?',
                '{place}: ¿dónde se concentra la población y hacia dónde se desplaza?') },
      /* ── attributes every country has, so these only ever fill the tail ─────────────────── */
      /* ⚠⚠ (#R313 追記) THIS CHIP NAMED THE CAPITAL, AND THE APP ONLY HAS THAT NAME IN ENGLISH.
         `CAPITAL` in js/tables.js is an English table — CLDR has no city names, and OSM's `name:xx`
         values live inside vector tiles, not in anything this module can ask. So a Japanese reader
         was handed 「Ulaanbaatarで起きていることのうち…」: a fully translated sentence with an
         untranslated value dropped into the middle of it. ⚠ `npm run check:i18n` CANNOT SEE THIS —
         the TEMPLATE is complete in all nine languages; it is the substituted value that is not.
         Measured on production in ja: six countries, six English city names.
         → the question keeps its subject and loses the name it could not translate. */
      { k:'capital', w:5, on:(f)=>f.st&&!!f.st.capital,
        t:()=>L('What happens in {place}’s capital that matters beyond its borders?',
                '{place}の首都で起きていることのうち、国外にまで効くのは？',
                '{place}: Was passiert in der Hauptstadt, das über das Land hinaus zählt?',
                '{place}: что происходит в столице и имеет значение за пределами страны?',
                '{place}: ¿qué ocurre en su capital que importe más allá del país?') },
      { k:'subregion', w:5, on:(f)=>f.st&&!!f.st.subregion,
        t:()=>L('How does {place} differ from the rest of {sub}?',
                '{place}は{sub}の他の国とどこが違う？',
                '{place}: Worin unterscheidet es sich vom übrigen {sub}?',
                '{place}: чем страна отличается от остальной части региона «{sub}»?',
                '{place}: ¿en qué se diferencia del resto de {sub}?') },
      /* ── #R309's four, kept as candidates (their nine translations are live) ────────────── */
      { k:'latest', w:4, on:(f)=>!!f.st,
        t:()=>L('Brief me on {place} — the latest','{place}でいま何が起きている？','{place}: Lagebericht — was passiert gerade?','{place} — что происходит прямо сейчас?','{place}: ¿qué está pasando ahora?') },
      { k:'neighbours', w:3, on:(f)=>!!f.st,
        t:()=>L('Compare {place} with its neighbours — GDP, defense and population','{place}と周辺国を比較（GDP・国防費・人口）','{place} und seine Nachbarländer — BIP, Militär, Bevölkerung vergleichen','{place} и соседние страны — сравнить ВВП, оборону и население','{place} y sus países vecinos: comparar PIB, defensa y población') },
      { k:'since1990', w:3, on:(f)=>!!f.st,
        t:()=>L("How has {place}'s economy changed since 1990?",'{place}の経済は1990年からどう変わった？','{place}: Wie hat sich die Wirtschaft seit 1990 entwickelt?','{place}: как изменилась экономика с 1990 года?','{place}: ¿cómo ha cambiado la economía desde 1990?') },
      { k:'wx', w:2, on:(f)=>!!f.st,
        t:()=>L('What is the weather and any active warnings in {place}?','{place}の天気と発表中の警報は？','{place}: Wetter und aktive Warnungen?','{place}: погода и действующие предупреждения?','{place}: ¿qué tiempo hace y qué avisos hay activos?') }
    ];

    /* the world-scale pool — same machinery, so「nowhere in particular」 is not four constants either */
    const W=[
      { k:'w-year', w:9, on:(f)=>f&&!f.live&&f.year&&f.year<new Date().getFullYear(),
        t:()=>L('What did the world look like in {year}?','{year}年の世界はどうなっていた？','Wie sah die Welt im Jahr {year} aus?','Каким был мир в {year} году?','¿Cómo era el mundo en {year}?') },
      { k:'w-alerts', w:8, on:(f)=>f&&f.has('wp-dl-alerts'),
        t:()=>L('Where in the world are the most severe weather warnings in force right now?','いま世界で最も重い気象警報が出ているのはどこ？','Wo auf der Welt gelten gerade die schwersten Wetterwarnungen?','Где в мире сейчас действуют самые серьёзные метеопредупреждения?','¿Dónde del mundo están vigentes ahora los avisos meteorológicos más graves?') },
      { k:'w-quake', w:8, on:(f)=>f&&f.has('bx-eq'),
        t:()=>L('Which plate boundaries have been most active in the past week?','この1週間で最も活動的だったプレート境界は？','Welche Plattengrenzen waren in der vergangenen Woche am aktivsten?','Какие границы плит были активнее всего за последнюю неделю?','¿Qué límites de placas han estado más activos esta semana?') },
      { k:'w-cables', w:8, on:(f)=>f&&f.has('dl-subcables'),
        t:()=>L('Which submarine cable chokepoints carry the most of the world’s traffic?','世界の通信量が最も集中している海底ケーブルの隘路はどこ？','Welche Seekabel-Nadelöhre tragen den größten Teil des Weltverkehrs?','Какие узкие места подводных кабелей несут наибольшую часть мирового трафика?','¿Qué cuellos de botella de cables submarinos llevan la mayor parte del tráfico mundial?') },
      { k:'w-compare', w:4, on:()=>true,
        t:()=>L('Compare the USA, China and India — GDP, defense and population','日本・ドイツ・インドを比較（GDP・国防費・人口）','USA, China und Indien vergleichen — BIP, Militär, Bevölkerung','Сравнить США, Китай и Индию — ВВП, оборона, население','Comparar EE. UU., China e India — PIB, defensa y población') },
      { k:'w-mil', w:4, on:()=>true,
        t:()=>L('Which countries spend the most on defense relative to GDP?','GDP比で国防費が最も高い国は？','Welche Länder geben gemessen am BIP am meisten fürs Militär aus?','Какие страны тратят на оборону больше всего относительно ВВП?','¿Qué países gastan más en defensa respecto a su PIB?') },
      { k:'w-scs', w:3, on:()=>true,
        t:()=>L('Brief me on the South China Sea — the latest','南シナ海でいま何が起きている？','Lagebericht Südchinesisches Meer — was passiert gerade?','Что происходит в Южно-Китайском море прямо сейчас?','¿Qué está pasando ahora en el Mar de China Meridional?') },
      { k:'w-life', w:3, on:()=>true,
        t:()=>L('Which countries have the highest life expectancy?','平均寿命が最も長い国は？','Welche Länder haben die höchste Lebenserwartung?','В каких странах самая высокая продолжительность жизни?','¿Qué países tienen mayor esperanza de vida?') }
    ];

    /* ⚠ DETERMINISTIC. Same facts → same four, in the same order, so a redraw that changes nothing
       cannot reshuffle the row under the reader's finger. Weight first, then the key, alphabetically. */
    function choose(pool,f){
      return pool.filter(x=>{ try{ return !!x.on(f); }catch(_){ return false; } })
                 .sort((a,b)=>(b.w-a.w)||(a.k<b.k?-1:a.k>b.k?1:0))
                 .slice(0,4);
    }
    /* ⚠⚠ (#R313 追記) EVERY VALUE THAT LANDS IN A CHIP IS IN THE READER'S LANGUAGE, OR IT DOES NOT LAND.
       `{place}` always was (cName → CLDR). `{sub}` was not: `countryStats.subregion` is Natural Earth's
       English string, so ja read 「モンゴル国はEastern Asiaの他の国とどこが違う？」 — the same defect as
       the capital above, and just as invisible to the i18n gate, because what is missing is not a
       template but a VALUE.
       ⚠ Those strings are not arbitrary: they are the UN M49 macro-regions, and CLDR names every one of
       them in all nine languages. So this is a CODE table, not a translation table — the answer comes
       from the same door the country names come from (`window._imCldrRegion`, taught about three-digit
       codes in js/countries-ui.js). ⚠ ENGLISH NEVER REACHES CLDR — `_imCldrRegion` short-circuits on
       'en' — and that is load-bearing rather than incidental: CLDR's English REWORDS three of these
       ('Southeast Asia' for 035, 'Australasia' for 053, 'Micronesian Region' for 057), so routing en
       through it would change the one language that never needed translating.
       ⚠ MEASURED AGAINST THE SHIPPED DATA, NOT ASSUMED COMPLETE: the countries file carries 22 distinct
       subregions over 177 features; this table names 20 of them, covering 175. The two it does not are
       「Antarctica」 and 「Seven seas (open ocean)」 — neither is an M49 macro-region and CLDR has no name
       for either, so they fall through to the English string, which is the honest answer rather than a
       wrong one. Any subregion added upstream falls through the same way. */
    const M49={ 'Eastern Asia':'030','South-Eastern Asia':'035','Southern Asia':'034','Central Asia':'143',
      'Western Asia':'145','Northern Europe':'154','Western Europe':'155','Southern Europe':'039',
      'Eastern Europe':'151','Northern Africa':'015','Western Africa':'011','Middle Africa':'017',
      'Eastern Africa':'014','Southern Africa':'018','Northern America':'021','Central America':'013',
      'Caribbean':'029','South America':'005','Australia and New Zealand':'053','Melanesia':'054',
      'Micronesia':'057','Polynesia':'061' };
    function subName(st){ const s=(st&&st.subregion)||''; if(!s) return '';
      try{ const c=M49[s]; if(c&&window._imCldrRegion){ const n=window._imCldrRegion(c,HOST.lang); if(n) return n; } }catch(_){}
      return s; }
    function fill(txt,f){
      const st=f&&f.st;
      return String(txt)
        .replace(/\{place\}/g,(f&&f.name)||'')
        .replace(/\{sub\}/g,subName(st))
        .replace(/\{year\}/g,String((f&&f.year)||''));
    }
    function examples(){
      const f=exFacts();
      const usePlace=!!(f&&f.st&&f.name);
      const picked=choose(usePlace?P:W,f||{ st:null, has:()=>false, live:true, year:null });
      const out=picked.map(x=>fill(x.t(),f));
      /* a pool that somehow answered nothing still has to put four chips on the row */
      if(out.length<4){ W.filter(x=>x.w<=4).forEach(x=>{ if(out.length<4) out.push(fill(x.t(),f)); }); }
      return out.slice(0,4);
    }
    /* the signature the redraw guard compares. It has to name every fact the pool can read, or a
       reader who switches a layer on keeps yesterday's chips (#R309's guard only knew the country). */
    function exKey(f){
      if(!f) return 'x|'+HOST.lang;
      return (f.code||'')+'|'+HOST.lang+'|'+(f.live?'live':('y'+f.year))+'|'+f.layers.map(x=>x.id).sort().join(',');
    }

    /* (#R309) draw the chips. `force` ignores the "did the subject change" guard (a language change
       changes every string without changing the place). Silent while the row is hidden — a
       conversation has started and the chips are gone until the panel is rebuilt. */
    let _exKey=null;
    function renderExamples(force){ try{
      const panel=panelEl(); if(!panel) return; const ew=panel.querySelector('.atl-ex'); if(!ew) return;
      if(ew.style.display==='none') return;
      const key=exKey(exFacts());
      if(!force&&key===_exKey) return; _exKey=key;
      ew.innerHTML='';
      examples().forEach(ex=>{ const b=document.createElement('button'); b.className='atl-chip'; b.textContent=ex; b.onclick=()=>{ pick(ex); }; ew.appendChild(b); });
    }catch(_){} }
    /* ⚠ (#R309) DEBOUNCED, and on the camera's own settle — not on every frame. 600 ms is the same
       quiet the widget scheduler waits for after a pan (js/widget-scheduler.js), so the two agree on
       what "the reader has stopped moving" means. The guard above means a pan that stays inside one
       country costs one `codeAtPoint` and redraws nothing. */
    let _exWired=false, _exT=null;
    function _wireExampleCamera(){ if(_exWired) return; _exWired=true;
      const bump=()=>{ clearTimeout(_exT); _exT=setTimeout(()=>{ try{ renderExamples(); }catch(_){} },600); };
      try{ if(window.IntMapRuntime&&window.IntMapRuntime.onCamera) window.IntMapRuntime.onCamera('atlas-examples',bump,{phase:'read'});
        else GE().events.on('moveend',bump); }catch(_){ try{ GE().events.on('moveend',bump); }catch(__){} }
      /* the country table arrives after boot; until it does `exFacts` can only answer «nowhere». */
      try{ if(typeof loadCountryData==='function') loadCountryData().then(()=>{ try{ renderExamples(); }catch(_){} }); }catch(_){}
      /* ⚠ (#R313) …AND ON THE OTHER TWO THINGS THE POOL READS. The chips are about what the reader
         has switched on and where the clock is, so a layer toggle and a Chronos move have to reach
         them exactly as a pan does. Same debounce, same guard — `exKey` carries the layer set and
         the instant, so a change that does not alter the four chips still redraws nothing. */
      try{ document.addEventListener('change',(e)=>{ const t=e&&e.target;
        if(t&&t.type==='checkbox'&&t.id&&/^(dl-|wp-dl-|beta-dl-|bx-|eco-dl-|l9-dl-)/.test(t.id)) bump(); },true); }catch(_){}
      try{ if(window.IntMapTime&&window.IntMapTime.on) window.IntMapTime.on(()=>bump()); }catch(_){}
    }
  return { renderExamples, wireExamples: _wireExampleCamera };
}
