/* ============================================================================
 *  IntMap · Historical states / identity / Maddison  (#R162)
 * ----------------------------------------------------------------------------
 *  Three modules whose bodies moved byte-identically out of index.html:
 *    • maddison   — Maddison Project historical GDP & population (no closure deps at all)
 *    • histStates — former states (USSR, Yugoslavia, Czechoslovakia…) shown when the clock travels
 *    • histId     — renamed single countries (Qing→RoC→PRC, Persia, Siam…)
 *  histStates/histId took countryStats from the closure; it is declared once and only ever
 *  mutated in place, so it is passed by reference as an explicit factory parameter.
 * ========================================================================== */
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.maddison=function(){
    let data=null, promise=null;
    function load(){ if(data) return Promise.resolve(data); if(promise) return promise;
      promise=fetch('data/maddison.json').then(r=>r.ok?r.json():null).then(j=>{ data=j||{}; return data; }).catch(()=>{ data={}; return data; });
      return promise; }
    function rec(code,year){ if(!data||!code) return null; const c=data[code]; if(!c) return null; return c[year]||c[String(year)]||null; }
    return {
      load, ready:()=>!!data, minYear:1900, maxYear:2018,
      has:(code,year)=>{ const r=rec(code,year); return !!(r&&(r[0]!=null||r[1]!=null)); },
      gdppc:(code,year)=>{ const r=rec(code,year); return (r&&r[0]!=null)?r[0]:null; },                 /* real 2011 int$ per capita */
      popN:(code,year)=>{ const r=rec(code,year); return (r&&r[1]!=null)?r[1]*1000:null; },              /* absolute persons */
      gdpBil:(code,year)=>{ const r=rec(code,year); return (r&&r[0]!=null&&r[1]!=null)?(r[0]*r[1]/1e6):null; }  /* billions of 2011 int$ */
    };
};

window.IntMapModules.histStates=function(countryStats){
    const svgU=(inner)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20">'+inner+'</svg>';
    const STAR=(cx,cy,s,fill,stroke)=>'<g transform="translate('+cx+','+cy+') scale('+s+')"><path d="M0,-1 0.2245,-0.309 0.951,-0.309 0.363,0.118 0.588,0.809 0,0.382 -0.588,0.809 -0.363,0.118 -0.951,-0.309 -0.2245,-0.309Z" fill="'+fill+'"'+(stroke?(' stroke="'+stroke+'" stroke-width="0.09"'):'')+'/></g>';
    const flag=(inner)=>'<img class="hist-flag" alt="" src="data:image/svg+xml,'+encodeURIComponent(svgU(inner))+'">';
    /* faithful flags, drawn inline (no external assets) */
    /* USSR: the authentic hammer-sickle-and-star emblem (public-domain vector, scaled from the 1200×600 master
       into our 30×20 box) — the earlier ☭-glyph version rendered unnaturally / font-dependent. */
    const _SUN_STAR='m 200.0005,37.5 -8.41933,25.911886 H 164.336 L 186.37777,79.426122 177.95844,105.338 200.0005,89.323465 222.04257,105.338 213.62324,79.426122 235.665,63.411886 h -27.24516 z m 0,13.499987 5.38828,16.583473 h 17.43718 l -14.107,10.249496 5.38827,16.583472 L 200.0005,84.167224 185.89378,94.416428 191.28205,77.832956 177.17504,67.58346 h 17.43718 z';
    const _SUN_HAMMER='m 137.43744,171.69421 18.86296,18.9937 17.78834,-17.66589 c 27.05847,29.021 55.43807,56.99501 82.28704,86.12782 4.03444,4.06233 10.59815,4.085 14.66056,0.0506 4.06232,-4.03445 4.08499,-10.59815 0.0506,-14.66056 -28.81871,-27.1901 -57.72545,-54.60143 -86.55328,-81.89095 l 23.96499,-23.80003 -33.34026,-4.61605 z';
    const _SUN_SICKLE='m 198.2887,110.1955 c 15.51743,8.7394 27.29872,21.28122 34.2484,34.3924 7.04394,13.28902 10.13959,27.16218 10.20325,38.25433 0.13054,22.74374 -18.43771,41.18184 -41.18183,41.18184 -12.13597,0 -23.04607,-5.24868 -30.58302,-13.60085 l -4.16863,3.51033 c -0.70999,-0.27231 -1.46387,-0.41221 -2.22429,-0.41276 -1.82948,1.9e-4 -3.56621,0.80531 -4.74859,2.20136 -2.97368,0.38896 -5.46251,2.44529 -6.40534,5.29224 -3.13486,6.28843 -8.63524,11.21997 -15.29104,13.4776 -0.0637,0.0216 -0.11992,0.05 -0.1758,0.0783 -3.07749,1.12758 -6.16259,3.1643 -8.78919,5.80245 -5.19155,5.23656 -7.72858,11.93658 -6.30024,16.63822 -0.14098,0.40857 -0.21361,0.83759 -0.21498,1.26979 1.5e-4,2.17082 1.75991,3.93058 3.93073,3.93073 0.54341,-0.002 1.08053,-0.11639 1.57745,-0.33632 4.69369,1.05881 11.06885,-1.54582 16.05444,-6.55917 2.82624,-2.85072 4.94356,-6.22349 5.98303,-9.53062 2.31696,-6.62278 7.29699,-12.01856 13.62281,-15.05312 0.15105,-0.0725 0.27303,-0.14714 0.38218,-0.22358 2.12082,-1.01408 3.67251,-2.92895 4.225,-5.2139 9.70222,11.44481 24.25255,18.75299 40.51876,19.13577 29.83352,0.70205 52.13299,-21.25802 53.16414,-52.83642 0.51894,-15.89259 -5.62993,-36.3847 -19.6412,-53.19089 -10.70835,-12.84441 -26.40987,-23.50795 -44.18699,-28.20777 z';
    const F_SUN=flag('<rect width="30" height="20" fill="#CC0000"/><g fill="#FFD700" transform="scale(0.025)"><path d="'+_SUN_STAR+'"/><g transform="matrix(0.98931879,0,0,0.98673811,3.8297658,3.7659398)"><path d="'+_SUN_HAMMER+'"/><path d="'+_SUN_SICKLE+'"/></g></g>');
    const F_TRICOL='<rect width="30" height="20" fill="#003893"/><rect y="6.667" width="30" height="6.667" fill="#ffffff"/><rect y="13.333" width="30" height="6.667" fill="#DE2110"/>';
    const F_YUG=flag(F_TRICOL+STAR(15,10,4.7,'#DE2110','#FCD116'));
    const F_YUGK=flag(F_TRICOL);   /* (#R129) Kingdom of Yugoslavia (1918–1941): pan-Slavic blue-white-red tricolour, NO socialist star */
    const F_SCG=flag(F_TRICOL);
    const F_CSK=flag('<rect width="30" height="20" fill="#ffffff"/><rect y="10" width="30" height="10" fill="#D7141A"/><path d="M0,0 15,10 0,20Z" fill="#11457E"/>');
    const F_UAR=flag('<rect width="30" height="6.667" fill="#CE1126"/><rect y="6.667" width="30" height="6.667" fill="#ffffff"/><rect y="13.333" width="30" height="6.667" fill="#000000"/>'+STAR(11.5,10,1.7,'#007A3D')+STAR(18.5,10,1.7,'#007A3D'));
    const F_PAK=flag('<rect width="30" height="20" fill="#01411C"/><rect width="7.5" height="20" fill="#ffffff"/><circle cx="18" cy="10" r="4.2" fill="#ffffff"/><circle cx="19.7" cy="8.8" r="3.5" fill="#01411C"/>'+STAR(21.6,7.9,1.25,'#ffffff'));
    const F_SDN=flag('<rect width="30" height="6.667" fill="#D21034"/><rect y="6.667" width="30" height="6.667" fill="#ffffff"/><rect y="13.333" width="30" height="6.667" fill="#000000"/><path d="M0,0 12,10 0,20Z" fill="#007229"/>');
    const F_ETH=flag('<rect width="30" height="6.667" fill="#078930"/><rect y="6.667" width="30" height="6.667" fill="#FCDD09"/><rect y="13.333" width="30" height="6.667" fill="#DA121A"/>');
    const F_IDN=flag('<rect width="30" height="10" fill="#FF0000"/><rect y="10" width="30" height="10" fill="#ffffff"/>');
    /* (#R94k) pre-WWI empires — flags drawn inline (simplified but recognisable; heraldry approximated) */
    const F_AUH=flag('<rect width="15" height="6.667" fill="#ED2939"/><rect y="6.667" width="15" height="6.667" fill="#ffffff"/><rect y="13.333" width="15" height="6.667" fill="#ED2939"/><rect x="15" width="15" height="6.667" fill="#CE2939"/><rect x="15" y="6.667" width="15" height="6.667" fill="#ffffff"/><rect x="15" y="13.333" width="15" height="6.667" fill="#436F4D"/>');
    const F_OTT=flag('<rect width="30" height="20" fill="#D00000"/><circle cx="12" cy="10" r="5" fill="#ffffff"/><circle cx="13.7" cy="10" r="4" fill="#D00000"/>'+STAR(18.6,10,2.1,'#ffffff'));
    const F_RUE=flag('<rect width="30" height="6.667" fill="#ffffff"/><rect y="6.667" width="30" height="6.667" fill="#0039A6"/><rect y="13.333" width="30" height="6.667" fill="#D52B1E"/>');
    const F_RAJ=flag('<rect width="30" height="20" fill="#012169"/><path d="M0,0 30,20 M30,0 0,20" stroke="#ffffff" stroke-width="3.4"/><path d="M0,0 30,20 M30,0 0,20" stroke="#C8102E" stroke-width="1.6"/><path d="M15,0 V20 M0,10 H30" stroke="#ffffff" stroke-width="5"/><path d="M15,0 V20 M0,10 H30" stroke="#C8102E" stroke-width="3"/>');
    const F_JEM=flag('<rect width="30" height="20" fill="#ffffff"/><circle cx="15" cy="10" r="6" fill="#BC002D"/>');
    /* code = synthetic ISO-like id · from/to = real lifespan · succ = modern ISO3 successors to aggregate & hide */
    const STATES=[
      { code:'SUN', from:'1922-12-30', to:'1991-12-26', flag:F_SUN, region:'Eurasia', wiki:'Soviet Union',
        name:{en:'Soviet Union',jp:'ソビエト連邦',de:'Sowjetunion',ru:'СССР',es:'Unión Soviética'},
        succ:['RUS','UKR','BLR','UZB','KAZ','GEO','AZE','LTU','MDA','LVA','KGZ','TJK','ARM','TKM','EST'],
        /* World Bank nominal-USD GDP for the Soviet command economy is a known official-exchange-rate artifact
           (successor sum ≈ $0.69T in 1990, mostly Russia), which buries a genuine #2–3 world economy. Use the
           real-output estimate (CIA World Factbook 1990 ≈ $2.66T GNP; consistent with the Maddison Project) for
           the late-Soviet window; earlier than that WB has no republic data, so GDP is honestly blank. */
        gdpEst:2660, gdpEstFrom:1985, estSrc:'CIA World Factbook 1990 / Maddison' },
      { code:'YUG', from:'1945-11-29', to:'1992-04-27', flag:F_YUG, region:'Europe', wiki:'Socialist Federal Republic of Yugoslavia',
        name:{en:'Yugoslavia (SFRY)',jp:'ユーゴスラビア（社会主義連邦共和国）',de:'Jugoslawien (SFRJ)',ru:'Югославия (СФРЮ)',es:'Yugoslavia (RFSY)'},
        succ:['SVN','HRV','BIH','MKD','SRB','MNE','XKX'] },
      /* (#R129) INTERWAR Kingdom of Yugoslavia (1918–1941) — CShapes draws it as one polygon "Yugoslavia" (gwcode 345),
         but it had no registry entry, so a map click FRAGMENTED it into modern Serbia/Croatia/Slovenia/… under the
         cursor (the reported "国境線と国家は昔なのに、クリック判定は現在の国境" for interwar Eastern Europe). Now it
         resolves to ONE entity like Austria-Hungary / Czechoslovakia. `madCode:'YUG'` reuses the Maddison Project's
         continuous Yugoslavia series (real interwar GDP/pop: 1925 ≈ $23.5B / 13.4M) since the modern successors have no
         separate pre-war data. Temporally disjoint from the SFRY entry above (to 1945-11-28 vs from 1945-11-29), so the
         duplicate-name never collides — activeAt() returns only one for any given date. */
      { code:'YGK', madCode:'YUG', from:'1918-12-01', to:'1945-11-28', flag:F_YUGK, region:'Europe', wiki:'Kingdom of Yugoslavia',
        name:{en:'Kingdom of Yugoslavia',jp:'ユーゴスラビア王国',de:'Königreich Jugoslawien',ru:'Королевство Югославия',es:'Reino de Yugoslavia'},
        succ:['SVN','HRV','BIH','MKD','SRB','MNE'], popEst:15400000, gdpEst:32, estSrc:'1931 census ~13.9M → 1941 ~15.9M / Maddison YUG' },
      { code:'SCG', from:'1992-04-27', to:'2006-06-05', flag:F_SCG, region:'Europe', wiki:'Serbia and Montenegro',
        name:{en:'Serbia and Montenegro',jp:'セルビア・モンテネグロ',de:'Serbien und Montenegro',ru:'Сербия и Черногория',es:'Serbia y Montenegro'},
        succ:['SRB','MNE','XKX'] },
      { code:'CSK', from:'1918-10-28', to:'1992-12-31', flag:F_CSK, region:'Europe', wiki:'Czechoslovakia',
        name:{en:'Czechoslovakia',jp:'チェコスロバキア',de:'Tschechoslowakei',ru:'Чехословакия',es:'Checoslovaquia'},
        succ:['CZE','SVK'] },
      { code:'UAR', from:'1958-02-22', to:'1961-09-28', flag:F_UAR, region:'Middle East', wiki:'United Arab Republic',
        name:{en:'United Arab Republic',jp:'アラブ連合共和国',de:'Vereinigte Arabische Republik',ru:'Объединённая Арабская Республика',es:'República Árabe Unida'},
        succ:['EGY','SYR'] },
      /* pre-secession configurations — WB tracks each successor separately back to 1960 (complementary split),
         so summing is clean (e.g. Pakistan 60 M + Bangladesh 69 M = 129 M in 1970). */
      { code:'PKU', from:'1947-08-14', to:'1971-12-16', flag:F_PAK, region:'South Asia', wiki:'East Pakistan',
        name:{en:'Pakistan (incl. East Pakistan)',jp:'パキスタン（東パキスタン含む）',de:'Pakistan (mit Ostpakistan)',ru:'Пакистан (с Восточным Пакистаном)',es:'Pakistán (con Pakistán Oriental)'},
        succ:['PAK','BGD'] },
      { code:'SDU', from:'1956-01-01', to:'2011-07-09', flag:F_SDN, region:'Africa', wiki:'Sudan',
        name:{en:'Sudan (incl. South Sudan)',jp:'スーダン（南スーダン含む）',de:'Sudan (mit Südsudan)',ru:'Судан (с Южным Суданом)',es:'Sudán (con Sudán del Sur)'},
        succ:['SDN','SSD'] },
      { code:'ETU', from:'1952-09-15', to:'1993-05-24', flag:F_ETH, region:'Africa', wiki:'Ethiopia',
        name:{en:'Ethiopia (incl. Eritrea)',jp:'エチオピア（エリトリア含む）',de:'Äthiopien (mit Eritrea)',ru:'Эфиопия (с Эритреей)',es:'Etiopía (con Eritrea)'},
        succ:['ETH','ERI'] },
      { code:'IDU', from:'1976-07-17', to:'2002-05-20', flag:F_IDN, region:'Southeast Asia', wiki:'Indonesian occupation of East Timor',
        name:{en:'Indonesia (incl. East Timor)',jp:'インドネシア（東ティモール含む）',de:'Indonesien (mit Osttimor)',ru:'Индонезия (с Восточным Тимором)',es:'Indonesia (con Timor Oriental)'},
        succ:['IDN','TLS'] },
      /* (#R94k) pre-WWI / interwar EMPIRES — the multi-nation states that dominated the early 20th century */
      /* (#R109) EMPIRE-WIDE population/GDP estimates: Maddison has NO single entity for these multi-nation empires, so
         agg's successor-sum was INCOMPLETE (only modern-territory successors WITH data contributed — Austria-Hungary
         collapsed to just Austria's 6.84M). popEst = absolute persons (well-documented census figures); gdpEst =
         billions of 2011 int$ (successor GDPpc × the full population). Used by agg + the time-series when Maddison
         lacks the entity (see agg). */
      { code:'AUH', from:'1867-06-08', to:'1918-11-11', flag:F_AUH, region:'Europe', wiki:'Austria-Hungary',
        name:{en:'Austria-Hungary',jp:'オーストリア＝ハンガリー帝国',de:'Österreich-Ungarn',ru:'Австро-Венгрия',es:'Austria-Hungría'},
        succ:['AUT','HUN','CZE','SVK','SVN','HRV','BIH'], popEst:52800000, gdpEst:190, estSrc:'A-H census 1910 (~51.4M) / Maddison GDPpc' },
      { code:'OTT', from:'1876-01-01', to:'1922-11-01', flag:F_OTT, region:'Middle East', wiki:'Ottoman Empire',
        name:{en:'Ottoman Empire',jp:'オスマン帝国',de:'Osmanisches Reich',ru:'Османская империя',es:'Imperio otomano'},
        succ:['TUR','SYR','LBN','IRQ','JOR','ISR','PSE'], popEst:23000000, gdpEst:35, estSrc:'Ottoman census ~1914 / Maddison GDPpc' },
      { code:'RUE', from:'1800-01-01', to:'1917-11-07', flag:F_RUE, region:'Eurasia', wiki:'Russian Empire',
        name:{en:'Russian Empire',jp:'ロシア帝国',de:'Russisches Kaiserreich',ru:'Российская империя',es:'Imperio ruso'},
        succ:['RUS','UKR','BLR','LTU','LVA','EST','MDA','GEO','ARM','AZE','KAZ','UZB','TKM','KGZ','TJK','FIN','POL'], popEst:166000000, gdpEst:435, estSrc:'Russian Empire census 1897/1914 (~166M) / Maddison GDPpc' },
      { code:'RAJ', from:'1858-06-28', to:'1947-08-15', flag:F_RAJ, region:'South Asia', wiki:'British Raj',
        name:{en:'British Raj (British India)',jp:'イギリス領インド帝国',de:'Britisch-Indien',ru:'Британская Индия',es:'India británica'},
        succ:['IND','PAK','BGD'], popEst:305000000, gdpEst:300, estSrc:'India census 1911 (~315M) / Maddison GDPpc' },
      { code:'JEM', from:'1910-08-29', to:'1945-09-02', flag:F_JEM, region:'East Asia', wiki:'Empire of Japan',
        name:{en:'Empire of Japan',jp:'大日本帝国',de:'Japanisches Kaiserreich',ru:'Японская империя',es:'Imperio del Japón'},
        /* (#R128) Empire of Japan c.1940 ≈ 105M incl. colonies (Japan ~73M + Korea ~24M + Taiwan ~6M + Karafuto/
           Kwantung). Maddison lacks pre-1945 Korea/Taiwan, so the raw successor-sum collapsed to ~Japan-only; the
           documented empire figure keeps the pre-1945 aggregate honest (same override as AUH/OTT/RUE/RAJ). */
        succ:['JPN','KOR','PRK','TWN'], popEst:105000000, gdpEst:230, estSrc:'Japan Empire c.1940 (~105M incl. Korea/Taiwan) / Maddison GDPpc' }
    ];
    /* (#R130) era capital / currency / official languages for each historical state — merged onto the S objects so
       agg() surfaces them on the country card (they were hardcoded blank before). Sourced from each state's Wikipedia
       infobox. */
    const _STINFO={
      SUN:{capital:'Moscow',currency:'Soviet ruble',languages:'Russian'},
      YUG:{capital:'Belgrade',currency:'Yugoslav dinar',languages:'Serbo-Croatian, Slovene, Macedonian'},
      YGK:{capital:'Belgrade',currency:'Yugoslav dinar',languages:'Serbo-Croatian'},
      SCG:{capital:'Belgrade',currency:'Serbian dinar / Euro',languages:'Serbian'},
      CSK:{capital:'Prague',currency:'Czechoslovak koruna',languages:'Czech, Slovak'},
      UAR:{capital:'Cairo',currency:'UAR pound',languages:'Arabic'},
      PKU:{capital:'Karachi / Islamabad',currency:'Pakistani rupee',languages:'Urdu, Bengali, English'},
      SDU:{capital:'Khartoum',currency:'Sudanese pound',languages:'Arabic, English'},
      ETU:{capital:'Addis Ababa',currency:'Ethiopian birr',languages:'Amharic'},
      IDU:{capital:'Jakarta',currency:'Indonesian rupiah',languages:'Indonesian'},
      AUH:{capital:'Vienna & Budapest',currency:'Austro-Hungarian krone',languages:'German, Hungarian'},
      OTT:{capital:'Constantinople',currency:'Ottoman lira',languages:'Ottoman Turkish'},
      RUE:{capital:'St. Petersburg',currency:'Russian ruble',languages:'Russian'},
      RAJ:{capital:'Calcutta / New Delhi',currency:'Indian rupee',languages:'English, Hindi, Urdu'},
      JEM:{capital:'Tokyo',currency:'Japanese yen',languages:'Japanese'}
    };
    STATES.forEach(S=>{ const i=_STINFO[S.code]; if(i){ S.capital=i.capital; S.currency=i.currency; S.languages=i.languages; } });
    const CODES=STATES.map(S=>S.code);
    function activeAt(date){ const t=+new Date(date); if(!isFinite(t)) return [];
      return STATES.filter(S=>{ const a=+new Date(S.from+'T00:00:00Z'), b=+new Date(S.to+'T23:59:59Z'); return t>=a&&t<=b; }); }
    /* aggregate successors' (already year-overlaid) countryStats into one synthetic stat object */
    function agg(S,year){
      const M=window.IntMapMaddison;
      let pop=0,mil=0,area=0, lN=0,lD=0, tN=0,tD=0, nN=0,nD=0, have=0;
      S.succ.forEach(c=>{ const s=countryStats[c]; if(!s) return;
        if(s.pop){ pop+=s.pop; if(s.lifeExp){ lN+=s.lifeExp*s.pop; lD+=s.pop; } if(s.tfr){ tN+=s.tfr*s.pop; tD+=s.pop; } if(s.internet!=null){ nN+=s.internet*s.pop; nD+=s.pop; } }
        if(s.milSpend) mil+=s.milSpend; if(s.area) area+=s.area;
        if(s.pop||s.gdp){ have++; }
      });
      /* GDP & population from the Maddison Project (real 2011 int$): SUN/YUG/CSK are first-class Maddison
         entities (used directly); the others sum their successors' Maddison values. Real & sourced. */
      let gdp=null, mpop=null, real=false;
      const _mc=S.madCode||S.code;   /* (#R129) Maddison series id — lets the interwar Kingdom of Yugoslavia (code YGK) reuse the continuous "YUG" series */
      if(M&&M.ready()&&year){
        if(M.has(_mc,year)){ gdp=M.gdpBil(_mc,year); mpop=M.popN(_mc,year); real=true; }
        else { let g=0,p=0,gh=false,ph=false; S.succ.forEach(c=>{ const cg=M.gdpBil(c,year), cp=M.popN(c,year); if(cg!=null){g+=cg;gh=true;} if(cp!=null){p+=cp;ph=true;} }); if(gh){gdp=g;real=true;} if(ph) mpop=p; }
      }
      if(mpop!=null&&mpop>0) pop=mpop;
      /* (#R109) EMPIRE ESTIMATE OVERRIDE: when Maddison has no single entity for this state, its successor-sum is
         incomplete — fall back to the documented empire-wide figure whenever the computed value is missing or
         implausibly low (< 60% of the estimate). "明らかにおかしい" A-H 6.84M → 52.8M. */
      const _hasMad=!!(M&&M.ready()&&M.has(_mc,year));
      if(S.popEst && !_hasMad && (pop==null || pop < S.popEst*0.6)){ pop=S.popEst; real=true; }
      if(S.gdpEst && !_hasMad && (gdp==null || gdp < S.gdpEst*0.6)){ gdp=S.gdpEst; real=true; }
      const nm=S.name;
      return { code:S.code, ccn3:'', nameEn:nm.en, nameJp:nm.jp, name:nm, flag:S.flag, region:S.region, wiki:S.wiki,
        sov:true, _hist:true, _histSucc:S.succ, _histHave:((real||S.popEst)?S.succ.length:have), _histN:S.succ.length, _from:S.from, _to:S.to, _real:real,
        capital:S.capital||'', currency:S.currency||'', languages:S.languages||'',   /* (#R130) real era capital / currency / languages on the historical card (were always blank) */
        pop:pop||null, gdp:gdp||null, area:area||null, milSpend:mil||null,
        gdppc:(gdp&&pop)?(gdp*1e9/pop):null, density:(pop&&area)?pop/area:null,
        lifeExp:(lD?lN/lD:null), tfr:(tD?tN/tD:null), internet:(nD?nN/nD:null) };
    }
    let _applied=null;   /* {codes:[], hidden:Set} currently injected into countryStats */
    function clear(){ if(!_applied) return; try{
      _applied.codes.forEach(c=>{ try{ delete countryStats[c]; }catch(_){} });
      _applied.hidden.forEach(c=>{ const s=countryStats[c]; if(s) delete s._histHidden; });
    }catch(_){} _applied=null; }
    function apply(date){ clear();
      const act=activeAt(date); if(!act.length) return;
      const year=new Date(date).getFullYear();
      const codes=[], hidden=new Set();
      act.forEach(S=>{ const a=agg(S,year); if(a._histHave<=0) return;   /* no successor data at all → skip (honest) */
        countryStats[S.code]=a; codes.push(S.code);
        S.succ.forEach(c=>{ if(countryStats[c]){ countryStats[c]._histHidden=true; hidden.add(c); } });
      });
      if(codes.length) _applied={codes,hidden};
    }
    /* used by renderStats when the tab renders (countryStats already carries the applied entries + hidden flags) */
    /* (#R94h) match a former state to its polygon NAME in the aourednik era-borders data (for map colouring) */
    const HB_MATCH={ SUN:/soviet|u\.?s\.?s\.?r/i, YUG:/yugoslav/i, YGK:/yugoslav/i, SCG:/serbia and montenegro|serbia & montenegro|yugoslav/i, CSK:/czechoslovak/i, UAR:/united arab republic/i, PKU:/^pakistan$/i, SDU:/^sudan$/i, ETU:/ethiopia|abyssinia/i, IDU:/^indonesia$/i,
      AUH:/austria.?hungary|austro.?hungar|austrian empire/i, OTT:/ottoman/i, RUE:/russian empire|^russia$/i, RAJ:/british raj|british india|^india$/i, JEM:/^japan$|japanese empire|empire of japan/i };
    return { STATES, CODES, activeAt, apply, clear, agg, _applied:()=>_applied, hbRe:(code)=>HB_MATCH[code]||null };
};

window.IntMapModules.histId=function(countryStats){
    const svgU=(inner)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20">'+inner+'</svg>';
    const flag=(inner)=>'<img class="hist-flag" alt="" src="data:image/svg+xml,'+encodeURIComponent(svgU(inner))+'">';
    const F_GEMP=flag('<rect width="30" height="6.667" fill="#000000"/><rect y="6.667" width="30" height="6.667" fill="#ffffff"/><rect y="13.333" width="30" height="6.667" fill="#DD0000"/>');
    /* (#R109) Weimar Republic = black-red-gold. The Nazi-era German Reich reuses the black-white-red tricolor (F_GEMP),
       a real 1933–35 state flag — the swastika flag is deliberately NOT rendered. */
    const F_WEIMAR=flag('<rect width="30" height="6.667" fill="#000000"/><rect y="6.667" width="30" height="6.667" fill="#DD0000"/><rect y="13.333" width="30" height="6.667" fill="#FFCE00"/>');
    const F_ITK=flag('<rect width="30" height="20" fill="#ffffff"/><rect width="10" height="20" fill="#009246"/><rect x="20" width="10" height="20" fill="#CE2B37"/><rect x="12.6" y="6.6" width="4.8" height="6.8" fill="#ffffff" stroke="#0038A8" stroke-width="0.5"/><rect x="14.55" y="6.6" width="0.9" height="6.8" fill="#C8102E"/><rect x="12.6" y="9.55" width="4.8" height="0.9" fill="#C8102E"/>');
    const F_QING=flag('<rect width="30" height="20" fill="#FFDE00"/><circle cx="7" cy="6" r="2.1" fill="#DE2910"/><path d="M4,15 C9,10 13,17 18,12 C22,9 26,13 27,12.5" stroke="#0055A4" stroke-width="1.5" fill="none" stroke-linecap="round"/>');
    const F_ROC=flag('<rect width="30" height="4" fill="#DE2910"/><rect y="4" width="30" height="4" fill="#FFCC00"/><rect y="8" width="30" height="4" fill="#0000A0"/><rect y="12" width="30" height="4" fill="#ffffff"/><rect y="16" width="30" height="4" fill="#000000"/>');
    const F_PERSIA=flag('<rect width="30" height="6.667" fill="#239F40"/><rect y="6.667" width="30" height="6.667" fill="#ffffff"/><rect y="13.333" width="30" height="6.667" fill="#DA0000"/><circle cx="15" cy="10" r="2.3" fill="#E8B800"/>');
    const F_SIAM=flag('<rect width="30" height="20" fill="#A51931"/><rect y="4" width="30" height="12" fill="#ffffff"/><rect y="7" width="30" height="6" fill="#2D2A4A"/>');
    const F_NLD=flag('<rect width="30" height="6.667" fill="#AE1C28"/><rect y="6.667" width="30" height="6.667" fill="#ffffff"/><rect y="13.333" width="30" height="6.667" fill="#21468B"/>');
    /* (#R117) era flags for the expanded identities */
    const STARH=(cx,cy)=>'<g transform="translate('+cx+','+cy+') scale(1.05)"><path d="M0,-1 0.2245,-0.309 0.951,-0.309 0.363,0.118 0.588,0.809 0,0.382 -0.588,0.809 -0.363,0.118 -0.951,-0.309 -0.2245,-0.309Z" fill="#ffffff"/></g>';
    const F_RUEH=flag('<rect width="30" height="6.667" fill="#ffffff"/><rect y="6.667" width="30" height="6.667" fill="#0039A6"/><rect y="13.333" width="30" height="6.667" fill="#D52B1E"/>');
    const F_RSFSR=flag('<rect width="30" height="20" fill="#CC0000"/><rect x="1.6" y="1.6" width="9" height="4.6" fill="none" stroke="#FFD700" stroke-width="0.5"/>');
    const F_ESP2=flag('<rect width="30" height="6.667" fill="#AD1519"/><rect y="6.667" width="30" height="6.667" fill="#FABD00"/><rect y="13.333" width="30" height="6.667" fill="#63307A"/>');
    const F_PTK=flag('<rect width="30" height="20" fill="#ffffff"/><rect width="12" height="20" fill="#003399"/><circle cx="12" cy="10" r="3.4" fill="#DA0000" stroke="#FFD700" stroke-width="0.7"/>');
    const F_BRE=flag('<rect width="30" height="20" fill="#009B3A"/><path d="M15,2.4 27,10 15,17.6 3,10Z" fill="#FEDF00"/><circle cx="15" cy="10" r="3.4" fill="#002776"/>');
    const F_EGYK=flag('<rect width="30" height="20" fill="#006233"/><circle cx="13.4" cy="10" r="4.6" fill="#ffffff"/><circle cx="15.1" cy="10" r="3.8" fill="#006233"/>'+STARH(18.2,7.4)+STARH(19.6,10)+STARH(18.2,12.6));
    /* (#R128) imperial Ethiopia = plain green-yellow-red tricolor (the imperial civil ensign; the modern flag adds a
       blue national-emblem disc, so this is a real era difference). */
    const F_ETHIMP=flag('<rect width="30" height="6.667" fill="#009A44"/><rect y="6.667" width="30" height="6.667" fill="#FEDD00"/><rect y="13.333" width="30" height="6.667" fill="#DA121A"/>');
    /* (#R128) Kingdom of Hungary (1920–1946) = red-white-green tricolor + the crowned "middle" coat of arms
       (Árpád bars + patriarchal cross on a green mound, under the Holy Crown) — modern Hungary is a plain tricolor. */
    const F_HUNK=flag('<rect width="30" height="6.667" fill="#CE2939"/><rect y="6.667" width="30" height="6.667" fill="#ffffff"/><rect y="13.333" width="30" height="6.667" fill="#477050"/><g transform="translate(15,10.6)"><path d="M-3.1,-3.3 H3.1 V0.4 C3.1,2.8 1.6,4.2 0,4.9 C-1.6,4.2 -3.1,2.8 -3.1,0.4 Z" fill="#ffffff" stroke="#7a5b00" stroke-width="0.25"/><g><rect x="-3.1" y="-3.3" width="3.1" height="1.03" fill="#CE2939"/><rect x="-3.1" y="-1.24" width="3.1" height="1.03" fill="#CE2939"/><rect x="-3.1" y="0.82" width="3.1" height="1.03" fill="#CE2939"/></g><path d="M0,-3.3 H3.1 V0.4 C3.1,2.6 1.7,3.9 0,4.7 Z" fill="#f2f2f2"/><path d="M0,3.6 C0.9,2.4 2.2,2.2 3.0,2.4 V0.4 C3.1,2.6 1.7,3.6 0,4.4 Z" fill="#2e7d46"/><g stroke="#ffffff" stroke-width="0.5" stroke-linecap="square"><line x1="1.55" y1="-2.6" x2="1.55" y2="1.4"/><line x1="0.75" y1="-1.7" x2="2.35" y2="-1.7"/><line x1="0.55" y1="-0.6" x2="2.55" y2="-0.6"/></g><path d="M-2.4,-4.2 H2.4 L2.0,-3.5 H-2.0 Z" fill="#E8B800" stroke="#7a5b00" stroke-width="0.2"/><path d="M-0.35,-5.5 L0.35,-5.5 L0.35,-4.85 L0.75,-4.85 L0.75,-4.2 H-0.75 L-0.75,-4.85 L-0.35,-4.85 Z" fill="#E8B800"/></g>');
    /* (#R130) more per-era identities so the country CARD shows the era name/flag instead of the modern one.
       Imperial State of Iran (Pahlavi) = green-white-red tricolour + the golden Sun (Lion-and-Sun); Francoist Spain
       = the rojigualda with the eagle of St John (distinct from modern Spain's arms). */
    const F_IRPAHL=flag('<rect width="30" height="6.667" fill="#239F40"/><rect y="6.667" width="30" height="6.667" fill="#ffffff"/><rect y="13.333" width="30" height="6.667" fill="#DA0000"/><g transform="translate(15,10)" stroke="#B8860B" stroke-width="0.4"><line x1="0" y1="-3.4" x2="0" y2="-2.2"/><line x1="0" y1="3.4" x2="0" y2="2.2"/><line x1="-3.4" y1="0" x2="-2.2" y2="0"/><line x1="3.4" y1="0" x2="2.2" y2="0"/><line x1="-2.4" y1="-2.4" x2="-1.6" y2="-1.6"/><line x1="2.4" y1="-2.4" x2="1.6" y2="-1.6"/><line x1="-2.4" y1="2.4" x2="-1.6" y2="1.6"/><line x1="2.4" y1="2.4" x2="1.6" y2="1.6"/></g><circle cx="15" cy="10" r="2.1" fill="#E8B800"/>');
    const F_ESPF=flag('<rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/><g transform="translate(11,10)"><path d="M-4.4,-3 Q-1.2,-1.2 0,-3.8 Q1.2,-1.2 4.4,-3 Q2.8,0 3.2,2.4 L-3.2,2.4 Q-2.8,0 -4.4,-3 Z" fill="#1a1a1a"/><rect x="-1.5" y="-1.6" width="3" height="3.9" rx="0.4" fill="#F1BF00" stroke="#AA151B" stroke-width="0.35"/></g>');
    const ID={
      CHN:[{from:1636,to:1912,name:{en:'Qing Empire',jp:'清',de:'Qing-Reich',ru:'Империя Цин',es:'Imperio Qing'},flag:F_QING,wiki:'Qing dynasty'},
           {from:1912,to:1949,name:{en:'Republic of China',jp:'中華民国',de:'Republik China',ru:'Китайская Республика',es:'República de China'},flag:F_ROC,wiki:'Republic of China (1912–1949)'}],
      DEU:[{from:1871,to:1918,name:{en:'German Empire',jp:'ドイツ帝国',de:'Deutsches Kaiserreich',ru:'Германская империя',es:'Imperio alemán'},flag:F_GEMP,wiki:'German Empire'},
           {from:1919,to:1932,name:{en:'Weimar Republic',jp:'ヴァイマル共和政',de:'Weimarer Republik',ru:'Веймарская республика',es:'República de Weimar'},flag:F_WEIMAR,wiki:'Weimar Republic'},
           {from:1933,to:1945,name:{en:'Nazi Germany',jp:'ナチス・ドイツ',de:'Deutsches Reich (1933–1945)',ru:'Нацистская Германия',es:'Alemania nazi'},flag:F_GEMP,wiki:'Nazi Germany'},
           /* (#R130) West Germany 1949–1990 (DEU carrier). East Germany is a separate CShapes polygon resolved via
              _VANISHED; the flag is the modern black-red-gold, correct for the FRG, so no era flag needed. */
           {from:1949,to:1990,name:{en:'West Germany',jp:'西ドイツ',de:'Bundesrepublik Deutschland (1949–1990)',ru:'ФРГ',es:'Alemania Occidental'},wiki:'West Germany'}],
      ITA:[{from:1861,to:1946,name:{en:'Kingdom of Italy',jp:'イタリア王国',de:'Königreich Italien',ru:'Королевство Италия',es:'Reino de Italia'},flag:F_ITK,wiki:'Kingdom of Italy'}],
      IRN:[{from:1800,to:1925,name:{en:'Persia',jp:'ペルシャ',de:'Persien',ru:'Персия',es:'Persia'},flag:F_PERSIA,wiki:'Qajar Iran'},
           /* (#R130) Pahlavi era 1925–1979 — was wrongly showing "Iran" + the modern Islamic-Republic flag. */
           {from:1925,to:1979,name:{en:'Imperial State of Iran',jp:'パフレヴィー朝イラン',de:'Kaiserreich Iran',ru:'Пехлевийский Иран',es:'Estado Imperial de Irán'},flag:F_IRPAHL,wiki:'Pahlavi Iran'}],
      THA:[{from:1800,to:1939,name:{en:'Siam',jp:'シャム',de:'Siam',ru:'Сиам',es:'Siam'},flag:F_SIAM,wiki:'Rattanakosin Kingdom'}],
      IDN:[{from:1800,to:1945,name:{en:'Dutch East Indies',jp:'オランダ領東インド',de:'Niederländisch-Indien',ru:'Голландская Ост-Индия',es:'Indias Orientales Neerlandesas'},flag:F_NLD,wiki:'Dutch East Indies'}],
      /* (#R117) 歴史国家拡充 — more per-era identities (era name + era flag + era Wikipedia on the country card) */
      JPN:[{from:1868,to:1946,name:{en:'Empire of Japan',jp:'大日本帝国',de:'Japanisches Kaiserreich',ru:'Японская империя',es:'Imperio del Japón'},wiki:'Empire of Japan'}],   /* 日章旗 = the modern flag — keep it */
      RUS:[{from:1721,to:1917,name:{en:'Russian Empire',jp:'ロシア帝国',de:'Russisches Kaiserreich',ru:'Российская империя',es:'Imperio ruso'},flag:F_RUEH,wiki:'Russian Empire'},
           {from:1918,to:1922,name:{en:'Soviet Russia (RSFSR)',jp:'ソビエト・ロシア（ロシアSFSR）',de:'Sowjetrussland (RSFSR)',ru:'Советская Россия (РСФСР)',es:'Rusia soviética (RSFSR)'},flag:F_RSFSR,wiki:'Russian Soviet Federative Socialist Republic'}],
      GBR:[{from:1801,to:1926,name:{en:'United Kingdom of Great Britain and Ireland',jp:'グレートブリテン・アイルランド連合王国',de:'Vereinigtes Königreich Großbritannien und Irland',ru:'Соединённое Королевство Великобритании и Ирландии',es:'Reino Unido de Gran Bretaña e Irlanda'},wiki:'United Kingdom of Great Britain and Ireland'}],
      ESP:[{from:1931,to:1939,name:{en:'Spanish Republic',jp:'スペイン第二共和政',de:'Zweite Spanische Republik',ru:'Вторая Испанская Республика',es:'Segunda República Española'},flag:F_ESP2,wiki:'Second Spanish Republic'},
           /* (#R130) Francoist Spain 1939–1975 — rojigualda with the eagle of St John (modern Spain shows a different coat of arms). */
           {from:1939,to:1975,name:{en:'Francoist Spain',jp:'フランコ体制期のスペイン',de:'Spanien unter Franco',ru:'Франкистская Испания',es:'España franquista'},flag:F_ESPF,wiki:'Francoist Spain'}],
      PRT:[{from:1800,to:1910,name:{en:'Kingdom of Portugal',jp:'ポルトガル王国',de:'Königreich Portugal',ru:'Королевство Португалия',es:'Reino de Portugal'},flag:F_PTK,wiki:'Kingdom of Portugal'}],
      BRA:[{from:1822,to:1889,name:{en:'Empire of Brazil',jp:'ブラジル帝国',de:'Kaiserreich Brasilien',ru:'Бразильская империя',es:'Imperio del Brasil'},flag:F_BRE,wiki:'Empire of Brazil'}],
      EGY:[{from:1922,to:1952,name:{en:'Kingdom of Egypt',jp:'エジプト王国',de:'Königreich Ägypten',ru:'Королевство Египет',es:'Reino de Egipto'},flag:F_EGYK,wiki:'Kingdom of Egypt'}],
      /* (#R118) further era identities — era Wikipedia + era name (flags unchanged where the flag was the same) */
      FRA:[{from:1870,to:1940,name:{en:'French Third Republic',jp:'フランス第三共和政',de:'Dritte Französische Republik',ru:'Третья французская республика',es:'Tercera República Francesa'},wiki:'French Third Republic'}],
      HUN:[{from:1920,to:1946,name:{en:'Kingdom of Hungary',jp:'ハンガリー王国',de:'Königreich Ungarn',ru:'Королевство Венгрия',es:'Reino de Hungría'},flag:F_HUNK,wiki:'Kingdom of Hungary (1920–1946)'}],
      /* (#R128) more per-era identities so the card shows the era name/flag (not the modern "South Korea"/"Ethiopia").
         KOR keeps the Taegukgi (historically continuous); imperial Ethiopia uses the plain tricolor (F_ETHIMP). */
      KOR:[{from:1897,to:1910,name:{en:'Korean Empire',jp:'大韓帝国',de:'Kaiserreich Korea',ru:'Корейская империя',es:'Imperio coreano'},wiki:'Korean Empire'}],
      ETH:[{from:1855,to:1974,name:{en:'Ethiopian Empire',jp:'エチオピア帝国',de:'Kaiserreich Abessinien',ru:'Эфиопская империя',es:'Imperio etíope'},flag:F_ETHIMP,wiki:'Ethiopian Empire'}]
    };
    function at(code,year){ const arr=ID[code]; if(!arr||!year) return null; for(const e of arr){ if(year>=e.from&&year<=e.to) return e; } return null; }
    let _applied=null;
    function clear(){ if(!_applied) return; for(const code in _applied){ const s=countryStats[code]; if(!s) continue; const o=_applied[code];
      s.nameEn=o.nameEn; s.nameJp=o.nameJp; s.name=o.name; s.flag=o.flag; s.wiki=o.wiki; if(!o._hid) delete s._histId; } _applied=null; }
    function apply(date){ clear(); const year=new Date(date).getFullYear(); const saved={};
      for(const code in ID){ const s=countryStats[code]; if(!s||s._histHidden) continue; const e=at(code,year); if(!e) continue;
        saved[code]={nameEn:s.nameEn,nameJp:s.nameJp,name:s.name,flag:s.flag,wiki:s.wiki,_hid:!!s._histId};
        s.nameEn=e.name.en; s.nameJp=e.name.jp; s.name=e.name; s.flag=(e.flag||s.flag); s.wiki=e.wiki; s._histId=true; }   /* (#R117) an entry without an era flag keeps the country's own flag (e.g. Empire of Japan = 日章旗) */
      if(Object.keys(saved).length) _applied=saved; }
    return { at, apply, clear, _applied:()=>_applied };
};
