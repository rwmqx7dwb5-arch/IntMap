/* ============================================================================
 *  IntMap · Atlas — the starter chips  (#R309 · rewritten #R313 · widened #R337)
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
 *  ══ ⚠⚠⚠ (#R337) 「まだほぼ定型文みたいなものしかない。もっとその場所にあったものに。」 ═══════════
 *  #R313 built the pool and it was still not enough, for a reason that is countable rather than a
 *  matter of taste: EVERY specific candidate it wrote was gated on a WORLD EXTREME — top ten on
 *  density, top eight on area, top twelve on defence share — and an extreme admits ten countries.
 *  For the ~150 states that are extreme in nothing, the eligible set was the always-true tail
 *  (`capital` / `subregion` / `latest` / `neighbours` / `since1990` / `wx`), which is #R309's mail
 *  merge with two more sentences in it. The chips were a pool; the QUESTIONS were still four.
 *
 *  So the pool grew by 26 candidates along three axes that partition the whole world instead of
 *  skimming its ends, and every one of them reads data `countryStats` ALREADY holds:
 *    · WHERE THE COUNTRY IS — measured from its own footprint (#R185's `bbox`). The equator inside
 *      the box, the Arctic Circle inside the box, the whole box between the tropics, and how much
 *      sea the territory is spread over per km² of land. These are true BY CONSTRUCTION of a
 *      measurement, not by a list of country codes somebody typed.
 *    · WHAT IT RUNS ON — how many languages (`LANGS`), whose money (`CURRENCY`). 「{place} uses the
 *      US dollar instead of a currency of its own」 is a question about eight countries and about
 *      no others.
 *    · TWO FACTS AT ONCE — rich AND tightly governed, a big economy AND a low income per head, long
 *      lives AND modest means. A pair separates countries that no single rank can: Qatar and Norway
 *      are both in the top ten on income per head and only one of them is in the first pair.
 *  …and by eight more LAYER-gated candidates, because #R313 covered seven of the hundred-odd rows in
 *  the panel and a chip about the layer under the reader's cursor is the most specific one there is.
 *
 *  ⚠ THE TAIL IS NOT DELETED. It is what a country the tables know almost nothing about still gets,
 *  and its four sentences are real questions with live translations. What changed is that it can no
 *  longer take three of the four slots from a country the tables DO know something about — which is
 *  the property tests/r337-checks.test.mjs measures, by running this module's own chooser over a
 *  synthetic world rather than by reading the wording back out of this file.
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
      /* ══ ⚠⚠⚠ (#R337) 「まだほぼ定型文みたいなものしかない。もっとその場所にあったものに。」 ═══════
         #R313's pool asks about EXTREMES — top ten on density, top eight on area — so a country
         that is extreme in nothing had three of its four chips filled from the always-eligible
         tail. That tail is the mail merge the reader is still looking at, and no wording fixes it:
         what has to change is HOW MANY facts the pool can tell two countries apart by. So three new
         families of fact, all of them already in `countryStats`, and none of them a threshold about
         the WORLD that only ten countries can ever cross:
           · the country's own FOOTPRINT (#R185's `bbox`, [w,s,e,n]). Three of the four facts below
             are true BY CONSTRUCTION of that box — the equator is inside it, the Arctic Circle is
             inside it, the whole box lies between the tropics. The fourth is a ratio of two
             measurements: how much sea the territory is spread over, per km² of land.
           · what the country RUNS ON — how many languages (`LANGS`), whose money (`CURRENCY`).
           · COMBINATIONS, which are the most distinctive facts there are: rich AND tightly
             governed, a big economy AND a low income per head, long lives AND modest means. No
             single rank separates Qatar from Norway; the pair of them does.
         ⚠ THE ANTIMERIDIAN IS EXCLUDED, NOT WORKED AROUND. Russia, the USA, Fiji, New Zealand and
         Kiribati arrive as rings that cross ±180, so a plain extent gives them a 360° span. Every
         longitudinal claim is refused for a box wider than 180°, because this module genuinely
         cannot tell 「spans the date line」 from 「spans the planet」 — and a chip that guesses is the
         defect this round exists to remove. */
      const bb=(st&&st.bbox&&st.bbox.length===4&&st.bbox.every(v=>isFinite(v)))?st.bbox:null;
      const spanLon=bb?(bb[2]-bb[0]):0, spanLat=bb?(bb[3]-bb[1]):0, midLat=bb?((bb[1]+bb[3])/2):0;
      const wrapped=!bb||spanLon>=180;
      const kmLon=wrapped?0:(spanLon*111.32*Math.cos(midLat*Math.PI/180)), kmLat=spanLat*110.57;
      const boxKm2=(kmLon>0&&kmLat>0)?(kmLon*kmLat):0;
      const geo={
        equator: !!(bb&&bb[1]<-0.2&&bb[3]>0.2),
        arctic:  !!(bb&&bb[3]>=66.56),
        tropics: !!(bb&&Math.abs(bb[1])<23.44&&Math.abs(bb[3])<23.44),
        mid:     bb?midLat:null,
        /* ⚠ THIS MEASURES OUTLYING TERRITORY, NOT 「is it an archipelago」, and the chip it gates is
           worded as exactly that. France scores 184 because Guiana and Réunion arrive inside its
           own feature; the Philippines scores 6.4 because its islands are packed together. */
        spread:  (boxKm2>0&&st&&st.area>0)?(boxKm2/st.area):0
      };
      /* 「11 official langs」 is a real value in that table, so the count reads a leading number when
         the string carries one rather than answering 1 for a country with eleven */
      const langN=(()=>{ const s2=String((st&&st.languages)||''); if(!s2) return 0;
        const m=/(\d+)\s*official/i.exec(s2); if(m) return +m[1];
        return s2.split(',').filter(x=>x.trim()).length; })();
      const cur=String((st&&st.currency)||'').toUpperCase();
      return { code:(st&&nm)?near:'', name:nm||'', st:st||null,
               layers:ly, has:(id)=>ids.has(id), year:year, live:live, zoom:z,
               geo:geo, langN:langN, cur:cur };
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
      /* (#R337) …and eight more of the layers a reader actually switches on. #R313 covered seven
         of the hundred-odd rows in the panel, so 「a chip about the layer under the cursor」 — the
         most specific question there is — was reachable for seven of them. */
      { k:'radar', w:9, on:(f)=>f.st&&f.has('dl-radar'),
        t:()=>L('What is falling over {place} right now, and where is it heading next?',
                'いま{place}に降っているのは？ この先どこへ動く？',
                '{place}: Was fällt dort gerade, und wohin zieht es als Nächstes?',
                '{place}: что сейчас выпадает над страной и куда это сместится дальше?',
                '{place}: ¿qué está cayendo ahora y hacia dónde se dirige?') },
      { k:'sealevel', w:9, on:(f)=>f.st&&f.has('dl-sealevel'),
        t:()=>L('How much of {place} sits low enough for the sea to reach it, and by when?',
                '{place}のうち海面上昇が届く低さの土地はどれくらい？ いつまでに？',
                '{place}: Wie viel davon liegt tief genug, dass das Meer es erreicht — und bis wann?',
                '{place}: какая часть страны лежит достаточно низко, чтобы её достигло море, и к какому сроку?',
                '{place}: ¿cuánto territorio está lo bastante bajo para que lo alcance el mar, y para cuándo?') },
      { k:'plates', w:9, on:(f)=>f.st&&f.has('eco-dl-plates'),
        t:()=>L('Which tectonic plates meet near {place}, and how fast are they moving?',
                '{place}の近くではどのプレートが接している？ 動く速さは？',
                '{place}: Welche Erdplatten treffen in der Nähe aufeinander, und wie schnell bewegen sie sich?',
                '{place}: какие тектонические плиты сходятся рядом и с какой скоростью движутся?',
                '{place}: ¿qué placas tectónicas se encuentran cerca y a qué velocidad se mueven?') },
      { k:'climate', w:8, on:(f)=>f.st&&f.has('dl-climate'),
        t:()=>L('Which climate zones does {place} span, and which of them are shifting?',
                '{place}はどの気候帯にまたがっている？ そのうち動いているのは？',
                '{place}: Welche Klimazonen umfasst das Land, und welche davon verschieben sich?',
                '{place}: какие климатические пояса охватывает страна и какие из них смещаются?',
                '{place}: ¿qué zonas climáticas abarca y cuáles se están desplazando?') },
      { k:'eez', w:8, on:(f)=>f.st&&f.has('dl-eez'),
        t:()=>L('How far do {place}’s maritime claims reach, and where are they contested?',
                '{place}の海洋権益はどこまで及ぶ？ 争いがあるのはどこ？',
                '{place}: Wie weit reichen die Seegebietsansprüche, und wo sind sie umstritten?',
                '{place}: как далеко простираются её морские притязания и где они оспариваются?',
                '{place}: ¿hasta dónde llegan sus reivindicaciones marítimas y dónde se disputan?') },
      { k:'sats', w:8, on:(f)=>f.st&&f.has('dl-sats'),
        t:()=>L('What is passing over {place} in orbit right now, and what is it for?',
                'いま{place}の上空を通っている衛星は？ 何のための衛星？',
                '{place}: Was zieht gerade im Orbit darüber hinweg, und wozu?',
                '{place}: что сейчас проходит над страной по орбите и для чего оно нужно?',
                '{place}: ¿qué pasa ahora en órbita por encima y para qué sirve?') },
      { k:'datacentres', w:8, on:(f)=>f.st&&f.has('beta-dl-dc'),
        t:()=>L('Where do {place}’s data centres sit, and what decided those locations?',
                '{place}のデータセンターはどこにある？ その場所が選ばれた理由は？',
                '{place}: Wo stehen die Rechenzentren, und was hat diese Standorte entschieden?',
                '{place}: где стоят её дата-центры и что определило эти места?',
                '{place}: ¿dónde están sus centros de datos y qué decidió esas ubicaciones?') },
      { k:'nightlights', w:7, on:(f)=>f.st&&(f.has('dl-nightsat')||f.has('dl-night')),
        t:()=>L('What do the night lights over {place} say about where its people and money are?',
                '{place}の夜間光は、人と金がどこにあることを示している？',
                '{place}: Was verraten die Nachtlichter darüber, wo Menschen und Geld sind?',
                '{place}: что ночные огни говорят о том, где там люди и деньги?',
                '{place}: ¿qué dicen las luces nocturnas sobre dónde están su gente y su dinero?') },
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
      /* ── where the country IS, measured from its own footprint (#R337) ───────────────────── */
      { k:'equator', w:9, on:(f)=>f.st&&f.geo&&f.geo.equator,
        t:()=>L('The equator runs through {place} — what does that do to its seasons and its rain?',
                '赤道が{place}を通っている。季節と雨はそれでどうなる？',
                '{place}: Der Äquator verläuft mitten hindurch — was macht das mit Jahreszeiten und Regen?',
                '{place}: через страну проходит экватор. Что это делает с её сезонами и дождями?',
                '{place}: el ecuador la atraviesa. ¿Qué hace eso con sus estaciones y sus lluvias?') },
      { k:'arctic', w:9, on:(f)=>f.st&&f.geo&&f.geo.arctic,
        t:()=>L('Part of {place} lies inside the Arctic Circle — who lives up there, and on what?',
                '{place}の一部は北極圏の中にある。そこには誰が、何で暮らしている？',
                '{place}: Ein Teil liegt im Polarkreis — wer lebt dort oben, und wovon?',
                '{place}: часть страны лежит за полярным кругом. Кто там живёт и чем?',
                '{place}: parte del país está dentro del Círculo Polar Ártico. ¿Quién vive allí y de qué?') },
      { k:'farflung', w:8, on:(f)=>f.st&&f.geo&&f.geo.spread>=12,
        t:()=>L('{place} is scattered over far more sea than land — which piece of it lies furthest out?',
                '{place}の領土は陸よりはるかに広い海に散らばっている。いちばん遠いのはどこ？',
                '{place}: Das Staatsgebiet verteilt sich über weit mehr Meer als Land — welcher Teil liegt am weitesten draußen?',
                '{place}: территория разбросана по морю, которого куда больше, чем суши. Какая её часть лежит дальше всех?',
                '{place}: su territorio se reparte por mucho más mar que tierra. ¿Qué parte queda más lejos?') },
      { k:'tropics', w:6, on:(f)=>f.st&&f.geo&&f.geo.tropics&&f.st.area>50000,
        t:()=>L('All of {place} lies between the tropics — how does that decide what grows and where people live?',
                '{place}は全域が熱帯にある。何が育ち、人がどこに住むかはそれでどう決まる？',
                '{place}: Das ganze Land liegt zwischen den Wendekreisen — was wächst dort, und wo leben die Menschen?',
                '{place}: вся страна лежит между тропиками. Как это определяет, что растёт и где живут люди?',
                '{place}: todo el país está entre los trópicos. ¿Cómo decide eso qué crece y dónde vive la gente?') },
      /* ── two facts at once, which is what actually separates one country from the next (#R337) ─ */
      { k:'richnotfree', w:9, on:(f)=>f.st&&hi('gdppc',f.code,35)&&f.st.dem!=null&&f.st.dem<5,
        t:()=>L('{place} is wealthy and tightly governed at once — what holds that arrangement together?',
                '{place}は豊かでありながら統治は強い。この組み合わせは何で成り立っている？',
                '{place}: wohlhabend und zugleich streng regiert — was hält diese Konstruktion zusammen?',
                '{place}: богатая и при этом жёстко управляемая страна. На чём держится такая конструкция?',
                '{place} es próspero y a la vez está férreamente gobernado: ¿qué sostiene esa combinación?') },
      { k:'bigpoor', w:9, on:(f)=>f.st&&hi('gdp',f.code,25)&&lo('gdppc',f.code,80),
        t:()=>L('{place} has one of the biggest economies in the world and one of the lower incomes per head — where does the gap sit?',
                '{place}は経済規模は世界有数、1人あたりは低い。その差はどこにある？',
                '{place}: eine der größten Volkswirtschaften und zugleich ein niedriges Pro-Kopf-Einkommen — wo klafft die Lücke?',
                '{place}: одна из крупнейших экономик мира и низкий доход на душу. Где именно этот разрыв?',
                '{place} tiene una de las mayores economías y a la vez una renta por habitante baja: ¿dónde está la brecha?') },
      { k:'longlife', w:8, on:(f)=>f.st&&hi('life',f.code,45)&&lo('gdppc',f.code,90),
        t:()=>L('People in {place} live long lives on modest incomes — what is going right?',
                '{place}は所得が高くないのに長寿。何がうまくいっている？',
                '{place}: lange Leben bei bescheidenem Einkommen — was läuft dort richtig?',
                '{place}: долгая жизнь при скромных доходах. Что там работает как надо?',
                '{place}: vidas largas con ingresos modestos. ¿Qué está funcionando bien?') },
      /* ⚠ (#R337) the currency column carries compounds — Panama's reads 「PAB / USD」 — so the test
         is over the SEPARATED codes, not a substring: 「AUD」 must not answer to 「USD」. */
      { k:'dollarized', w:9, on:(f)=>f.st&&f.code!=='USA'&&String(f.cur||'').split('/').map(s=>s.trim()).indexOf('USD')>=0,
        t:()=>L('{place} uses the US dollar instead of a currency of its own — why, and what did it give up?',
                '{place}は自国通貨ではなく米ドルを使っている。なぜ？ 何を手放した？',
                '{place} nutzt den US-Dollar statt einer eigenen Währung — warum, und was hat es dafür aufgegeben?',
                '{place} использует доллар США вместо собственной валюты — почему и от чего она отказалась?',
                '{place} usa el dólar estadounidense en lugar de una moneda propia: ¿por qué y a qué renunció?') },
      { k:'manylangs', w:8, on:(f)=>f.st&&(f.langN|0)>=3,
        t:()=>L('{place} runs in {n} languages at once — how do government, school and media handle that?',
                '{place}は{n}つの言語で同時に動いている。行政・学校・報道はどう回している？',
                '{place}: {n} Sprachen gleichzeitig — wie bewältigen Verwaltung, Schule und Medien das?',
                '{place}: страна живёт сразу на {n} языках. Как с этим справляются власть, школа и СМИ?',
                '{place} funciona en {n} idiomas a la vez: ¿cómo lo gestionan la administración, la escuela y los medios?') },
      { k:'euro', w:7, on:(f)=>f.st&&f.cur==='EUR',
        t:()=>L('{place} does not set its own interest rates — it uses the euro. What has that bought, and what has it cost?',
                '{place}は自国で金利を決めていない——通貨はユーロ。それで得たものと失ったものは？',
                '{place} setzt seine Zinsen nicht selbst — es hat den Euro. Was hat das gebracht, und was gekostet?',
                '{place} не устанавливает собственные ставки — у страны евро. Что это дало и чего стоило?',
                '{place} no fija sus propios tipos de interés: usa el euro. ¿Qué ha ganado y qué le ha costado?') },
      /* ── the ends of the distributions, in BANDS rather than a top ten (#R337) ─────────────── */
      { k:'tinypop', w:8, on:(f)=>f.st&&f.st.pop>0&&lo('pop',f.code,20),
        t:()=>L('Fewer people live in {place} than in a mid-sized city — how does a state that small work?',
                '{place}の人口は中規模都市より少ない。それだけの規模で国はどう回っている？',
                '{place} hat weniger Einwohner als eine mittelgroße Stadt — wie funktioniert ein so kleiner Staat?',
                '{place}: жителей меньше, чем в среднем городе. Как работает такое маленькое государство?',
                'En {place} vive menos gente que en una ciudad mediana: ¿cómo funciona un Estado tan pequeño?') },
      { k:'poor', w:8, on:(f)=>f.st&&lo('gdppc',f.code,25),
        t:()=>L('{place} has one of the lowest incomes per head anywhere — where does the money that does arrive come from?',
                '{place}の1人あたり所得は世界最低水準。入ってくる金はどこから来ている？',
                '{place} hat eines der niedrigsten Pro-Kopf-Einkommen überhaupt — woher kommt das Geld, das ankommt?',
                '{place}: один из самых низких доходов на душу в мире. Откуда берутся те деньги, что всё же приходят?',
                '{place} tiene una de las rentas por habitante más bajas del mundo: ¿de dónde sale el dinero que sí entra?') },
      { k:'lifelow', w:8, on:(f)=>f.st&&lo('life',f.code,20),
        t:()=>L('Life is cut short in {place} compared with most of the world — by what, and what is changing?',
                '{place}の平均寿命は世界的に見て短い。原因は？ 変わりつつあるものは？',
                '{place}: Die Lebenserwartung ist im Weltvergleich niedrig — woran liegt das, und was ändert sich?',
                '{place}: продолжительность жизни ниже, чем в большинстве стран. Из-за чего и что меняется?',
                '{place}: la esperanza de vida es baja frente a casi todo el mundo. ¿Por qué, y qué está cambiando?') },
      { k:'nethigh', w:6, on:(f)=>f.st&&hi('net',f.code,20),
        t:()=>L('Almost everyone in {place} is online — what did it take to get there?',
                '{place}はほぼ全員がネットにつながっている。そこまで来るのに何が要った？',
                '{place}: fast alle sind online — was hat das gebraucht?',
                '{place}: в сети почти все. Что для этого потребовалось?',
                'En {place} casi todo el mundo está conectado: ¿qué hizo falta para llegar ahí?') },
      { k:'milow', w:7, on:(f)=>f.st&&lo('milShare',f.code,30),
        t:()=>L('{place} spends almost nothing on defence — who or what actually guarantees its security?',
                '{place}は国防にほとんど使っていない。安全を実際に担保しているのは誰・何？',
                '{place} gibt fast nichts für Verteidigung aus — wer oder was garantiert die Sicherheit tatsächlich?',
                '{place}: на оборону не тратится почти ничего. Кто или что на деле обеспечивает безопасность?',
                '{place} apenas gasta en defensa: ¿quién o qué garantiza realmente su seguridad?') },
      { k:'popbig', w:7, on:(f)=>f.st&&f.st.pop>=1e8,
        t:()=>L('More than a hundred million people live in {place} — what does the state do well at that scale, and what breaks?',
                '{place}には1億人以上が住んでいる。その規模で国家がうまくできていることと、壊れているものは？',
                'In {place} leben über hundert Millionen Menschen — was gelingt dem Staat in dieser Größe, und was bricht?',
                '{place}: в стране больше ста миллионов жителей. Что государство в таком масштабе делает хорошо, а что ломается?',
                'En {place} viven más de cien millones de personas: ¿qué hace bien el Estado a esa escala y qué se rompe?') },
      { k:'farsouth', w:6, on:(f)=>f.st&&f.geo&&f.geo.mid!=null&&f.geo.mid<=-20,
        t:()=>L('{place}’s summer is the northern hemisphere’s winter — where does that show up in its economy?',
                '{place}の夏は北半球の冬。それは経済のどこに現れる？',
                '{place}: Sommer dort ist Winter auf der Nordhalbkugel — wo zeigt sich das in der Wirtschaft?',
                '{place}: лето там — зима в Северном полушарии. Где это видно в экономике?',
                'El verano de {place} es el invierno del hemisferio norte: ¿dónde se nota eso en su economía?') },
      { k:'highnorth', w:6, on:(f)=>f.st&&f.geo&&f.geo.mid!=null&&f.geo.mid>=50,
        t:()=>L('Winter days are short in {place} — what does that do to its energy use and how people live?',
                '{place}の冬は日が短い。エネルギーの使い方と暮らしはそれでどうなる？',
                '{place}: Die Wintertage sind kurz — was macht das mit Energieverbrauch und Alltag?',
                '{place}: зимой день короткий. Как это сказывается на энергопотреблении и на быте?',
                'En {place} los días de invierno son cortos: ¿qué hace eso con su consumo de energía y su vida diaria?') },
      /* ── attributes every country has, so these only ever fill the tail ─────────────────── */
      /* ⚠⚠ (#R313 追記) THIS CHIP NAMED THE CAPITAL, AND THE APP ONLY HAS THAT NAME IN ENGLISH.
         `CAPITAL` in js/tables.js is an English table — CLDR has no city names, and OSM's `name:xx`
         values live inside vector tiles, not in anything this module can ask. So a Japanese reader
         was handed 「Ulaanbaatarで起きていることのうち…」: a fully translated sentence with an
         untranslated value dropped into the middle of it. ⚠ `npm run check:i18n` CANNOT SEE THIS —
         the TEMPLATE is complete in all nine languages; it is the substituted value that is not.
         Measured on production in ja: six countries, six English city names.
         → the question keeps its subject and loses the name it could not translate. */
      { k:'capital', w:5, on:(f)=>f.st&&!!f.st.capital, tail:1,
        t:()=>L('What happens in {place}’s capital that matters beyond its borders?',
                '{place}の首都で起きていることのうち、国外にまで効くのは？',
                '{place}: Was passiert in der Hauptstadt, das über das Land hinaus zählt?',
                '{place}: что происходит в столице и имеет значение за пределами страны?',
                '{place}: ¿qué ocurre en su capital que importe más allá del país?') },
      /* ⚠ (#R313 追記2) `{sub}` SITS IN A PARENTHETICAL APPOSITION, for the same reason `{place}` does
         (#R309): the value is a bare region name and the slot must not govern a case or want an
         article. 「vom übrigen {sub}」 works for Ostasien and breaks for Karibik (feminine) and for
         Südliches Afrika (an adjective); 「del resto de {sub}」 wants 「del Caribe」. In parentheses every
         one of the 22 reads correctly in every language. */
      { k:'subregion', w:5, on:(f)=>f.st&&!!f.st.subregion, tail:1,
        t:()=>L('How does {place} differ from the other countries in its region ({sub})?',
                '{place}は同じ地域（{sub}）の他の国とどこが違う？',
                '{place}: Worin unterscheidet es sich von den anderen Ländern seiner Region ({sub})?',
                '{place}: чем страна отличается от других стран своего региона ({sub})?',
                '{place}: ¿en qué se diferencia de los otros países de su región ({sub})?') },
      /* ── #R309's four, kept as candidates (their nine translations are live) ────────────── */
      { k:'latest', w:4, on:(f)=>!!f.st, tail:1,
        t:()=>L('Brief me on {place} — the latest','{place}でいま何が起きている？','{place}: Lagebericht — was passiert gerade?','{place} — что происходит прямо сейчас?','{place}: ¿qué está pasando ahora?') },
      { k:'neighbours', w:3, on:(f)=>!!f.st, tail:1,
        t:()=>L('Compare {place} with its neighbours — GDP, defense and population','{place}と周辺国を比較（GDP・国防費・人口）','{place} und seine Nachbarländer — BIP, Militär, Bevölkerung vergleichen','{place} и соседние страны — сравнить ВВП, оборону и население','{place} y sus países vecinos: comparar PIB, defensa y población') },
      { k:'since1990', w:3, on:(f)=>!!f.st, tail:1,
        t:()=>L("How has {place}'s economy changed since 1990?",'{place}の経済は1990年からどう変わった？','{place}: Wie hat sich die Wirtschaft seit 1990 entwickelt?','{place}: как изменилась экономика с 1990 года?','{place}: ¿cómo ha cambiado la economía desde 1990?') },
      { k:'wx', w:2, on:(f)=>!!f.st, tail:1,
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
      /* (#R337) …and the same widening the country pool got: what the reader has switched on is
         the most specific thing a whole-world view can be asked about. */
      { k:'w-sealevel', w:8, on:(f)=>f&&f.has('dl-sealevel'),
        t:()=>L('Which coastlines does the sea reach first as it rises?','海面が上がったとき、最初に届く海岸はどこ？','Welche Küsten erreicht das steigende Meer zuerst?','Каких берегов поднимающееся море достигнет первыми?','¿A qué costas llega antes el mar cuando sube?') },
      { k:'w-plates', w:8, on:(f)=>f&&f.has('eco-dl-plates'),
        t:()=>L('Where are the tectonic plates moving fastest, and what is that building?','プレートが最も速く動いているのはどこ？ そこで何ができつつある？','Wo bewegen sich die Erdplatten am schnellsten, und was entsteht dabei?','Где тектонические плиты движутся быстрее всего и что при этом создаётся?','¿Dónde se mueven más rápido las placas tectónicas y qué están formando?') },
      { k:'w-sats', w:7, on:(f)=>f&&f.has('dl-sats'),
        t:()=>L('How crowded is low Earth orbit now, and who owns what up there?','低軌道はいまどれくらい混んでいる？ 何が誰のもの？','Wie voll ist der niedrige Erdorbit inzwischen, und wem gehört dort was?','Насколько сейчас тесно на низкой орбите и кому там что принадлежит?','¿Cuán saturada está hoy la órbita baja y de quién es cada cosa allí?') },
      { k:'w-dc', w:7, on:(f)=>f&&f.has('beta-dl-dc'),
        t:()=>L('Which countries host the most data centres, and what draws them there?','データセンターが最も多い国は？ 何がそこへ引き寄せている？','Welche Länder beherbergen die meisten Rechenzentren, und was zieht sie dorthin?','В каких странах больше всего центров обработки данных и что их туда тянет?','¿Qué países albergan más centros de datos y qué los atrae allí?') },
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
    /* ══ ⚠⚠⚠ (#R337) THE TAIL IS A FALLBACK, NOT A COMPETITOR ═══════════════════════════════════
       #R313 ranked every candidate by one weight and took the top four, and gave the six
       always-true questions weights of 2 to 5. That is low enough to lose to a WORLD EXTREME and
       not low enough to lose to an ordinary fact — so a country with one distinguishing feature
       was handed one question about it and three about nothing in particular. Measured on the
       synthetic world in tests/r337-checks: every single-fact shape took THREE of its four from
       the tail, which is 「まだほぼ定型文みたいなものしかない」 with a number on it.
       → the tail can no longer displace an eligible specific candidate, whatever the weights say.
       It fills what is left, in its own order, and for a country the pool knows four real things
       about it does not appear at all. Weight still decides the order INSIDE each group, so
       #R313's 「a measured extreme outranks an attribute every country has」 is unchanged. */
    function choose(pool,f){
      const ok=pool.filter(x=>{ try{ return !!x.on(f); }catch(_){ return false; } })
                   .sort((a,b)=>(b.w-a.w)||(a.k<b.k?-1:a.k>b.k?1:0));
      return ok.filter(x=>!x.tail).concat(ok.filter(x=>x.tail)).slice(0,4);
    }
    /* ══ ⚠⚠⚠ (#R313 追記2) THE FIRST FIX WAS A NO-OP IN THE BROWSER, AND THE TEST COULD NOT SEE IT ═══
       追記1 は subregion を UN M49 のコードにして `Intl.DisplayNames({type:'region'})` に訊いていた。
       Node では 22 コード× 9 言語が全部解決する。**ブラウザでは 1 つも解決しない。**
       MEASURED on production, three ways: `Intl.DisplayNames(['ja'],{type:'region',fallback:'none'}).of('030')`
       returns undefined in Chromium and 「東アジア」 in Node; all 22 codes fail in ja/en/ko/de (0/22 each);
       `of('JP')` still answers 「日本」 and `of('419')` answers 「ラテンアメリカ」. V8's region table carries
       COUNTRIES, not the M49 macro-regions — so every reader saw 「モンゴル国はEastern Asiaの他の国と…」
       exactly as before, while `tests/r313b` ② measured Node's ICU and stayed green for ever.
       ⚠⚠⚠ THAT IS THE DEFECT OF 追記1 ONE LEVEL DOWN: an instrument that measures a DIFFERENT RUNTIME
       from the one that ships. 追記1 caught a gate that measured templates instead of values; this one
       caught a gate that measured Node instead of the browser.
       ⇒ the names are SHIPPED STRINGS now. No runtime lookup, nothing to be present in one engine and
       absent in another, and `scripts/i18n-report.mjs` can see all 22 because each is a literal `L()`.
       ⚠ 22 のうち上流が実際に使うのは 20 種（177 features 中 175）。`Antarctica` と
       `Seven seas (open ocean)` は地域名ではないので表に無く、上流の英語に落ちる。 */
    const SUB={
      'Eastern Asia':()=>L('Eastern Asia','東アジア','Ostasien','Восточная Азия','Asia oriental'),
      'South-Eastern Asia':()=>L('South-Eastern Asia','東南アジア','Südostasien','Юго-Восточная Азия','Sudeste Asiático'),
      'Southern Asia':()=>L('Southern Asia','南アジア','Südasien','Южная Азия','Asia meridional'),
      'Central Asia':()=>L('Central Asia','中央アジア','Zentralasien','Центральная Азия','Asia central'),
      'Western Asia':()=>L('Western Asia','西アジア','Westasien','Западная Азия','Asia occidental'),
      'Northern Europe':()=>L('Northern Europe','北ヨーロッパ','Nordeuropa','Северная Европа','Europa septentrional'),
      'Western Europe':()=>L('Western Europe','西ヨーロッパ','Westeuropa','Западная Европа','Europa occidental'),
      'Southern Europe':()=>L('Southern Europe','南ヨーロッパ','Südeuropa','Южная Европа','Europa meridional'),
      'Eastern Europe':()=>L('Eastern Europe','東ヨーロッパ','Osteuropa','Восточная Европа','Europa oriental'),
      'Northern Africa':()=>L('Northern Africa','北アフリカ','Nordafrika','Северная Африка','África septentrional'),
      'Western Africa':()=>L('Western Africa','西アフリカ','Westafrika','Западная Африка','África occidental'),
      'Middle Africa':()=>L('Middle Africa','中部アフリカ','Zentralafrika','Центральная Африка','África central'),
      'Eastern Africa':()=>L('Eastern Africa','東アフリカ','Ostafrika','Восточная Африка','África oriental'),
      'Southern Africa':()=>L('Southern Africa','南部アフリカ','Südliches Afrika','Южная Африка','África meridional'),
      'Northern America':()=>L('Northern America','北アメリカ','Nordamerika','Северная Америка','América del Norte'),
      'Central America':()=>L('Central America','中央アメリカ','Mittelamerika','Центральная Америка','América Central'),
      'Caribbean':()=>L('Caribbean','カリブ海地域','Karibik','Карибский бассейн','Caribe'),
      'South America':()=>L('South America','南アメリカ','Südamerika','Южная Америка','América del Sur'),
      'Australia and New Zealand':()=>L('Australia and New Zealand','オーストラリア・ニュージーランド','Australien und Neuseeland','Австралия и Новая Зеландия','Australia y Nueva Zelanda'),
      'Melanesia':()=>L('Melanesia','メラネシア','Melanesien','Меланезия','Melanesia'),
      'Micronesia':()=>L('Micronesia','ミクロネシア','Mikronesien','Микронезия','Micronesia'),
      'Polynesia':()=>L('Polynesia','ポリネシア','Polynesien','Полинезия','Polinesia'),
    };
    function subName(st){ const s=(st&&st.subregion)||''; if(!s) return '';
      try{ const f=SUB[s]; if(f) return f()||s; }catch(_){}
      return s; }
    function fill(txt,f){
      const st=f&&f.st;
      return String(txt)
        .replace(/\{place\}/g,(f&&f.name)||'')
        .replace(/\{sub\}/g,subName(st))
        /* (#R337) how many languages the country runs in — a NUMBER, so it reads the same in all
           nine languages and cannot become #R313 追記's untranslated value in a translated sentence */
        .replace(/\{n\}/g,String((f&&f.langN)||''))
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
  /* ⚠ (#R337) `examples` and `facts` are PUBLISHED so this round's check can run the SHIPPED chooser
     over a synthetic world rather than grepping this file for wording. That is #R313 追記2's lesson
     one level up: a gate that reads the source proves the source, and what has to be proved here is
     the SET of four that a given set of facts produces — 「two different countries share no chip」 is
     not a property any regular expression over this file can see. Both are read-only: neither
     touches the DOM nor this module's state. */
  return { renderExamples, wireExamples: _wireExampleCamera, examples, facts: exFacts };
}
