/* ============================================================================
 *  IntMap · Atlas — 返答本文の小注釈（単位・時刻・略語）  (#R492)
 * ----------------------------------------------------------------------------
 *  「120 miles」にカーソルを置けば 193 km、「14:30 UTC」なら 23:30 JST、「EEZ」なら
 *  排他的経済水域 — 返答を読み進める手を止めずに、その場で答えが出る。
 *
 *  ⚠ 装飾は「描いたあとの DOM」ではなく「描く前の文字列」に入れる。
 *  js/atlas-console.js の `_atlCompose(ai)` は、吹き出しの innerHTML を
 *  `ai.__atlResults` の HTML 文字列から **毎回まるごと作り直す** — ツールを N 件使った
 *  ターンでは N+1 回。だから DOM を後から歩いて span を巻く実装は、次のアクションが
 *  終わった瞬間に消える。ここが mdMini の中（HTML 文字列を返す直前）に立っているのは
 *  そのため。文字列に入った注釈は、何度 compose されても同じ文字列から復元される。
 *
 *  ⚠ タグの中は決して触らない。annotateAtlasHTML はソースを `<…>` と「それ以外」に
 *  割り、テキストの側だけを書き換える。見出しの `style="font-size:1.3em"` が
 *  「1.3 em」という量に見えるのは属性の中だけの話で、そこは走査しない。
 *  <a> と <code> の中身も飛ばす — リンクの表示文字と、コードの中の数字は散文ではない。
 *  コードブロック・数式・表は mdMini の時点で PUA プレースホルダに退避済みなので、
 *  そもそもこの走査には見えていない（表のセルだけは _atlCellFmt から明示的に通す）。
 *
 *  ⚠ 数の読み方は読者のロケールから採る、表からではない。`10.000` は英語なら 10、
 *  ドイツ語なら 10000 で、どちらも正しい。だから区切り記号は
 *  `Intl.NumberFormat(locale).formatToParts()` に訊き、その約束に合わない綴りは
 *  **推測せずに注釈しない**（`parseQuantityNumber` は null を返す）。誤った換算は、
 *  換算しないことよりずっと悪い。
 *
 *  ⚠ 丸めたものは「≈」を付ける。10,000 ft = 3,048 m はちょうどだが 120 mi ≈ 193 km は
 *  違う。表示桁で丸めた結果が元と一致しないときだけ ≈ が付く（quantityNote の approx）。
 *
 *  ⚠ CSS は引用符付き文字列の連結で書く。CONSTITUTION §2 が名指す罠は「バッククォート」ではなく
 *  「テンプレートリテラルの中の CSS」なので、この file はテンプレートリテラルを 1 つも持たない
 *  ——終端させるものが無ければ、終端事故も起きない。tests/r492 ⑥b が構文木でそれを見ている。
 * ==========================================================================*/
/* ── 見た目 — 印そのものと、ホバー（と、タップ）で出る一枚 ────────────────────
   ⚠ 唯一 factory の外にある部品。js/atlas-styles.js が要るのはこの文字列だけで、語彙も走査も要らない。
   ⚠ `title` 属性は使わない。ネイティブのツールチップは 1 秒待たされ、体裁を選べず、
   タッチでは出ない。そして #R459 以降 `title=` は i18n の計器が読む面でもある。
   ⚠ 語彙（1）・略語（2）・走査（3）・配線（4）は下の makeAtlasAnnotate() の中。 */
export const ATLAS_ANNOTATE_CSS = ''
  /* ⚠ #atlas-panel で囲わない。同じ返答が浮動パネル・サイドバータブ・ワークスペース窓の
     3 面に出るので、コードブロックや表と同じく面に依らない書き方にする。 */
  + '.atl-an{text-decoration:underline dotted rgba(128,128,128,.34);text-decoration-thickness:1px;text-underline-offset:.2em;cursor:help;}'
  + '.atl-an-a{text-decoration-color:rgba(128,128,128,.62);}'
  + '.atl-an:hover{text-decoration-color:var(--primary-color);}'
  /* ⚠ 20000 は「全パネルより上、全面オーバーレイより下」。この app の面の最大は 10060（ドック類）、
     全面を覆うもの（監視オーバーレイ・オンボーディング・再読込バナー）は 99990 以上にいる。
     100000 に置くとオーバーレイと同点になり、後から body に足したこの一枚が上に乗ってしまう。 */
  + '.atl-antip{position:fixed;left:0;top:0;z-index:20000;max-width:min(310px,86vw);padding:8px 11px 9px;border-radius:12px;background:var(--popup-bg,rgba(255,255,255,.9));color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,.2));box-shadow:0 10px 32px rgba(0,0,0,.24);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);font-size:12.5px;line-height:1.45;pointer-events:none;opacity:0;visibility:hidden;transform:translateY(3px);transition:opacity .13s ease,transform .13s ease,visibility .13s;}'
  + '.atl-antip.on{opacity:1;visibility:visible;transform:none;}'
  + '.atl-antip.below{transform:translateY(-3px);}.atl-antip.below.on{transform:none;}'
  + '.atl-antip-t{font-size:14px;font-weight:600;letter-spacing:.005em;color:var(--text-main);}'
  + '.atl-antip-d{margin-top:3px;font-size:11.5px;color:var(--text-muted);}'
  + '@media(max-width:768px){.atl-antip{font-size:13.5px;max-width:min(320px,92vw);}.atl-antip-t{font-size:15px;}.atl-antip-d{font-size:12.5px;}}';

/** ⚠ ONE FACTORY, because a js/ module may hold no unexported top-level declaration (tests/r175 ③)
 *  and no export that nothing imports by name. The lexicon, the glossary, the compiled regexes and
 *  the walk are all private to this call; js/atlas-reply.js makes it once, inside makeAtlasReply.
 *  ⚠ The stylesheet stays OUTSIDE it — js/atlas-styles.js needs the string, not the machinery. */
export function makeAtlasAnnotate() {

  /* ── 1. 単位 ─────────────────────────────────────────────────────────────────
     1 行は `id|綴り;綴り;…` — 「その単位をこう書くことがある」綴りの集合で、言語を跨いで **1 本**
     にしてある。検出に言語分岐は要らない — 綴りが分かればどの言語で書かれていても同じ量だから。
     ⚠ この綴りは**照合の入力であって、アプリが書く文ではない**（表の直上で entity data として宣言してある。
     ⚠ そこに書いた印は字句なので、ここで綴り直してはならない——印は「次の宣言」に付くので、この行に
     書くと直後の `U` が entity data だと宣言してしまい、監査は正しくそれを拒否する）。
     ⚠ 意図的に入れていないもの: 裸の `in`（英語の前置詞）、裸の `NM`（ナノメートルと海里）、
     裸の `M`（地震のマグニチュード）、`g`（グラムと重力加速度）、`t`（トンの系が3つある）。
     曖昧な綴りを1つ入れるたびに、正しい注釈より多くの誤った注釈が出る。 */
  /** one row of the table: `id|alias;alias;…`, the unit it converts INTO, and either a factor or a
   *  function (the two temperature rows are not proportional, so they carry a function and are the
   *  only rows for which `temp` — one decimal place at most — is true). */
  const U = (packed, to, k) => {
    const p = String(packed).split('|');
    return { id: p[0], a: p[1] ? p[1].split(';') : [], to: to,
             k: typeof k === 'number' ? k : 1, f: typeof k === 'function' ? k : null, temp: typeof k === 'function' };
  };
  /* ⚠⚠ THE SPELLINGS BELOW ARE MATCHER INPUT, NOT TEXT THE APP WRITES. They are packed as
     `id|alias;alias;…` and declared as entity data for the same reason js/newsgeo.js packs its
     capital-name and publication tables that way: a later round that dutifully "translates" a
     matching list breaks the matcher it exists for. What the reader actually SEES is the note —
     a number and a unit SYMBOL (`193 km`, `20 °C`), which is the same in all nine languages. */
  /* @i18n-entity-data  unit SPELLINGS packed as `id|alias;alias;…` — the strings a reply is matched
     against, never text the app writes. Translating them would break the conversion they exist for. */
  const ATLAS_UNITS = [
    /* 長さ */
    U('mi|mi;mile;miles;Meile;Meilen;milla;millas;マイル;миля;мили;миль;마일;英里;英哩', 'km', 1.609344),
    U('nmi|nmi;nautical mile;nautical miles;Seemeile;Seemeilen;milla náutica;millas náuticas;mille marin;milles marins;海里;浬;ノットマイル;морская миля;морских миль;해리', 'km', 1.852),
    U('ft|ft;foot;feet;Fuß;pies;pieds;フィート;фут;фута;футов;피트;英尺', 'm', 0.3048),
    U('yd|yd;yds;yard;yards;Yard;ヤード;ярдов;야드;码', 'm', 0.9144),
    U('inch|inch;inches;Zoll;pulgadas;pouces;インチ;дюйм;дюйма;дюймов;인치;英寸', 'cm', 2.54),
    U('km|km;kilometer;kilometers;kilometre;kilometres;Kilometer;kilómetros;kilomètres;キロメートル;км;километров;킬로미터;公里;千米', 'mi', 1 / 1.609344),
    U('m|m;meter;meters;metre;metres;Meter;metros;mètres;メートル;метр;метра;метров;미터;米', 'ft', 1 / 0.3048),
    U('cm|cm;センチメートル;см;厘米;公分', 'in', 1 / 2.54),
    /* 速さ */
    U('mph|mph;mi/h', 'km/h', 1.609344),
    U('kn|kn;kt;kts;knot;knots;Knoten;nudos;nœuds;ノット;узел;узла;узлов;노트;节', 'km/h', 1.852),
    U('kmh|km/h;kph;km/hr;км/ч;公里/小時;公里/小时', 'mph', 1 / 1.609344),
    U('ms|m/s;м/с;米/秒', 'km/h', 3.6),
    /* 温度 */
    U('degF|°F;℉', '°C', (v) => (v - 32) * 5 / 9),
    U('degC|°C;℃', '°F', (v) => v * 9 / 5 + 32),
    /* 質量 */
    U('lb|lb;lbs;pound;pounds;Pfund;libras;ポンド;фунт;фунта;фунтов;파운드;磅', 'kg', 0.45359237),
    U('oz|oz;ounce;ounces;Unze;onzas;onces;オンス;унций;온스;盎司', 'g', 28.349523125),
    U('kg|kg;kilogram;kilograms;kilogramme;kilogrammes;Kilogramm;kilogramos;キログラム;кг;킬로그램;公斤', 'lb', 1 / 0.45359237),
    /* 面積 */
    U('sqmi|sq mi;sq. mi;mi²;sq miles;square mile;square miles;Quadratmeilen;millas cuadradas;平方マイル;平方英里', 'km²', 2.589988110336),
    U('sqkm|km²;sq km;square kilometer;square kilometers;square kilometre;square kilometres;Quadratkilometer;kilómetros cuadrados;kilomètres carrés;平方キロメートル;км²;кв. км;제곱킬로미터;平方公里;平方千米', 'sq mi', 1 / 2.589988110336),
    U('acre|acre;acres;Acre;エーカー;акров;에이커;英畝', 'ha', 0.40468564224),
    U('ha|ha;hectare;hectares;hectárea;hectáreas;Hektar;ヘクタール;гектаров;헥타르;公頃;公顷', 'ac', 1 / 0.40468564224),
    /* 気圧 */
    U('hPa|hPa;mb;mbar;hectopascal;hectopascals;ヘクトパスカル;гПа;百帕', 'inHg', 1 / 33.863886666667),
    U('inHg|inHg;in Hg;inches of mercury', 'hPa', 33.863886666667),
    /* 体積 */
    U('gal|gal;gallon;gallons;galones;ガロン;галлонов;갤런;加侖', 'L', 3.785411784),
    U('L|L;liter;liters;litre;litres;Liter;litros;リットル;литров;리터;升', 'gal', 1 / 3.785411784),
  ];

  const UNIT_BY_ID = (() => { const o = Object.create(null); for (const u of ATLAS_UNITS) o[u.id] = u; return o; })();
  const UNIT_BY_ALIAS = (() => {
    const o = Object.create(null);
    for (const u of ATLAS_UNITS) for (const s of u.a) if (o[s] === undefined) o[s] = u.id;
    return o;
  })();

  /** 綴り → 単位 id。完全一致・大小文字を区別する（'M' はマグニチュード、'm' はメートル）。 */
  function unitIdForToken(token) { const id = UNIT_BY_ALIAS[String(token)]; return id === undefined ? null : id; }

  /** 量の換算。返すのは {value, unit} か null。純関数 — DOM も window も見ない。 */
  function convertQuantity(value, unitId) {
    const u = UNIT_BY_ID[unitId];
    if (!u || typeof value !== 'number' || !isFinite(value)) return null;
    const v = u.f ? u.f(value) : value * u.k;
    if (!isFinite(v)) return null;
    return { value: v, unit: u.to, temp: !!u.temp };
  }

  /* ── 2. 略語 ─────────────────────────────────────────────────────────────────
     ⚠ 大小文字を区別して**完全一致**で引く。'SAM' は地対空ミサイル、'Sam' は人名。
     `n` が展開（正式名称）、`d` が意味。どちらも 9 言語 —
     `window.IntMapLang.t(lang, en, ja, de, ru, es)` の 5 引数と、fr/ko/zh-Hant/zh-Hans の
     inline 表（js/locales/ui.{fr,ko,zh,zh-hans}.js）。scripts/i18n-audit.mjs がこの形を見る。 */
  const ATLAS_GLOSSARY = [
    { t: 'EEZ',
      n: (l) => window.IntMapLang.t(l, 'Exclusive Economic Zone', '排他的経済水域', 'Ausschließliche Wirtschaftszone', 'Исключительная экономическая зона', 'Zona económica exclusiva'),
      d: (l) => window.IntMapLang.t(l, 'The sea a coastal state controls for fishing and resources, out to 200 nautical miles.', '沿岸国が漁業と資源について権利を持つ海域。基線から200海里まで。', 'Das Meer, das ein Küstenstaat für Fischerei und Rohstoffe kontrolliert — bis 200 Seemeilen.', 'Морская зона, где прибрежное государство контролирует рыболовство и ресурсы, до 200 морских миль.', 'El mar que un Estado costero controla para pesca y recursos, hasta 200 millas náuticas.') },
    { t: 'UNCLOS',
      n: (l) => window.IntMapLang.t(l, 'United Nations Convention on the Law of the Sea', '国連海洋法条約', 'Seerechtsübereinkommen der Vereinten Nationen', 'Конвенция ООН по морскому праву', 'Convención de las Naciones Unidas sobre el Derecho del Mar'),
      d: (l) => window.IntMapLang.t(l, 'The 1982 treaty that defines territorial seas, exclusive economic zones and the continental shelf.', '領海・排他的経済水域・大陸棚を定めた1982年の条約。', 'Der Vertrag von 1982, der Küstenmeer, ausschließliche Wirtschaftszonen und Festlandsockel festlegt.', 'Договор 1982 года, определяющий территориальные воды, исключительные экономические зоны и континентальный шельф.', 'El tratado de 1982 que define el mar territorial, las zonas económicas exclusivas y la plataforma continental.') },
    { t: 'GDP PPP',
      n: (l) => window.IntMapLang.t(l, 'Gross domestic product at purchasing power parity', '購買力平価による国内総生産', 'Bruttoinlandsprodukt zu Kaufkraftparität', 'ВВП по паритету покупательной способности', 'Producto interior bruto en paridad de poder adquisitivo'),
      d: (l) => window.IntMapLang.t(l, 'Output valued at what money actually buys locally, so countries compare without exchange-rate distortion.', '現地で実際に買える量で測った生産額。為替レートの歪みを除いて国際比較できる。', 'Wirtschaftsleistung, bewertet nach der örtlichen Kaufkraft — Ländervergleich ohne Wechselkursverzerrung.', 'Объём производства в местной покупательной способности — сравнение стран без искажения курсами валют.', 'Producción valorada según lo que el dinero compra localmente, sin distorsión del tipo de cambio.') },
    { t: 'GDP',
      n: (l) => window.IntMapLang.t(l, 'Gross domestic product', '国内総生産', 'Bruttoinlandsprodukt', 'Валовой внутренний продукт', 'Producto interior bruto'),
      d: (l) => window.IntMapLang.t(l, 'The value of everything a country produces in a year.', '一国が1年間に生み出した財・サービスの総額。', 'Der Wert aller Güter und Dienste, die ein Land in einem Jahr erzeugt.', 'Стоимость всего, что страна производит за год.', 'El valor de todo lo que un país produce en un año.') },
    { t: 'PPP',
      n: (l) => window.IntMapLang.t(l, 'Purchasing power parity', '購買力平価', 'Kaufkraftparität', 'Паритет покупательной способности', 'Paridad de poder adquisitivo'),
      d: (l) => window.IntMapLang.t(l, 'A conversion that equalises what one unit of money buys in each country.', '同じ金額で買える量が各国で等しくなるように換算する方法。', 'Eine Umrechnung, die angleicht, was eine Geldeinheit in jedem Land kauft.', 'Пересчёт, уравнивающий то, что можно купить на единицу денег в каждой стране.', 'Una conversión que iguala lo que compra una unidad de dinero en cada país.') },
    { t: 'GNI',
      n: (l) => window.IntMapLang.t(l, 'Gross national income', '国民総所得', 'Bruttonationaleinkommen', 'Валовой национальный доход', 'Renta nacional bruta'),
      d: (l) => window.IntMapLang.t(l, 'GDP plus the income residents earn abroad, minus what foreigners earn at home.', 'GDPに居住者が海外で得た所得を足し、国内で外国人が得た所得を引いたもの。', 'BIP plus Einkommen der Inländer aus dem Ausland, minus Einkommen von Ausländern im Inland.', 'ВВП плюс доходы резидентов из-за рубежа минус доходы иностранцев внутри страны.', 'El PIB más las rentas que los residentes obtienen en el exterior, menos las que los extranjeros obtienen dentro.') },
    { t: 'HDI',
      n: (l) => window.IntMapLang.t(l, 'Human Development Index', '人間開発指数', 'Index der menschlichen Entwicklung', 'Индекс человеческого развития', 'Índice de desarrollo humano'),
      d: (l) => window.IntMapLang.t(l, 'A 0-1 score combining life expectancy, schooling and income.', '平均寿命・教育・所得を合成した0〜1の指標。', 'Ein Wert von 0 bis 1 aus Lebenserwartung, Bildung und Einkommen.', 'Показатель от 0 до 1, объединяющий продолжительность жизни, образование и доход.', 'Una puntuación de 0 a 1 que combina esperanza de vida, educación e ingresos.') },
    { t: 'CPI',
      n: (l) => window.IntMapLang.t(l, 'Consumer price index', '消費者物価指数', 'Verbraucherpreisindex', 'Индекс потребительских цен', 'Índice de precios al consumo'),
      d: (l) => window.IntMapLang.t(l, 'The price of a fixed basket of goods over time - the usual measure of inflation.', '一定の商品かごの価格の推移。インフレ率の標準的な尺度。', 'Der Preis eines festen Warenkorbs im Zeitverlauf — das übliche Inflationsmaß.', 'Цена фиксированной корзины товаров во времени — обычная мера инфляции.', 'El precio de una cesta fija de bienes a lo largo del tiempo, la medida habitual de la inflación.') },
    { t: 'TFR',
      n: (l) => window.IntMapLang.t(l, 'Total fertility rate', '合計特殊出生率', 'Zusammengefasste Geburtenziffer', 'Суммарный коэффициент рождаемости', 'Tasa global de fecundidad'),
      d: (l) => window.IntMapLang.t(l, 'Children per woman over a lifetime at current rates; about 2.1 keeps a population steady.', '現在の出生率が続いた場合に女性1人が生涯に産む子どもの数。約2.1で人口が横ばいになる。', 'Kinder je Frau über das Leben bei heutigen Raten; etwa 2,1 hält die Bevölkerung konstant.', 'Число детей на женщину при текущих показателях; около 2,1 удерживает численность населения.', 'Hijos por mujer a lo largo de la vida con las tasas actuales; unos 2,1 mantienen estable la población.') },
    { t: 'MMI',
      n: (l) => window.IntMapLang.t(l, 'Modified Mercalli Intensity', '改正メルカリ震度階級', 'Modifizierte Mercalliskala', 'Модифицированная шкала Меркалли', 'Escala de Mercalli modificada'),
      d: (l) => window.IntMapLang.t(l, 'Shaking as people and buildings experience it, I to XII - not the earthquake energy itself.', '人や建物が受けた揺れの強さをI〜XIIで表す。地震のエネルギーそのものではない。', 'Die erlebte Erschütterung von I bis XII — nicht die Energie des Bebens.', 'Ощущаемая интенсивность сотрясений от I до XII — не энергия землетрясения.', 'La sacudida tal como la perciben personas y edificios, de I a XII, no la energía del sismo.') },
    { t: 'VEI',
      n: (l) => window.IntMapLang.t(l, 'Volcanic Explosivity Index', '火山爆発指数', 'Vulkanexplosivitätsindex', 'Индекс вулканической эксплозивности', 'Índice de explosividad volcánica'),
      d: (l) => window.IntMapLang.t(l, 'A 0-8 scale of eruption size; each step is about ten times the ejected volume.', '噴火の規模を0〜8で表す指標。1段階で噴出量が約10倍になる。', 'Eine Skala von 0 bis 8 für die Eruptionsgröße; jede Stufe etwa zehnfaches Auswurfvolumen.', 'Шкала от 0 до 8 для размера извержения; каждая ступень — примерно вдесятеро больший объём выброса.', 'Escala de 0 a 8 del tamaño de una erupción; cada paso multiplica por diez el volumen expulsado.') },
    { t: 'Mw',
      n: (l) => window.IntMapLang.t(l, 'Moment magnitude', 'モーメントマグニチュード', 'Momenten-Magnitude', 'Магнитуда момента', 'Magnitud de momento'),
      d: (l) => window.IntMapLang.t(l, 'The modern earthquake magnitude, from the energy released rather than a needle swing.', '放出エネルギーから求める現代の地震規模。針の振れ幅ではない。', 'Die moderne Erdbebenstärke, aus der freigesetzten Energie statt aus einem Nadelausschlag.', 'Современная магнитуда землетрясения — по выделившейся энергии, а не по размаху стрелки.', 'La magnitud sísmica moderna, calculada a partir de la energía liberada y no del trazo de una aguja.') },
    { t: 'SST',
      n: (l) => window.IntMapLang.t(l, 'Sea surface temperature', '海面水温', 'Meeresoberflächentemperatur', 'Температура поверхности моря', 'Temperatura de la superficie del mar'),
      d: (l) => window.IntMapLang.t(l, 'The temperature of the topmost layer of the ocean; it drives storms and fisheries.', '海の最上層の水温。暴風雨や漁業を左右する。', 'Die Temperatur der obersten Ozeanschicht; sie treibt Stürme und Fischerei an.', 'Температура верхнего слоя океана; от неё зависят штормы и рыболовство.', 'La temperatura de la capa más superficial del océano; gobierna tormentas y pesquerías.') },
    { t: 'ENSO',
      n: (l) => window.IntMapLang.t(l, 'El Nino-Southern Oscillation', 'エルニーニョ・南方振動', 'El Niño-Südliche Oszillation', 'Эль-Ниньо — Южное колебание', 'El Niño-Oscilación del Sur'),
      d: (l) => window.IntMapLang.t(l, 'The Pacific ocean-atmosphere cycle that shifts rainfall and temperature worldwide.', '太平洋の海洋と大気が数年周期で変動し、世界の降水と気温をずらす現象。', 'Der pazifische Ozean-Atmosphäre-Zyklus, der Niederschlag und Temperatur weltweit verschiebt.', 'Тихоокеанский цикл океан—атмосфера, смещающий осадки и температуру по всему миру.', 'El ciclo océano-atmósfera del Pacífico que desplaza lluvias y temperaturas en todo el mundo.') },
    { t: 'ITCZ',
      n: (l) => window.IntMapLang.t(l, 'Intertropical Convergence Zone', '熱帯収束帯', 'Innertropische Konvergenzzone', 'Внутритропическая зона конвергенции', 'Zona de convergencia intertropical'),
      d: (l) => window.IntMapLang.t(l, 'The belt near the equator where the trade winds meet and the heaviest rain falls.', '赤道付近で貿易風がぶつかり、最も雨が多くなる帯。', 'Der Gürtel nahe dem Äquator, wo die Passatwinde zusammentreffen und der stärkste Regen fällt.', 'Пояс у экватора, где сходятся пассаты и выпадают самые сильные дожди.', 'La franja cercana al ecuador donde convergen los vientos alisios y caen las lluvias más intensas.') },
    { t: 'AQI',
      n: (l) => window.IntMapLang.t(l, 'Air quality index', '大気質指数', 'Luftqualitätsindex', 'Индекс качества воздуха', 'Índice de calidad del aire'),
      d: (l) => window.IntMapLang.t(l, 'Pollutant levels rescaled to one number: 0-50 is good, 300 and above is hazardous.', '汚染物質の濃度を1つの数値に直したもの。0〜50が良好、300以上は危険。', 'Schadstoffwerte auf eine Zahl umgerechnet: 0-50 gut, ab 300 gefährlich.', 'Уровни загрязнителей, сведённые к одному числу: 0-50 хорошо, 300 и выше опасно.', 'Los niveles de contaminantes reescalados a un solo número: 0-50 es bueno y 300 o más, peligroso.') },
    { t: 'AOD',
      n: (l) => window.IntMapLang.t(l, 'Aerosol optical depth', 'エアロゾル光学的厚さ', 'Optische Dicke von Aerosolen', 'Аэрозольная оптическая толщина', 'Espesor óptico de aerosoles'),
      d: (l) => window.IntMapLang.t(l, 'How much dust, smoke and haze block sunlight through the whole air column.', '大気全層のちり・煙・もやが日射をどれだけ遮るかの尺度。', 'Wie stark Staub, Rauch und Dunst das Sonnenlicht in der gesamten Luftsäule dämpfen.', 'Насколько пыль, дым и мгла ослабляют солнечный свет во всей толще атмосферы.', 'Cuánto bloquean la luz solar el polvo, el humo y la calima en toda la columna de aire.') },
    { t: 'PM2.5',
      n: (l) => window.IntMapLang.t(l, 'Fine particulate matter', '微小粒子状物質', 'Feinstaub', 'Мелкодисперсные частицы', 'Partículas finas'),
      d: (l) => window.IntMapLang.t(l, 'Airborne particles under 2.5 micrometres - small enough to reach deep into the lungs.', '直径2.5マイクロメートル以下の粒子。肺の奥まで届く大きさ。', 'Schwebeteilchen unter 2,5 Mikrometern — klein genug, um tief in die Lunge zu gelangen.', 'Взвешенные частицы менее 2,5 мкм — достаточно мелкие, чтобы проникать глубоко в лёгкие.', 'Partículas en suspensión de menos de 2,5 micrómetros, capaces de llegar al fondo de los pulmones.') },
    { t: 'AIS',
      n: (l) => window.IntMapLang.t(l, 'Automatic Identification System', '船舶自動識別装置', 'Automatisches Identifikationssystem', 'Автоматическая идентификационная система', 'Sistema de identificación automática'),
      d: (l) => window.IntMapLang.t(l, 'The radio beacon ships broadcast with their identity, position and course.', '船舶が自船の識別符号・位置・針路を発信する無線装置。', 'Die Funkbake, mit der Schiffe Identität, Position und Kurs senden.', 'Радиомаяк, которым суда передают опознавание, позицию и курс.', 'La baliza de radio con la que los buques emiten su identidad, posición y rumbo.') },
    { t: 'ADS-B',
      n: (l) => window.IntMapLang.t(l, 'Automatic Dependent Surveillance-Broadcast', '放送型自動従属監視', 'Automatische bordabhängige Überwachung — Rundsendung', 'Автоматическое зависимое наблюдение — вещание', 'Vigilancia dependiente automática por radiodifusión'),
      d: (l) => window.IntMapLang.t(l, 'The signal aircraft broadcast with their position, altitude and identity.', '航空機が位置・高度・識別符号を放送する信号。', 'Das Signal, mit dem Flugzeuge Position, Höhe und Kennung aussenden.', 'Сигнал, которым воздушные суда передают позицию, высоту и опознавание.', 'La señal con la que las aeronaves emiten posición, altitud e identificación.') },
    { t: 'ICAO',
      n: (l) => window.IntMapLang.t(l, 'International Civil Aviation Organization', '国際民間航空機関', 'Internationale Zivilluftfahrtorganisation', 'Международная организация гражданской авиации', 'Organización de Aviación Civil Internacional'),
      d: (l) => window.IntMapLang.t(l, 'The UN aviation body; its four-letter codes name airports worldwide.', '国連の民間航空機関。4文字コードで世界の空港を識別する。', 'Die UN-Luftfahrtbehörde; ihre Vierbuchstabencodes benennen Flughäfen weltweit.', 'Авиационный орган ООН; его четырёхбуквенные коды обозначают аэропорты мира.', 'El organismo aeronáutico de la ONU; sus códigos de cuatro letras identifican aeropuertos.') },
    { t: 'IATA',
      n: (l) => window.IntMapLang.t(l, 'International Air Transport Association', '国際航空運送協会', 'Internationale Luftverkehrs-Vereinigung', 'Международная ассоциация воздушного транспорта', 'Asociación Internacional de Transporte Aéreo'),
      d: (l) => window.IntMapLang.t(l, 'The airline trade body; its three-letter codes appear on tickets and bags.', '航空会社の業界団体。3文字コードが航空券や手荷物に使われる。', 'Der Airline-Verband; seine Dreibuchstabencodes stehen auf Tickets und Gepäck.', 'Отраслевое объединение авиакомпаний; его трёхбуквенные коды стоят на билетах и багаже.', 'La asociación de aerolíneas; sus códigos de tres letras figuran en billetes y equipajes.') },
    { t: 'METAR',
      n: (l) => window.IntMapLang.t(l, 'Aerodrome routine weather report', '定時飛行場実況気象通報', 'Routinewettermeldung eines Flugplatzes', 'Регулярная сводка погоды аэродрома', 'Informe meteorológico ordinario de aeródromo'),
      d: (l) => window.IntMapLang.t(l, 'The coded hourly observation of wind, visibility, cloud and pressure at an airport.', '空港の風・視程・雲・気圧を毎時符号化して伝える実況気象。', 'Die stündliche, codierte Beobachtung von Wind, Sicht, Wolken und Druck an einem Flughafen.', 'Ежечасная кодированная сводка ветра, видимости, облачности и давления на аэродроме.', 'La observación horaria codificada de viento, visibilidad, nubes y presión en un aeropuerto.') },
    { t: 'TAF',
      n: (l) => window.IntMapLang.t(l, 'Terminal aerodrome forecast', '飛行場予報', 'Flugplatzwettervorhersage', 'Прогноз погоды по аэродрому', 'Pronóstico de aeródromo'),
      d: (l) => window.IntMapLang.t(l, 'The airport weather forecast, usually covering the next 24 to 30 hours.', '空港の気象予報。通常24〜30時間先までを対象とする。', 'Die Wettervorhersage für einen Flughafen, meist für die nächsten 24 bis 30 Stunden.', 'Прогноз погоды для аэродрома, обычно на ближайшие 24-30 часов.', 'El pronóstico meteorológico del aeropuerto, normalmente para las próximas 24 a 30 horas.') },
    { t: 'NOTAM',
      n: (l) => window.IntMapLang.t(l, 'Notice to Air Missions', '航空情報', 'Nachricht für Luftfahrer', 'Извещение для лётного состава', 'Aviso a los navegantes aéreos'),
      d: (l) => window.IntMapLang.t(l, 'A published notice of hazards, closures or airspace restrictions pilots must know.', '危険・閉鎖・空域制限などをパイロットに知らせる公示。', 'Eine veröffentlichte Mitteilung über Gefahren, Sperrungen oder Luftraumbeschränkungen.', 'Публикуемое извещение об опасностях, закрытиях или ограничениях воздушного пространства.', 'Un aviso publicado sobre peligros, cierres o restricciones de espacio aéreo.') },
    { t: 'AGL',
      n: (l) => window.IntMapLang.t(l, 'Above ground level', '対地高度', 'über Grund', 'над уровнем земли', 'sobre el nivel del suelo'),
      d: (l) => window.IntMapLang.t(l, 'Height measured from the ground directly below, not from the sea.', '真下の地表からの高さ。海面基準ではない。', 'Höhe über dem Boden direkt darunter, nicht über dem Meer.', 'Высота от земли непосредственно под воздушным судном, а не от уровня моря.', 'Altura medida desde el terreno situado justo debajo, no desde el mar.') },
    { t: 'MSL',
      n: (l) => window.IntMapLang.t(l, 'Above mean sea level', '平均海面高度', 'über mittlerem Meeresspiegel', 'над средним уровнем моря', 'sobre el nivel medio del mar'),
      d: (l) => window.IntMapLang.t(l, 'Height measured from average sea level, so every aircraft shares one reference.', '平均海面を基準にした高さ。すべての航空機が同じ基準を共有できる。', 'Höhe über dem mittleren Meeresspiegel, damit alle Luftfahrzeuge dieselbe Bezugsfläche nutzen.', 'Высота от среднего уровня моря — общая точка отсчёта для всех воздушных судов.', 'Altura sobre el nivel medio del mar, una referencia común para todas las aeronaves.') },
    { t: 'QNH',
      n: (l) => window.IntMapLang.t(l, 'Altimeter setting (sea-level pressure)', '高度計規正値（海面気圧）', 'Höhenmessereinstellung (Meeresspiegeldruck)', 'Установка высотомера (давление на уровне моря)', 'Reglaje altimétrico (presión al nivel del mar)'),
      d: (l) => window.IntMapLang.t(l, 'The pressure a pilot dials in so the altimeter reads height above sea level.', '高度計が海面からの高度を示すようにパイロットが設定する気圧値。', 'Der Druckwert, den ein Pilot einstellt, damit der Höhenmesser die Höhe über dem Meer anzeigt.', 'Значение давления, вводимое пилотом, чтобы высотомер показывал высоту над уровнем моря.', 'El valor de presión que el piloto ajusta para que el altímetro indique la altura sobre el mar.') },
    { t: 'SAM',
      n: (l) => window.IntMapLang.t(l, 'Surface-to-air missile', '地対空ミサイル', 'Boden-Luft-Rakete', 'Зенитная управляемая ракета', 'Misil superficie-aire'),
      d: (l) => window.IntMapLang.t(l, 'A missile fired at aircraft from the ground or from a ship.', '地上または艦船から航空機に向けて発射するミサイル。', 'Eine vom Boden oder von einem Schiff gegen Luftziele gestartete Rakete.', 'Ракета, запускаемая с земли или корабля по воздушным целям.', 'Un misil lanzado desde tierra o desde un buque contra aeronaves.') },
    { t: 'ICBM',
      n: (l) => window.IntMapLang.t(l, 'Intercontinental ballistic missile', '大陸間弾道ミサイル', 'Interkontinentalrakete', 'Межконтинентальная баллистическая ракета', 'Misil balístico intercontinental'),
      d: (l) => window.IntMapLang.t(l, 'A ballistic missile with a range beyond 5,500 km.', '射程5,500kmを超える弾道ミサイル。', 'Eine ballistische Rakete mit über 5.500 km Reichweite.', 'Баллистическая ракета дальностью свыше 5500 км.', 'Un misil balístico con alcance superior a 5.500 km.') },
    { t: 'UAV',
      n: (l) => window.IntMapLang.t(l, 'Unmanned aerial vehicle', '無人航空機', 'Unbemanntes Luftfahrzeug', 'Беспилотный летательный аппарат', 'Vehículo aéreo no tripulado'),
      d: (l) => window.IntMapLang.t(l, 'An aircraft flown with no one on board - a drone.', '搭乗者のいない航空機。いわゆるドローン。', 'Ein Luftfahrzeug ohne Besatzung an Bord — eine Drohne.', 'Летательный аппарат без экипажа на борту — дрон.', 'Una aeronave que vuela sin nadie a bordo: un dron.') },
    { t: 'LEO',
      n: (l) => window.IntMapLang.t(l, 'Low Earth orbit', '低地球軌道', 'Niedrige Erdumlaufbahn', 'Низкая околоземная орбита', 'Órbita terrestre baja'),
      d: (l) => window.IntMapLang.t(l, 'Orbits below about 2,000 km, where most satellites and the ISS fly.', '高度およそ2,000km以下の軌道。大半の衛星とISSがここを回る。', 'Umlaufbahnen unter etwa 2.000 km, wo die meisten Satelliten und die ISS fliegen.', 'Орбиты ниже примерно 2000 км, где летают большинство спутников и МКС.', 'Órbitas por debajo de unos 2.000 km, donde vuelan la mayoría de satélites y la EEI.') },
    { t: 'TLE',
      n: (l) => window.IntMapLang.t(l, 'Two-line element set', '2行軌道要素', 'Zweizeiliger Bahnelementsatz', 'Двухстрочный набор элементов орбиты', 'Conjunto de elementos de dos líneas'),
      d: (l) => window.IntMapLang.t(l, 'The two lines of numbers that describe a satellite orbit at one moment in time.', 'ある時点の衛星軌道を表す2行の数値データ。', 'Die zwei Zahlenzeilen, die die Bahn eines Satelliten zu einem Zeitpunkt beschreiben.', 'Две строки чисел, описывающие орбиту спутника на определённый момент.', 'Las dos líneas de números que describen la órbita de un satélite en un instante dado.') },
    { t: 'NATO',
      n: (l) => window.IntMapLang.t(l, 'North Atlantic Treaty Organization', '北大西洋条約機構', 'Nordatlantikpakt-Organisation', 'Организация Североатлантического договора', 'Organización del Tratado del Atlántico Norte'),
      d: (l) => window.IntMapLang.t(l, 'The military alliance whose Article 5 treats an attack on one member as an attack on all.', '第5条により、加盟国1国への攻撃を全体への攻撃とみなす軍事同盟。', 'Das Militärbündnis, dessen Artikel 5 einen Angriff auf ein Mitglied als Angriff auf alle wertet.', 'Военный союз, в котором статья 5 считает нападение на одного члена нападением на всех.', 'La alianza militar cuyo artículo 5 considera un ataque a un miembro como un ataque a todos.') },
  ];

  const GLOSS_BY_TERM = (() => { const o = Object.create(null); for (const g of ATLAS_GLOSSARY) o[g.t] = g; return o; })();

  /* ── 3. 走査 ────────────────────────────────────────────────────────────────── */

  const RX_ESC = /[.*+?^${}()|[\]\\]/g;
  const esc4rx = (s) => String(s).replace(RX_ESC, '\\$&');
  const byLenDesc = (a, b) => (b.length - a.length) || (a < b ? -1 : a > b ? 1 : 0);

  const UNIT_ALT = Object.keys(UNIT_BY_ALIAS).sort(byLenDesc).map(esc4rx).join('|');
  const TERM_ALT = ATLAS_GLOSSARY.map((g) => g.t).sort(byLenDesc).map(esc4rx).join('|');

  /* 数: 3桁区切りのある形を先に試す。区切りに使われうる文字は全部並べ、意味づけは
     parseQuantityNumber がロケールに訊いて決める（合わなければ注釈しない）。 */
  const NUM = '(?:\\d{1,3}(?:[.,\\u00A0\\u202F\\u2009 ]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)';
  /* ⚠ 先読み・後読みが判定の全部。通貨記号の直後の数（$5m）は量ではないので入口で落とす。 */
  const QTY = '(?<![\\d.,\\u00A0$\\u20AC\\u00A3\\u00A5\\u20B9\\u20A9])[\\u2212-]?' + NUM + '[ \\u00A0\\u202F]?(?:' + UNIT_ALT + ')(?![A-Za-z0-9\\u00B2\\u00B3])';
  const CLOCK = '\\d{1,2}:\\d{2}(?::\\d{2})?';
  const NAMED_Z = '[ \\u00A0]?(?:UTC|GMT)(?:[ \\u00A0]?[+-]\\d{1,2}(?::?\\d{2})?)?';
  const ISO_DT = '\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(?::\\d{2})?(?:Z|[+-]\\d{2}:?\\d{2})(?![A-Za-z0-9])';
  const DATE_CLOCK = '\\d{4}-\\d{2}-\\d{2}[T ]' + CLOCK + NAMED_Z + '(?![A-Za-z0-9])';
  const CLOCK_Z = '(?<![\\d:])' + CLOCK + '(?:' + NAMED_Z + '|Z)(?![A-Za-z0-9])';
  const ZONE_CLOCK = '(?:UTC|GMT)[ \\u00A0]' + CLOCK + '(?![A-Za-z0-9:])';
  const TERM = '(?<![A-Za-z0-9])(?:' + TERM_ALT + ')(?![A-Za-z0-9])';

  const MASTER = new RegExp(DATE_CLOCK + '|' + ISO_DT + '|' + CLOCK_Z + '|' + ZONE_CLOCK + '|' + TERM + '|' + QTY, 'g');
  const RX_TIME = new RegExp('^(?:(\\d{4})-(\\d{2})-(\\d{2})[T ])?(\\d{1,2}):(\\d{2})(?::(\\d{2}))?[ \\u00A0]?(?:(Z)|(?:UTC|GMT)(?:[ \\u00A0]?([+-])(\\d{1,2})(?::?(\\d{2}))?)?)$');
  const RX_ZONE_FIRST = new RegExp('^(?:UTC|GMT)[ \\u00A0](\\d{1,2}):(\\d{2})(?::(\\d{2}))?$');
  const RX_ISO_OFF = new RegExp('^(\\d{4})-(\\d{2})-(\\d{2})[T ](\\d{2}):(\\d{2})(?::(\\d{2}))?(?:(Z)|([+-])(\\d{2}):?(\\d{2}))$');
  const RX_QTY = new RegExp('^([\u2212-]?' + NUM + ')[ \u00A0\u202F]?(' + UNIT_ALT + ')$');

  /** HTML 属性値として安全にする（mdMini の esc と同じ4文字）。 */
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** 注釈1つ分の span。`kind` は q（量）/ t（時刻）/ a（略語）。 */
  function span(kind, text, note, sub) {
    return '<span class="atl-an atl-an-' + kind + '" data-atl-note="' + escAttr(note) + '"'
      + (sub ? (' data-atl-sub="' + escAttr(sub) + '"') : '') + '>' + text + '</span>';
  }

  /** 走査の設定を1つ作る。`seen` は「略語は最初の1回だけ注釈する」ための記憶。 */
  function annotateOptions(o) {
    const opt = o || {};
    const lang = opt.lang || 'en';
    let loc = 'en-US';
    try { if (window.IntMapLang && window.IntMapLang.locale) loc = window.IntMapLang.locale(lang, 'en-US'); } catch (_) { loc = 'en-US'; }
    const tz = (opt.tz && opt.tz !== 'auto') ? opt.tz : null;
    const now = (opt.now instanceof Date && !isNaN(opt.now.getTime())) ? opt.now : new Date();
    return { lang: lang, loc: loc, tz: tz, now: now, seen: new Set(), seps: numberSeparators(loc) };
  }

  /** ロケールの group / decimal 区切り。表ではなく Intl に訊く。 */
  function numberSeparators(loc) {
    let g = ',', d = '.';
    try {
      for (const p of new Intl.NumberFormat(loc).formatToParts(12345.6)) {
        if (p.type === 'group') g = p.value;
        if (p.type === 'decimal') d = p.value;
      }
    } catch (_) { /* 既定のまま */ }
    return { g: g, d: d };
  }

  const SPACEY = new RegExp('[\\s\\u00A0\\u202F\\u2009]');
  const SPACEY_G = new RegExp('[\\s\\u00A0\\u202F\\u2009]', 'g');

  /** 「12,345.6」をロケールの約束どおりに読む。読めない綴りは null（推測しない）。 */
  function parseQuantityNumber(str, seps) {
    let t = String(str == null ? '' : str);
    const neg = /^[-−]/.test(t);
    t = t.replace(/^[+\-−]/, '');
    const G = seps && seps.g ? seps.g : ',';
    const D = seps && seps.d ? seps.d : '.';
    if (SPACEY.test(G)) t = t.replace(SPACEY_G, G);
    let body = t, frac = null;
    const di = D ? t.lastIndexOf(D) : -1;
    if (di >= 0) { body = t.slice(0, di); frac = t.slice(di + 1); if (!/^\d+$/.test(frac)) return null; }
    if (G && body.indexOf(G) >= 0) {
      const parts = body.split(G);
      if (!/^\d{1,3}$/.test(parts[0])) return null;
      for (let i = 1; i < parts.length; i++) if (!/^\d{3}$/.test(parts[i])) return null;
      body = parts.join('');
    }
    if (!/^\d+$/.test(body)) return null;
    const v = Number(body + (frac != null ? ('.' + frac) : ''));
    if (!isFinite(v)) return null;
    return neg ? -v : v;
  }

  function decimalsFor(v, temp) {
    const a = Math.abs(v);
    if (temp) return 1;
    if (a >= 100) return 0;
    if (a >= 10) return 1;
    if (a >= 1) return 2;
    if (a >= 0.1) return 3;
    return 4;
  }

  /** 換算結果の一行。丸めが効いたときだけ「≈」が付く。 */
  function quantityNote(value, unitId, opt) {
    const c = convertQuantity(value, unitId);
    if (!c) return null;
    const d = decimalsFor(c.value, c.temp);
    const p = Math.pow(10, d);
    const r = Math.round(c.value * p) / p;
    const approx = Math.abs(c.value - r) > (Math.abs(c.value) * 1e-12 + 1e-12);
    let num;
    try { num = new Intl.NumberFormat(opt.loc, { maximumFractionDigits: d }).format(c.value); }
    catch (_) { num = String(r); }
    return (approx ? '≈ ' : '') + num + ' ' + c.unit;
  }

  /* ── 時刻 ── */

  /** その瞬間の、そのタイムゾーンの UTC からのずれ（分）。formatToParts に直接訊く。 */
  function offsetMinutesAt(date, tz) {
    try {
      const p = new Intl.DateTimeFormat('en-US', {
        timeZone: tz || undefined, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(date);
      const g = {};
      for (const x of p) if (x.type !== 'literal') g[x.type] = x.value;
      const asUTC = Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour, +g.minute, +g.second);
      return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
    } catch (_) { return null; }
  }

  /** 「14:30 UTC」→ 読者の時間帯での一行。ずれが無ければ null（同じ時刻を二度書かない）。 */
  function timeNote(m, opt) {
    let y = null, mo = null, d = null, hh, mm, ss = 0, offMin = 0;
    let hadDate = false;
    let iso = RX_ISO_OFF.exec(m);
    if (iso) {
      y = +iso[1]; mo = +iso[2]; d = +iso[3]; hh = +iso[4]; mm = +iso[5]; ss = iso[6] ? +iso[6] : 0;
      hadDate = true;
      if (!iso[7]) offMin = (iso[8] === '-' ? -1 : 1) * (+iso[9] * 60 + +iso[10]);
    } else {
      const z = RX_ZONE_FIRST.exec(m);
      if (z) { hh = +z[1]; mm = +z[2]; ss = z[3] ? +z[3] : 0; }
      else {
        const t = RX_TIME.exec(m);
        if (!t) return null;
        if (t[1]) { y = +t[1]; mo = +t[2]; d = +t[3]; hadDate = true; }
        hh = +t[4]; mm = +t[5]; ss = t[6] ? +t[6] : 0;
        if (t[8]) offMin = (t[8] === '-' ? -1 : 1) * (+t[9] * 60 + (t[10] ? +t[10] : 0));
      }
    }
    if (!(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59)) return null;
    const now = opt.now;
    if (y == null) { y = now.getUTCFullYear(); mo = now.getUTCMonth() + 1; d = now.getUTCDate(); }
    const at = new Date(Date.UTC(y, mo - 1, d, hh, mm, ss) - offMin * 60000);
    if (isNaN(at.getTime())) return null;
    const local = offsetMinutesAt(at, opt.tz);
    if (local == null || local === offMin) return null;          /* 同じずれ = 変換する意味が無い */
    let hm = '', zone = '', dateStr = '';
    try {
      const f = new Intl.DateTimeFormat(opt.loc, { timeZone: opt.tz || undefined, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
      for (const p of f.formatToParts(at)) {
        if (p.type === 'hour' || p.type === 'minute') hm += (hm && p.type === 'minute' ? ':' : '') + p.value;
        else if (p.type === 'timeZoneName') zone = p.value;
      }
      dateStr = new Intl.DateTimeFormat(opt.loc, { timeZone: opt.tz || undefined, year: 'numeric', month: 'short', day: 'numeric' }).format(at);
    } catch (_) { return null; }
    if (!hm) return null;
    const localDay = new Date(at.getTime() + local * 60000).getUTCDate();
    const srcDay = new Date(at.getTime() + offMin * 60000).getUTCDate();
    return { note: hm + (zone ? (' ' + zone) : ''), sub: (hadDate || localDay !== srcDay) ? dateStr : '' };
  }

  /* ── 走査の本体 ── */

  /** 1つの（HTML エスケープ済みの）テキスト片に注釈を入れる。タグは含まれない前提。 */
  function annotateAtlasText(text, opt) {
    const s = String(text == null ? '' : text);
    if (!s || !/[0-9A-Z]/.test(s)) return s;
    return s.replace(MASTER, (m) => {
      const g = GLOSS_BY_TERM[m];
      if (g) {
        if (opt.seen.has(m)) return m;
        let n = '', d = '';
        try { n = g.n(opt.lang) || ''; d = g.d(opt.lang) || ''; } catch (_) { return m; }
        if (!n) return m;
        opt.seen.add(m);
        return span('a', m, n, d);
      }
      if (m.indexOf(':') >= 0) {
        let r = null; try { r = timeNote(m, opt); } catch (_) { r = null; }
        return r ? span('t', m, r.note, r.sub) : m;
      }
      const q = RX_QTY.exec(m);
      if (q) {
        const v = parseQuantityNumber(q[1], opt.seps);
        if (v == null) return m;
        const id = unitIdForToken(q[2]);
        if (!id) return m;
        let note = null; try { note = quantityNote(v, id, opt); } catch (_) { note = null; }
        return note ? span('q', m, note, '') : m;
      }
      return m;
    });
  }

  const SKIP_INSIDE = { a: 1, code: 1, pre: 1, button: 1, script: 1, style: 1, textarea: 1, abbr: 1 };

  /** HTML 断片に注釈を入れる。タグの中と、<a>/<code> 等の中身は触らない。 */
  function annotateAtlasHTML(html, opt) {
    const src = String(html == null ? '' : html);
    if (!src) return src;
    let out = '', depth = 0;
    const re = /<[^>]*>|[^<]+/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const chunk = m[0];
      if (chunk.charCodeAt(0) === 60) {
        const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(chunk);
        if (tag && SKIP_INSIDE[tag[2].toLowerCase()]) {
          if (tag[1]) depth = Math.max(0, depth - 1);
          else if (!/\/>\s*$/.test(chunk)) depth++;
        }
        out += chunk;
      } else {
        out += depth > 0 ? chunk : annotateAtlasText(chunk, opt);
      }
    }
    return out;
  }




  /* ── 4. 配線 ───────────────────────────────────────────────────────────── */
  /** ホバー／タップの配線。document 1つに1回だけ、3面すべてに効く。 */
  function wireAtlasAnnotations() {
    try {
      if (typeof document === 'undefined' || typeof window === 'undefined') return;
      if (window.__atlAnnotateWired) return;
      window.__atlAnnotateWired = true;
      let tip = null, cur = null;
      const box = () => {
        if (tip && tip.isConnected) return tip;
        tip = document.createElement('div');
        tip.className = 'atl-antip';
        tip.setAttribute('aria-hidden', 'true');
        document.body.appendChild(tip);
        return tip;
      };
      const hide = () => { cur = null; if (tip) { tip.classList.remove('on'); tip.classList.remove('below'); } };
      const place = (a, t) => {
        t.style.left = '0px'; t.style.top = '0px'; t.classList.remove('below');
        const r = a.getBoundingClientRect(), b = t.getBoundingClientRect();
        let x = r.left + r.width / 2 - b.width / 2;
        x = Math.max(8, Math.min(x, window.innerWidth - b.width - 8));
        let y = r.top - b.height - 8;
        if (y < 8) { y = r.bottom + 8; t.classList.add('below'); }
        t.style.left = Math.round(x) + 'px';
        t.style.top = Math.round(Math.min(y, window.innerHeight - b.height - 8)) + 'px';
      };
      const show = (a) => {
        const note = a.getAttribute('data-atl-note') || '';
        if (!note) return;
        const sub = a.getAttribute('data-atl-sub') || '';
        const t = box();
        t.textContent = '';
        const h = document.createElement('div'); h.className = 'atl-antip-t'; h.textContent = note; t.appendChild(h);
        if (sub) { const dd = document.createElement('div'); dd.className = 'atl-antip-d'; dd.textContent = sub; t.appendChild(dd); }
        cur = a;
        t.classList.add('on');
        place(a, t);
      };
      const hit = (e) => { const n = e.target; return (n && n.closest) ? n.closest('.atl-an') : null; };
      document.addEventListener('pointerover', (e) => {
        try { const a = hit(e); if (!a) { if (cur) hide(); return; } if (a !== cur) show(a); } catch (_) { }
      });
      document.addEventListener('click', (e) => {
        /* ⚠ NOT A TOGGLE. A tap fires pointerover BEFORE click, so the card is already open by the time
           this runs — toggling here would open and shut it in the same tap and touch would never see it.
           Showing again is idempotent; a tap anywhere else is what dismisses it. */
        try { const a = hit(e); if (a) { e.preventDefault(); show(a); } else hide(); } catch (_) { }
      });
      window.addEventListener('scroll', hide, true);
      window.addEventListener('resize', hide);
      document.addEventListener('keydown', (e) => { if (e && e.key === 'Escape') hide(); });
    } catch (_) { /* 注釈が出ないだけ — 返答そのものは何も変わらない */ }
  }

  return {
    ATLAS_UNITS, ATLAS_GLOSSARY, unitIdForToken, convertQuantity,
    annotateOptions, numberSeparators, parseQuantityNumber, quantityNote,
    timeNote, annotateAtlasText, annotateAtlasHTML, wireAtlasAnnotations,
  };
}
