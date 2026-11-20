/* ============================================================================
 *  IntMap · ATLAS — SKILLS: THE DECLARED DATA  (atlas-skills)
 * ----------------------------------------------------------------------------
 *  A SKILL IS A DOCUMENT, NOT A SCRIPT. A capability says WHAT IntMap can do (js/atlas-cap-*.js); a skill
 *  says HOW A KIND OF WORK IS USUALLY CARRIED OUT with those capabilities — which to reach for first,
 *  what each one cannot say, where an honest answer has to stop. It is read when the work calls for it
 *  (find_capability returns the skill's name; `find_capability {query:"skill:<id>"}` reads it, a section
 *  at a time) and it binds nothing: Atlas keeps full authority over what it calls and in what order
 *  (CONSTITUTION.md §5). Nothing here is run, and nothing here is enforced on a turn.
 *
 *  ⚠ WHAT IS WRITTEN HERE AND WHAT IS NOT. Only what a person has to WRITE is declared: the title, the
 *  summary, the words that should find it, and the prose. Everything that can be DERIVED is not:
 *    · which capabilities a skill uses — read out of the prose (`id` in backticks; `id{arg,arg}` when
 *      arguments are named), so the list cannot disagree with the text;
 *    · whether those capabilities exist, are not withdrawn, and take those arguments — js/atlas-skills.js
 *      `audit()` against the live registry and schemas (npm run check:capabilities);
 *    · the section outline and its sizes.
 *  A skill that names a capability that is gone, or an argument its schema does not have, fails the gate.
 *
 *  ⚠ AUTHORED IN en + jp ONLY (CONSTITUTION.md §7). Every skill is written from capabilities and data that
 *  EXIST today — a step that needs something IntMap does not hold says so in "limits" instead of
 *  pretending (AGENTS.md §3-3).
 *
 *  SHAPE:  { id, title:[en,jp], summary:[en,jp], keywords:[[en…],[jp…]],
 *            sections:[ { id, title:[en,jp], body:[en,jp] } ] }   (two-language data is a tuple: slot 0 en, 1 jp)
 *  The first section is the one a bare read returns; keep every section under ~1,600 characters.
 * ==========================================================================*/

export const ATLAS_SKILLS = [
  /* ───────────────────────────── historical borders ───────────────────────────── */
  {
    id: 'historical-border-comparison',
    title: ['Comparing historical borders', '歴史的国境の比較'],
    summary: ['How to compare where borders ran at two dates, what changed hands, and how far each line can be trusted.', '二つの時点で国境がどこを通っていたかを比べ、何が誰の手に渡ったか、各線をどこまで信じてよいかを示す進め方。'],
    keywords: [['historical borders', 'border change', 'territory change', 'then and now', 'compare borders', 'polity', 'empire', 'frontier', 'annexation', 'partition'], ['歴史的国境', '国境の変遷', '国境比較', '領土変更', '領土の変化', '帝国', '併合', '分割', '当時と今', '国境線の根拠']],
    sections: [
      {
        id: 'overview',
        title: ['When and what', 'いつ使うか・何がわかるか'],
        body: ['Use this for questions such as "how did the borders of X change between 1914 and 1923", "what did Y lose in 1945", "is this line really where the map draws it".\n'
            + 'IntMap draws borders from a stack of records, newest and most exact first: CShapes by the day from 1886, then OpenHistoricalMap, Cliopatria and the era sheets before that, with IntMap\'s own reconstructions where nothing else exists. The record names itself, and every line can say who stated its dates. That is what makes a comparison answerable with evidence rather than memory.\n'
            + 'Years are astronomical in arguments (0 is 1 BC). A date can be a year or "YYYY-MM-DD".', '「1914年から1923年にXの国境はどう変わったか」「1945年にYは何を失ったか」「この線は本当に地図どおりか」といった問いに使う。\n'
            + 'IntMap は国境を、新しく正確な記録から順に重ねて描く。1886年以降は日単位の CShapes、その前は OpenHistoricalMap・Cliopatria・時代ごとのシート、どれも無い所は IntMap 自身の復元。どの記録かは自分で名乗り、各線は誰がその日付を述べたかを言える。だから比較は記憶ではなく根拠で答えられる。\n'
            + '引数の年は天文学的年（0 は紀元前1年）。日付は年か "YYYY-MM-DD"。'],
      },
      {
        id: 'procedure',
        title: ['A way to proceed', '進め方の一例'],
        body: ['1. Ask what the map can state at each instant first: `time.coverage{year,date}` lists every layer as drawn, drawn from another date, or not drawn, with the reason. It moves nothing.\n'
            + '2. For "what changed hands": `time.territoryChange{from,to,place}` asks the border record at both instants which polity holds each cell of a lattice over the region, draws the land whose holder differs and lists giver to receiver with km2. `estimateOnly` returns the figures without drawing.\n'
            + '3. For "show me both": `time.thenNow{then,now,split,layer}` puts two instants side by side; `time.compare{year,date,layer}` sets the comparison window\'s own clock.\n'
            + '4. For the events behind it: `time.changes{from,to,place,n}` lists polities that appear, end or change area, and the events of the period by importance.\n'
            + '5. For one state\'s life: `time.polityArc{name,year}`.\n'
            + '6. For one disputed line: `time.borderSource{place,lng,lat,radiusKm}` returns each record that draws it, its identifiers, who stated each date, the precision and the licence.\n'
            + 'Take only the steps the question needs; the order is a suggestion.', '1. まず各時点で地図が何を述べられるか: `time.coverage{year,date}` が全レイヤーを「描ける／別の日付から描く／描けない」と理由つきで返す。何も動かさない。\n'
            + '2. 「何が誰の手に渡ったか」: `time.territoryChange{from,to,place}` が二つの時点の国境記録に、領域上の格子の各セルがどの政体のものかを問い、持ち主が違う土地を描き、giver→receiver と km2 を挙げる。`estimateOnly` なら描かずに数値だけ。\n'
            + '3. 「両方見せて」: `time.thenNow{then,now,split,layer}` が二つの時点を並べる。`time.compare{year,date,layer}` は比較窓だけの時計を設定する。\n'
            + '4. 背景の出来事: `time.changes{from,to,place,n}` が現れた・終わった・面積が変わった政体と、期間内の出来事を重要度順に返す。\n'
            + '5. ひとつの国家の生涯: `time.polityArc{name,year}`。\n'
            + '6. 争いのある線ひとつ: `time.borderSource{place,lng,lat,radiusKm}` がその線を描く各記録・識別子・各日付を述べた者・精度・ライセンスを返す。\n'
            + '問いに要る手順だけを取る。順序は提案にすぎない。'],
      },
      {
        id: 'limits',
        title: ['Limits and honesty', '限界と誠実さ'],
        body: ['- "Not drawn" means the source states nothing for that instant; it does not mean the place did not exist.\n'
            + '- A date can be upstream-verbatim, year-only, or derived. Say which when a conclusion hangs on a day. `time.borderSource` says.\n'
            + '- Name the record when quoting a figure; two records can disagree about the same line, and a disputed or overlapping area is not a mistake to be smoothed over.\n'
            + '- `research.historicalMap{era}` is a faction/alliance colouring on MODERN borders, approximate by construction. It is not a border map: do not use it to answer where a line ran.\n'
            + '- Areas are the record\'s outline at its stated precision. Do not give a boundary to the metre or an area to the km2 beyond what the result states.\n'
            + '- If a period has no record in the result, say so and stop; do not fill it from memory as if the map had said it.', '- 「描けない」は、その時点について出典が何も述べていないという意味で、その土地が無かったという意味ではない。\n'
            + '- 日付は、上流の原文そのまま・年のみ・導出のどれかである。結論が日にちに懸かるときはどれかを言う。`time.borderSource` が教える。\n'
            + '- 数値を引くときは記録の名前を言う。同じ線について記録同士が食い違うことがあり、係争や重複は均して消すべき誤りではない。\n'
            + '- `research.historicalMap{era}` は現代の国境の上に勢力を塗る近似で、国境図ではない。線がどこを通ったかの答えには使わない。\n'
            + '- 面積は記録の輪郭が述べる精度のもの。結果が述べる以上の精度で境界線や面積を言わない。\n'
            + '- 結果に記録の無い時期は、無いと言って止める。記憶で埋めて地図が述べたかのように言わない。'],
      },
    ],
  },

  /* ───────────────────────────── satellite change detection ───────────────────────────── */
  {
    id: 'satellite-change-detection',
    title: ['Satellite change detection', '衛星画像の変化検出'],
    summary: ['How to compare dated satellite views of one place and report what visibly changed without over-claiming.', '一か所の日付つき衛星画像を比べ、見えて変わったことだけを過不足なく報告する進め方。'],
    keywords: [['satellite', 'change detection', 'before and after', 'construction', 'land use', 'disaster damage', 'aerial', 'imagery', 'what changed here'], ['衛星画像', '変化検出', '前後比較', '建設', '土地利用', '被害', '災害', 'ここは何が変わった', '日付の比較', '航空写真']],
    sections: [
      {
        id: 'overview',
        title: ['When and what', 'いつ使うか・何がわかるか'],
        body: ['Use this for "what changed here between two dates" about a site, a coast, a construction area or a disaster zone.\n'
            + '`data.satelliteCompare{dateA,dateB,place}` captures the dated satellite view at the two dates and reports the visual changes with both frames shown. It needs the satellite base with a dated provider to be active; the work therefore starts with putting the map in that state, not with the comparison.', '特定の場所・海岸・工事現場・被災地について「二つの日付の間に何が変わったか」を問われたときに使う。\n'
            + '`data.satelliteCompare{dateA,dateB,place}` は二つの日付の衛星画像を取り込み、見て取れる変化を両方のフレームとともに報告する。日付つきの提供元の衛星ベースが有効であることが前提なので、比較の前に地図をその状態にする。'],
      },
      {
        id: 'procedure',
        title: ['A way to proceed', '進め方の一例'],
        body: ['1. Put the map on the place at a scale where the change would be visible: `view.flyTo{place,zoom}`.\n'
            + '2. Switch to the satellite base: `view.basemap{mode}` with mode "satellite".\n'
            + '3. Run `data.satelliteCompare{dateA,dateB,place}` with dates the user gave. If they gave none, ask one question with `dialog.ask` rather than guess a period, or pick a span the question itself implies (an event date and a date after it).\n'
            + '4. Describe only what both frames show: new or removed structures, changed shorelines, cleared or flooded land, burned areas, vessels at a quay. Name where in the frame.\n'
            + '5. For land use over the years rather than two photographs, `map.landCover{year}` draws the land-cover classes (call it with no arguments to list them).\n'
            + '6. If a date has no imagery, say so, and compare the nearest dates the result reports.', '1. 変化が見える縮尺で場所へ移る: `view.flyTo{place,zoom}`。\n'
            + '2. 衛星ベースへ切り替える: `view.basemap{mode}` の mode は "satellite"。\n'
            + '3. 利用者が示した日付で `data.satelliteCompare{dateA,dateB,place}` を走らせる。日付が無ければ期間を推測せず `dialog.ask` で1問だけ訊くか、問いが含意する期間（出来事の日とその後の日）を使う。\n'
            + '4. 両方のフレームが示すことだけを述べる: 新設・撤去された構造物、海岸線の変化、更地化・冠水、焼失域、岸壁の船。フレームのどこかを添える。\n'
            + '5. 2枚の写真ではなく年ごとの土地利用なら、`map.landCover{year}` が被覆クラスを描く（引数なしで一覧）。\n'
            + '6. ある日付の画像が無いときは、そう言って、結果が報告する最も近い日付で比べる。'],
      },
      {
        id: 'limits',
        title: ['Limits and honesty', '限界と誠実さ'],
        body: ['- A visual comparison is not a measurement. Do not give counts, areas or damage grades the frames do not support; say "visibly" and describe.\n'
            + '- Clouds, sun angle, season and resolution differ between dates. A difference in colour is not a change on the ground unless the shapes change too.\n'
            + '- The cause is not in the image. Say what changed; give a cause only from a source you can name (news, a report), and mark it as that source\'s claim.\n'
            + '- The comparison depends on the provider having dated frames at that place; if the result says it does not, stop and report that.', '- 目視の比較は計測ではない。フレームが支えない件数・面積・被害等級を言わない。「見たところ」と書き、描写する。\n'
            + '- 雲・太陽高度・季節・解像度は日付ごとに違う。色の差は、形も変わらない限り地上の変化ではない。\n'
            + '- 原因は画像に写っていない。何が変わったかを述べ、原因は名指しできる出典（報道・報告）からだけ、その出典の主張として書く。\n'
            + '- 比較は、その場所に提供元の日付つきフレームがあることに依る。結果が無いと言うなら、そこで止めて報告する。'],
      },
    ],
  },

  /* ───────────────────────────── industrial site analysis ───────────────────────────── */
  {
    id: 'industrial-site-screening',
    title: ['Industrial site screening', '産業立地の一次分析'],
    summary: ['How to screen candidate regions for a plant or depot from the company atlas, population, travel reach and hazard layers, and where the screening must stop.', '企業アトラス・人口・到達圏・災害レイヤーから工場や拠点の候補地域を絞り込む進め方と、どこで止めるべきか。'],
    keywords: [['industrial location', 'site selection', 'plant location', 'factory', 'cluster', 'supplier', 'where to build', 'catchment', 'labour pool', 'siting'], ['産業立地', '立地分析', '工場立地', '工場', '集積', 'サプライヤー', '拠点', '候補地', '商圏', '労働力']],
    sections: [
      {
        id: 'overview',
        title: ['When and what', 'いつ使うか・何がわかるか'],
        body: ['Use this for "where would a semiconductor plant fit", "who already operates factories around here", "compare these two regions for a distribution centre".\n'
            + 'What IntMap can state: the published sites of the companies in its company atlas by country, kind (factory, R&D, logistics...) and sector; who is connected to whom across borders; population in an area; the area reachable in a given travel time; the hazard and environment layers at a point. That is a SCREENING of candidates, not a siting decision.', '「半導体工場はどこに合うか」「この周辺で工場を持つ企業は」「物流拠点としてこの二地域を比べて」といった問いに使う。\n'
            + 'IntMap が述べられるのは、企業アトラスにある企業の公表拠点（国・種別＝工場／研究開発／物流…・業種別）、国境を越えた企業間のつながり、区域の人口、一定の移動時間で届く範囲、地点の災害・環境レイヤー。これは候補の一次スクリーニングであって、立地の決定ではない。'],
      },
      {
        id: 'procedure',
        title: ['A way to proceed', '進め方の一例'],
        body: ['1. Who is already there: `data.companySites{action,country,groups,sectors,inView}` with action "query" counts by company, kind and type; "show" also draws them. Narrow with groups ["factory"] and a sector key.\n'
            + '2. Cross-border structure: `data.companyTies{country,direction,groups,sectors}` shows whose companies have sites in a country (direction "in") or where a country\'s companies build abroad ("out").\n'
            + '3. Labour pool and market: draw the catchment with `map.radius{place,km}`, then `data.populationIn{target,place,radiusKm,year}` for the people in it.\n'
            + '4. Real reach: `routing.isochrone{place,minutes,mode}` gives the area reachable in a travel time, which is not a circle.\n'
            + '5. Hazards at each candidate: `data.layerValues{place,layer}` reads the real value of a displayed layer at a point; `sim.tsunami` and the other simulations can be run where a hazard matters.\n'
            + '6. Trade exposure of the country: `data.worldFlows{country,kind,direction}` with kind "trade".\n'
            + 'Do the same steps for each candidate so the comparison is like for like, and give the figures side by side.', '1. すでに誰がいるか: `data.companySites{action,country,groups,sectors,inView}` の action "query" は企業・種別・タイプ別に数え、"show" は地図にも描く。groups ["factory"] と業種キーで絞る。\n'
            + '2. 国をまたぐ構造: `data.companyTies{country,direction,groups,sectors}` は、その国に拠点を持つのはどこの企業か（direction "in"）、その国の企業が海外のどこに作るか（"out"）を示す。\n'
            + '3. 労働力と市場: `map.radius{place,km}` で商圏を描き、`data.populationIn{target,place,radiusKm,year}` でその中の人口を出す。\n'
            + '4. 実際の到達範囲: `routing.isochrone{place,minutes,mode}` が円ではない、移動時間で届く範囲を返す。\n'
            + '5. 各候補の災害: `data.layerValues{place,layer}` が表示中レイヤーの地点の実値を読む。災害が効くなら `sim.tsunami` などのシミュレーションも走らせる。\n'
            + '6. 国の貿易依存: `data.worldFlows{country,kind,direction}` の kind "trade"。\n'
            + '候補ごとに同じ手順を踏み、条件をそろえて数値を並べる。'],
      },
      {
        id: 'limits',
        title: ['Limits and honesty', '限界と誠実さ'],
        body: ['- The company atlas holds the sites companies have PUBLISHED. An empty result means "none published in the atlas", not "none exist".\n'
            + '- IntMap has no land prices, zoning, power or water capacity, wages, incentives or permits. Do not infer them; list them as what the user must check before any decision.\n'
            + '- Population is a count in an area, not a labour market: it says nothing of skills or commuting patterns.\n'
            + '- Ranking candidates needs weights the user must choose. Present each factor with its figure and, if you rank, say which weights you used and that they are yours.', '- 企業アトラスが持つのは企業が公表した拠点。結果が空なのは「アトラスに公表がない」であって「存在しない」ではない。\n'
            + '- IntMap には地価・用途地域・電力や水の容量・賃金・優遇措置・許認可は無い。推測せず、決定の前に利用者が確かめるべきものとして挙げる。\n'
            + '- 人口は区域の頭数であって労働市場ではない。技能や通勤の実態は述べない。\n'
            + '- 候補の順位づけには利用者が選ぶべき重みが要る。要因ごとに数値を示し、順位をつけるなら使った重みと、それが自分の選択であることを言う。'],
      },
    ],
  },

  /* ───────────────────────────── port logistics risk ───────────────────────────── */
  {
    id: 'port-logistics-risk',
    title: ['Comparing port and logistics risk', '港湾・物流リスクの比較'],
    summary: ['How to compare ports or trade corridors on exposure to hazards, disruption, sanctions and dependence, using only what IntMap holds.', '港や物流回廊を、災害・途絶・制裁・依存度の面から、IntMap が持つ情報だけで比べる進め方。'],
    keywords: [['port', 'logistics', 'supply chain', 'shipping', 'trade route', 'chokepoint', 'disruption', 'risk comparison', 'container', 'corridor'], ['港湾', '物流', 'サプライチェーン', '海運', '貿易ルート', 'チョークポイント', '途絶', 'リスク比較', 'コンテナ', '回廊']],
    sections: [
      {
        id: 'overview',
        title: ['When and what', 'いつ使うか・何がわかるか'],
        body: ['Use this for "compare the risk of routing through port A or B", "what is exposed if this strait closes", "which country is this supply chain most dependent on".\n'
            + 'IntMap can state, each with its own source and date: how one country is connected by trade, cables and flights; hazards at a point (weather, tsunami and quake simulation, layers); recent events and internet outages; the sanctions lists of the US, UK and EU; border control posts and their stated hours; routes between places; and a live ships layer. It does not hold freight rates, berth congestion history, or insurer assessments.', '「A港とB港のどちらを通すほうが危険か」「この海峡が閉じたら何が影響を受けるか」「このサプライチェーンはどの国にいちばん依存しているか」といった問いに使う。\n'
            + 'IntMap が出典と日付つきで述べられるのは、一国の貿易・海底ケーブル・航空路でのつながり、地点の災害（天気・津波や地震のシミュレーション・レイヤー）、直近の出来事とインターネット障害、米英EUの制裁リスト、国境検問所とその公表時間、地点間の経路、そして船舶の実況レイヤー。運賃・バース混雑の履歴・保険会社の評価は持たない。'],
      },
      {
        id: 'procedure',
        title: ['A way to proceed', '進め方の一例'],
        body: ['1. Dependence: `data.worldFlows{country,kind,direction,year,top}` with kind "trade" gives the partners and their shares for exports or imports; "cables" and "flights" give the other connections.\n'
            + '2. Physical hazard at each port: `data.weather{place}` for current conditions and the five-day forecast; `sim.tsunami{place,magnitude}` for a stated scenario; `data.layerValues{place,layer}` for a displayed layer at the port.\n'
            + '3. What is happening: `research.events{place,hours,n}` groups recent news into events; `news.outages{days,n}` joins internet outages to the news.\n'
            + '4. Legal exposure: `data.sanctions{country,authority,top}` per authority (US, UK, EU).\n'
            + '5. Land legs: `routing.route{from,to}` between port and destination; `data.borderCrossings{lng,lat}` for the nearest control posts and whether they are open at the clock instant.\n'
            + '6. A live look at traffic: switch the ships layer on with `layers.toggle` and look at the port on the map; it is a snapshot of now.\n'
            + 'Do the same set for each port or corridor and present the results side by side, each figure with its source and date.', '1. 依存度: `data.worldFlows{country,kind,direction,year,top}` の kind "trade" が輸出または輸入の相手国と比率を返す。"cables" と "flights" はほかのつながり。\n'
            + '2. 各港の自然災害: `data.weather{place}` が現況と5日予報、`sim.tsunami{place,magnitude}` が指定した想定のシミュレーション、`data.layerValues{place,layer}` が表示中レイヤーの港での値。\n'
            + '3. いま起きていること: `research.events{place,hours,n}` が直近の記事を出来事にまとめ、`news.outages{days,n}` がインターネット障害と報道を合わせる。\n'
            + '4. 法的な露出: `data.sanctions{country,authority,top}` を当局（US・UK・EU）ごとに。\n'
            + '5. 陸の区間: `routing.route{from,to}` で港から目的地まで、`data.borderCrossings{lng,lat}` で最寄りの検問所と、時計の時点で開いているか。\n'
            + '6. 交通の実況: `layers.toggle` で船舶レイヤーをつけ、港を地図で見る。いまの断面であって履歴ではない。\n'
            + '港・回廊ごとに同じ組を行い、出典と日付を添えた数値を並べて示す。'],
      },
      {
        id: 'limits',
        title: ['Limits and honesty', '限界と誠実さ'],
        body: ['- No result here is a probability of disruption. A hazard value is a value; a simulation is a stated scenario; say which.\n'
            + '- The ships layer shows traffic now. Do not infer congestion trends, dwell times or rates from it.\n'
            + '- A sanctions list entry is a designated party, not a statement about a port\'s legality; say what each list says and no more.\n'
            + '- Trade shares describe a country, not a port. If the question is about a port, say that the dependence figures are national.\n'
            + '- What IntMap does not hold (rates, insurance, berth data, customs delays) goes into the answer as a named gap, together with where such data would have to come from.', '- ここにある結果はどれも途絶の確率ではない。災害の値は値、シミュレーションは述べた想定であり、どちらかを言う。\n'
            + '- 船舶レイヤーはいまの交通で、そこから混雑の傾向・滞留時間・運賃は推し量らない。\n'
            + '- 制裁リストの項目は指定された当事者であって、港の適法性についての言明ではない。各リストが述べることだけを言う。\n'
            + '- 貿易の比率は国についてのもので港のものではない。港の問いなら、依存度は国単位だと言う。\n'
            + '- IntMap が持たないもの（運賃・保険・バース・通関遅延）は、名指しの空白として、そのデータの出どころとともに回答に入れる。'],
      },
    ],
  },
];
