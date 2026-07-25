/* ============================================================================
 *  IntMap · Company dataset + live market capitalisation — IntMapCompanies  (#R163)
 * ----------------------------------------------------------------------------
 *  The curated company table plus the keyless Yahoo price feed used to compute market caps
 *  (share counts x live price, with the sanity guard) and the historical price series.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R163). The values it used
 *  to inherit from that closure are now passed in explicitly — see Architecture.md §3.1.
 * 
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.companies=function(map,HOST){
  return (function(){
    /* rows: [ ticker, name, nameJP(''=use EN), countryISO3, sectorKey, domain, founded, employees, revenueB, netIncomeB,
       sharesOutB (0 = non-US → use snapshot, no live calc), marketCapSnapshotB ]. Money & shares in BILLIONS. */
    const RAW=[
      ['AAPL','Apple','アップル','USA','tech','apple.com',1976,164000,391,94,15.1,3400],
      ['MSFT','Microsoft','マイクロソフト','USA','software','microsoft.com',1975,228000,245,88,7.43,3300],
      ['NVDA','NVIDIA','エヌビディア','USA','semi','nvidia.com',1993,29600,61,30,24.5,3200],
      ['GOOGL','Alphabet (Google)','アルファベット','USA','internet','abc.xyz',1998,182000,328,74,12.2,2300],
      ['AMZN','Amazon','アマゾン','USA','ecommerce','amazon.com',1994,1551000,620,37,10.5,2200],
      ['META','Meta Platforms','メタ','USA','internet','meta.com',2004,67000,156,62,2.54,1400],
      ['2222.SR','Saudi Aramco','サウジアラムコ','SAU','energy','aramco.com',1933,73000,480,105,0,1750],
      ['AVGO','Broadcom','ブロードコム','USA','semi','broadcom.com',1991,20000,51,14,4.68,800],
      ['TSLA','Tesla','テスラ','USA','auto','tesla.com',2003,140000,97,15,3.19,800],
      ['TSM','TSMC','TSMC','TWN','semi','tsmc.com',1987,76000,90,36,5.186,2066],   /* (#R142) live via US ADR: 25.93B ordinary ÷ 5 (ADR ratio) = 5.186B ADS → ADS price × ADS count = real USD market cap */
      ['LLY','Eli Lilly','イーライリリー','USA','pharma','lilly.com',1876,43000,40,10,0.95,780],
      ['JPM','JPMorgan Chase','JPモルガン','USA','bank','jpmorganchase.com',2000,309000,158,50,2.83,620],
      ['WMT','Walmart','ウォルマート','USA','retail','walmart.com',1962,2100000,665,16,8.03,600],
      ['V','Visa','ビザ','USA','payments','visa.com',1958,28800,36,20,1.95,560],
      ['UNH','UnitedHealth Group','ユナイテッドヘルス','USA','health','unitedhealthgroup.com',1977,440000,372,14,0.92,500],
      ['XOM','Exxon Mobil','エクソンモービル','USA','energy','exxonmobil.com',1999,61000,340,36,4.42,500],
      ['MA','Mastercard','マスターカード','USA','payments','mastercard.com',1966,33400,28,12,0.92,450],
      ['ORCL','Oracle','オラクル','USA','software','oracle.com',1977,159000,53,10,2.77,430],
      ['COST','Costco','コストコ','USA','retail','costco.com',1983,316000,254,7,0.443,410],
      ['HD','Home Depot','ホームデポ','USA','retail','homedepot.com',1978,463000,153,15,0.99,400],
      ['PG','Procter & Gamble','P&G','USA','staples','pg.com',1837,108000,84,15,2.35,390],
      ['NFLX','Netflix','ネットフリックス','USA','media','netflix.com',1997,13000,39,8,0.43,380],
      ['JNJ','Johnson & Johnson','J&J','USA','pharma','jnj.com',1886,138000,85,14,2.41,370],
      ['NVO','Novo Nordisk','ノボ・ノルディスク','DNK','pharma','novonordisk.com',1923,64000,42,14,4.4346,220],
      ['MC.PA','LVMH','LVMH','FRA','consumer','lvmh.com',1987,213000,90,14,0,330],
      ['ABBV','AbbVie','アッヴィ','USA','pharma','abbvie.com',2013,50000,54,5,1.77,330],
      ['BAC','Bank of America','バンク・オブ・アメリカ','USA','bank','bankofamerica.com',1998,213000,100,27,7.6,320],
      ['ASML','ASML','ASML','NLD','semi','asml.com',1984,42000,30,8,0,320],
      ['CRM','Salesforce','セールスフォース','USA','software','salesforce.com',1999,72000,38,6,0.96,300],
      ['KO','Coca-Cola','コカ・コーラ','USA','staples','coca-cola.com',1892,79100,46,10,4.31,280],
      ['SAP','SAP','SAP','DEU','software','sap.com',1972,108000,34,6,1.7682,280],
      ['CVX','Chevron','シェブロン','USA','energy','chevron.com',1879,45600,197,21,1.8,270],
      ['TM','Toyota Motor','トヨタ自動車','JPN','auto','toyota.com',1937,380000,300,32,1.5124,270],
      ['MRK','Merck','メルク','USA','pharma','merck.com',1891,71000,64,17,2.53,250],
      ['NSRGY','Nestlé','ネスレ','CHE','staples','nestle.com',1866,275000,100,12,2.3735,250],
      ['TMUS','T-Mobile US','Tモバイル','USA','telecom','t-mobile.com',1994,71000,81,11,1.16,250],
      ['WFC','Wells Fargo','ウェルズ・ファーゴ','USA','bank','wellsfargo.com',1852,220000,82,19,3.35,240],
      ['AMD','AMD','AMD','USA','semi','amd.com',1969,26000,23,2,1.62,240],
      ['ROG.SW','Roche','ロシュ','CHE','pharma','roche.com',1896,103000,65,12,0,240],
      ['PEP','PepsiCo','ペプシコ','USA','staples','pepsico.com',1898,318000,92,9,1.37,230],
      ['AZN','AstraZeneca','アストラゼネカ','GBR','pharma','astrazeneca.com',1999,89900,46,7,1.398,230],
      ['OR.PA','L\'Oréal','ロレアル','FRA','consumer','loreal.com',1909,90000,45,7,0,230],
      ['ADBE','Adobe','アドビ','USA','software','adobe.com',1982,30000,21,5,0.44,220],
      ['NVS','Novartis','ノバルティス','CHE','pharma','novartis.com',1996,76000,48,12,1.471,220],
      ['SHEL','Shell','シェル','GBR','energy','shell.com',1907,96000,290,20,2.5522,220],
      ['LIN','Linde','リンデ','USA','materials','linde.com',1879,66000,33,6,0.48,210],
      ['MCD','McDonald\'s','マクドナルド','USA','consumer','mcdonalds.com',1955,150000,26,8,0.716,210],
      ['CSCO','Cisco','シスコ','USA','tech','cisco.com',1984,84900,54,10,3.97,200],
      ['ACN','Accenture','アクセンチュア','IRL','tech','accenture.com',1989,733000,65,7,0.626,220],
      ['IBM','IBM','IBM','USA','tech','ibm.com',1911,282000,62,7,0.92,200],
      ['ABT','Abbott','アボット','USA','health','abbott.com',1888,114000,40,5,1.74,200],
      ['GE','GE Aerospace','GEエアロスペース','USA','aerospace','geaerospace.com',1892,52000,35,6,1.07,200],
      ['AXP','American Express','アメックス','USA','finance','americanexpress.com',1850,74600,60,10,0.71,200],
      ['TMO','Thermo Fisher','サーモフィッシャー','USA','health','thermofisher.com',1956,125000,43,6,0.383,200],
      ['DIS','Walt Disney','ディズニー','USA','media','disney.com',1923,225000,89,5,1.81,190],
      ['QCOM','Qualcomm','クアルコム','USA','semi','qualcomm.com',1985,49000,39,10,1.11,190],
      ['NOW','ServiceNow','サービスナウ','USA','software','servicenow.com',2004,26000,11,1,0.205,190],
      ['MS','Morgan Stanley','モルガン・スタンレー','USA','bank','morganstanley.com',1935,80000,54,10,1.61,180],
      ['TXN','Texas Instruments','テキサス・インスツルメンツ','USA','semi','ti.com',1930,34000,16,6,0.91,180],
      ['PM','Philip Morris Intl','フィリップモリス','USA','staples','pmi.com',1847,79000,35,7,1.56,180],
      ['DHR','Danaher','ダナハー','USA','health','danaher.com',1969,63000,24,4,0.72,180],
      ['9988.HK','Alibaba','アリババ','CHN','ecommerce','alibaba.com',1999,200000,130,10,0,220],
      ['0700.HK','Tencent','テンセント','CHN','internet','tencent.com',1998,105000,90,22,0,450],
      ['005930.KS','Samsung Electronics','サムスン電子','KOR','tech','samsung.com',1969,267000,200,15,0,370],
      ['GS','Goldman Sachs','ゴールドマン・サックス','USA','bank','goldmansachs.com',1869,46000,46,11,0.32,170],
      ['CAT','Caterpillar','キャタピラー','USA','industrial','caterpillar.com',1925,113000,67,10,0.48,170],
      ['ISRG','Intuitive Surgical','インテュイティブ','USA','health','intuitive.com',1995,14000,8,2,0.356,180],
      ['VZ','Verizon','ベライゾン','USA','telecom','verizon.com',1983,105000,134,11,4.21,170],
      ['INTU','Intuit','インテュイット','USA','software','intuit.com',1983,18800,16,3,0.28,175],
      ['RY','Royal Bank of Canada','カナダ・ロイヤル銀行','CAN','bank','rbc.com',1864,94000,48,12,0.8081,170],
      ['T','AT&T','AT&T','USA','telecom','att.com',1983,141000,122,14,7.17,160],
      ['RTX','RTX','RTX','USA','aerospace','rtx.com',1922,185000,69,5,1.33,160],
      ['BKNG','Booking Holdings','ブッキング','USA','internet','booking.com',1996,21600,22,6,0.033,160],
      ['HSBC','HSBC','HSBC','GBR','bank','hsbc.com',1865,220000,66,22,1.616,160],
      ['PFE','Pfizer','ファイザー','USA','pharma','pfizer.com',1849,88000,58,8,5.67,160],
      ['SIE.DE','Siemens','シーメンス','DEU','industrial','siemens.com',1847,320000,82,9,0,160],
      ['NEE','NextEra Energy','ネクステラ','USA','energy','nexteraenergy.com',1925,15100,25,7,2.06,150],
      ['SPGI','S&P Global','S&Pグローバル','USA','finance','spglobal.com',1917,40000,14,4,0.31,150],
      ['AMGN','Amgen','アムジェン','USA','pharma','amgen.com',1980,26000,33,7,0.537,150],
      ['BLK','BlackRock','ブラックロック','USA','finance','blackrock.com',1988,19800,20,6,0.149,150],
      ['UBER','Uber','ウーバー','USA','tech','uber.com',2009,31100,40,2,2.09,150],
      ['TTE','TotalEnergies','トタルエナジーズ','FRA','energy','totalenergies.com',1924,102000,210,18,1.8564,150],
      ['HON','Honeywell','ハネウェル','USA','industrial','honeywell.com',1906,97000,37,6,0.65,140],
      ['UNP','Union Pacific','ユニオン・パシフィック','USA','industrial','up.com',1862,32800,24,6,0.606,145],
      ['LOW','Lowe\'s','ロウズ','USA','retail','lowes.com',1946,285000,83,7,0.57,140],
      ['SYK','Stryker','ストライカー','USA','health','stryker.com',1941,52000,22,3,0.382,140],
      ['BHP','BHP Group','BHP','AUS','materials','bhp.com',1885,80000,55,13,1.7393,140],
      ['SPOT','Spotify','スポティファイ','SWE','media','spotify.com',2006,7000,16,0.6,0.203,120],
      ['SHOP','Shopify','ショッピファイ','CAN','ecommerce','shopify.com',2006,8300,8,1,1.29,130],
      ['BX','Blackstone','ブラックストーン','USA','finance','blackstone.com',1985,4700,11,2,0.72,140],
      ['NKE','Nike','ナイキ','USA','consumer','nike.com',1964,79400,51,6,1.49,120],
      ['TJX','TJX Companies','TJX','USA','retail','tjx.com',1956,349000,54,4,1.12,135],
      ['COP','ConocoPhillips','コノコフィリップス','USA','energy','conocophillips.com',1875,10000,58,9,1.2,130],
      ['C','Citigroup','シティグループ','USA','bank','citigroup.com',1998,229000,80,13,1.9,130],
      ['SCHW','Charles Schwab','チャールズ・シュワブ','USA','finance','schwab.com',1971,32000,19,5,1.82,130],
      ['ANET','Arista Networks','アリスタ','USA','tech','arista.com',2004,4400,6,2,1.26,120],
      ['BSX','Boston Scientific','ボストン・サイエンティフィック','USA','health','bostonscientific.com',1979,48000,15,2,1.47,130],
      ['UL','Unilever','ユニリーバ','GBR','staples','unilever.com',1929,128000,64,7,2.4194,150],
      ['SONY','Sony','ソニー','JPN','tech','sony.com',1946,113000,88,8,5.6738,120],
      ['ADP','ADP','ADP','USA','tech','adp.com',1949,63000,19,4,0.407,120],
      ['MU','Micron','マイクロン','USA','semi','micron.com',1978,48000,25,1,1.11,120],
      ['PANW','Palo Alto Networks','パロアルト','USA','software','paloaltonetworks.com',2005,15000,8,2,0.324,120],
      ['VRTX','Vertex Pharma','バーテックス','USA','pharma','vrtx.com',1989,5000,10,3,0.257,120],
      ['GILD','Gilead Sciences','ギリアド','USA','pharma','gilead.com',1987,18000,27,5,1.25,110],
      ['MDT','Medtronic','メドトロニック','USA','health','medtronic.com',1949,95000,32,4,1.28,110],
      ['LMT','Lockheed Martin','ロッキード・マーティン','USA','aerospace','lockheedmartin.com',1995,122000,71,5,0.235,110],
      ['SBUX','Starbucks','スターバックス','USA','consumer','starbucks.com',1971,381000,36,4,1.13,110],
      ['TD','Toronto-Dominion Bank','TD銀行','CAN','bank','td.com',1855,95000,43,8,0.9129,110],
      ['SNY','Sanofi','サノフィ','FRA','pharma','sanofi.com',1973,91000,45,6,2.9559,130],
      ['BA','Boeing','ボーイング','USA','aerospace','boeing.com',1916,171000,78,-8,0.75,130],
      ['LRCX','Lam Research','ラムリサーチ','USA','semi','lamresearch.com',1980,17200,15,4,1.28,100],
      ['REGN','Regeneron','リジェネロン','USA','pharma','regeneron.com',1988,12000,13,4,0.108,100],
      ['KLAC','KLA','KLA','USA','semi','kla.com',1975,15000,10,3,0.134,90],
      ['SNPS','Synopsys','シノプシス','USA','software','synopsys.com',1986,20000,6,1,0.154,90],
      ['CDNS','Cadence','ケイデンス','USA','software','cadence.com',1988,11000,4,1,0.272,80],
      ['MRVL','Marvell','マーベル','USA','semi','marvell.com',1995,6500,6,-0.2,0.865,90],
      ['MDLZ','Mondelez','モンデリーズ','USA','staples','mondelezinternational.com',2012,91000,36,5,1.33,90],
      ['GEV','GE Vernova','GEバーノバ','USA','energy','gevernova.com',2024,75000,35,1,0.273,90],
      ['PYPL','PayPal','ペイパル','USA','payments','paypal.com',1998,27200,32,4,1.0,80],
      ['CVS','CVS Health','CVSヘルス','USA','health','cvshealth.com',1963,300000,373,4,1.26,80],
      /* (#R142) breadth + immediacy: more large public names, all US-listed so market cap is LIVE (shares × keyless price).
         Share counts are the stable, well-known figures; the snapshot = shares × the price at the time this list was built,
         so the ±5× sanity guard passes and the value then tracks the live price. */
      ['INTC','Intel','インテル','USA','semi','intel.com',1968,108000,53,-19,4.33,412],
      ['PLTR','Palantir','パランティア','USA','software','palantir.com',2003,3900,3,0.5,2.35,311],
      ['COIN','Coinbase','コインベース','USA','finance','coinbase.com',2012,3400,6,2.5,0.26,41],
      ['ARM','Arm Holdings','Arm','GBR','semi','arm.com',1990,7000,4,0.8,1.05,281],
      ['DELL','Dell Technologies','デル','USA','tech','dell.com',1984,108000,96,4.6,0.70,277],
      ['MMM','3M','スリーエム','USA','industrial','3m.com',1902,61000,25,4,0.54,86],
      ['MO','Altria','アルトリア','USA','staples','altria.com',1985,6300,20,11,1.69,125],
      ['DE','Deere','ディア','USA','industrial','deere.com',1837,75000,51,7,0.272,162],
      ['ADI','Analog Devices','アナログ・デバイセズ','USA','semi','analog.com',1965,24000,9,1.6,0.497,187],
      ['CB','Chubb','チャブ','USA','finance','chubb.com',1985,40000,57,9,0.402,142],
      ['ICE','Intercontinental Exchange','ICE','USA','finance','ice.com',2000,13000,9,2.7,0.573,80],
      ['MCO','Moody\'s','ムーディーズ','USA','finance','moodys.com',1909,15000,7,2.1,0.181,92],
      ['SHW','Sherwin-Williams','シャーウィン・ウィリアムズ','USA','materials','sherwin-williams.com',1866,64000,23,2.7,0.251,83],
      ['GD','General Dynamics','ゼネラル・ダイナミクス','USA','aerospace','gd.com',1952,111000,47,3.8,0.270,100],
      ['NOC','Northrop Grumman','ノースロップ・グラマン','USA','aerospace','northropgrumman.com',1939,97000,41,4,0.146,76],
      ['WM','Waste Management','ウェイスト・マネジメント','USA','industrial','wm.com',1968,62000,21,2.7,0.401,96],
      ['FDX','FedEx','フェデックス','USA','industrial','fedex.com',1971,500000,88,4.3,0.240,75],
      ['UPS','UPS','UPS','USA','industrial','ups.com',1907,490000,91,5.8,0.85,100],
      ['TGT','Target','ターゲット','USA','retail','target.com',1902,440000,107,4.1,0.457,64],
      ['MAR','Marriott','マリオット','USA','consumer','marriott.com',1927,411000,25,2.4,0.281,103],
      ['F','Ford','フォード','USA','auto','ford.com',1903,177000,185,5.9,3.97,56],
      ['GM','General Motors','ゼネラルモーターズ','USA','auto','gm.com',1908,163000,187,10,0.98,75],
      ['CL','Colgate-Palmolive','コルゲート・パーモリーブ','USA','staples','colgatepalmolive.com',1806,34000,20,2.7,0.812,75],
      ['ABNB','Airbnb','エアビーアンドビー','USA','tech','airbnb.com',2008,7300,11,4.7,0.63,92],
      ['SNOW','Snowflake','スノーフレイク','USA','software','snowflake.com',2012,7000,4,-1.3,0.335,90],
      ['WDAY','Workday','ワークデイ','USA','software','workday.com',2005,19000,8,1,0.265,38],
      ['KHC','Kraft Heinz','クラフト・ハインツ','USA','staples','kraftheinzcompany.com',2015,36000,26,2.7,1.20,31],
      /* (#R145) breadth + immediacy ("網羅性、即時性を徹底的に高めて") — more global names across India/Brazil/Spain/Italy/
         China/LatAm/Korea/Japan/Australia. US-listed names are LIVE: shares = snapshot cap ÷ the fetched live price
         (self-consistent per the R142 method → mcap stays correct & tracks price, immune to ADR ratios); primary
         foreign listings (.NS/.MC/.T/.KS/.PA/.AX) stay honest reported snapshots. */
      ['BRK-B','Berkshire Hathaway','バークシャー・ハサウェイ','USA','finance','berkshirehathaway.com',1839,396000,371,89,2.078,1020],
      ['CMCSA','Comcast','コムキャスト','USA','media','comcast.com',1963,186000,122,15,3.867,92],
      ['PGR','Progressive','プログレッシブ','USA','finance','progressive.com',1937,61000,62,6,0.5867,122],
      ['RACE','Ferrari','フェラーリ','ITA','auto','ferrari.com',1947,5000,7.2,1.5,0.1804,68],
      ['VALE','Vale','ヴァーレ','BRA','materials','vale.com',1942,66000,38,6,3.665,52],
      ['NU','Nu Holdings (Nubank)','ヌーバンク','BRA','bank','nubank.com.br',2013,8000,11,2,4.562,62],
      ['ABEV','Ambev','アンベブ','BRA','staples','ambev.com.br',1999,51000,16,3,15.51,47],
      ['SAN','Banco Santander','サンタンデール銀行','ESP','bank','santander.com',1857,212000,68,12,6.642,90],
      ['BBVA','BBVA','BBVA','ESP','bank','bbva.com',1857,121000,35,10,3.103,78],
      ['ITX.MC','Inditex (Zara)','インディテックス','ESP','retail','inditex.com',1985,165000,40,5.9,0,160],
      ['RELIANCE.NS','Reliance Industries','リライアンス','IND','energy','ril.com',1966,236000,119,8.4,0,210],
      ['TCS.NS','Tata Consultancy Services','タタ・コンサルタンシー','IND','software','tcs.com',1968,607000,29,5.8,0,170],
      ['INFY','Infosys','インフォシス','IND','software','infosys.com',1981,343000,19,3.2,6.527,75],
      ['IBN','ICICI Bank','ICICI銀行','IND','bank','icicibank.com',1994,130000,27,6,3.192,95],
      ['PDD','PDD Holdings (Temu)','PDDホールディングス','CHN','ecommerce','pddholdings.com',2015,17000,55,16,1.961,165],
      ['JD','JD.com','京東','CHN','ecommerce','jd.com',1998,517000,160,4,1.621,48],
      ['BIDU','Baidu','百度','CHN','internet','baidu.com',2000,40000,19,3,0.2984,32],
      ['MELI','MercadoLibre','メルカドリブレ','ARG','ecommerce','mercadolibre.com',1999,58000,20,1.9,0.05072,92],
      ['SE','Sea Limited','シー','SGP','internet','sea.com',2009,67000,16,0.4,0.5766,60],
      ['CPNG','Coupang','クーパン','KOR','ecommerce','coupang.com',2010,65000,30,0.6,1.805,30],
      ['MUFG','Mitsubishi UFJ Financial','三菱UFJ','JPN','bank','mufg.jp',2005,120000,60,10,7.036,150],
      ['6861.T','Keyence','キーエンス','JPN','industrial','keyence.com',1974,11000,6.5,2.4,0,130],
      ['7974.T','Nintendo','任天堂','JPN','media','nintendo.com',1889,7700,12,3,0,75],
      ['000660.KS','SK Hynix','SKハイニックス','KOR','semi','skhynix.com',1983,32000,40,8,0,90],
      ['AIR.PA','Airbus','エアバス','FRA','aerospace','airbus.com',1970,148000,75,4,0,140],
      ['CBA.AX','Commonwealth Bank','コモンウェルス銀行','AUS','bank','commbank.com.au',1911,49000,27,10,0,150],
      ['BABA','Alibaba','アリババ','CHN','ecommerce','alibaba.com',1999,204000,130,15,2.38,286],
      ['BUD','AB InBev','アンハイザー・ブッシュ','BEL','staples','ab-inbev.com',2008,144000,59,6,2.0,162],
      ['AMAT','Applied Materials','アプライドマテリアルズ','USA','semi','appliedmaterials.com',1967,35700,27,7,0.81,426],
      ['NXPI','NXP Semiconductors','NXPセミコンダクターズ','NLD','semi','nxp.com',2006,34500,13,2.5,0.253,68],
      ['MCHP','Microchip Technology','マイクロチップ','USA','semi','microchip.com',1989,22300,7,1,0.537,43],
      ['ETN','Eaton','イートン','IRL','industrial','eaton.com',1911,92000,25,4,0.393,158],
      ['ELV','Elevance Health','エレバンス・ヘルス','USA','health','elevancehealth.com',2004,104000,175,6,0.226,86],
      ['CI','Cigna','シグナ','USA','health','cigna.com',1982,72000,247,5,0.271,77],
      ['ZTS','Zoetis','ゾエティス','USA','pharma','zoetis.com',1952,14100,9,2.5,0.448,34],
      ['USB','U.S. Bancorp','USバンコープ','USA','bank','usbank.com',1968,70000,28,6,1.56,98],
      ['PNC','PNC Financial','PNCフィナンシャル','USA','bank','pnc.com',1845,55000,22,6,0.396,99],
      ['1398.HK','ICBC','中国工商銀行','CHN','bank','icbc.com.cn',1984,420000,180,50,0,290],
      ['0857.HK','PetroChina','中国石油','CHN','energy','petrochina.com.cn',1999,390000,430,25,0,210],
      ['0941.HK','China Mobile','中国移動','CHN','telecom','chinamobile.com',1997,450000,140,20,0,180],
      ['600519.SS','Kweichow Moutai','貴州茅台','CHN','staples','moutaichina.com',1999,42000,24,12,0,280],
      ['1211.HK','BYD','BYD','CHN','auto','byd.com',1995,900000,107,5,0,110],
      ['RMS.PA','Hermès','エルメス','FRA','consumer','hermes.com',1837,22000,15,4,0,250]
    ];
    const DATA=RAW.map(r=>({tk:r[0],n:r[1],nJp:r[2]||'',cc:r[3],sec:r[4],dom:r[5],fnd:r[6],emp:r[7],rev:r[8],ni:r[9],sh:r[10]||0,mcapSnap:r[11],price:0,priceT:0}));
    /* ===== (#R170) DATA VINTAGE — 「Companiesのすべての数値に、その情報の年や年月、日時を書くように」 =====
       Every figure this module produces falls into exactly one of three classes, and each one now carries the
       date of the information it represents rather than being presented as timeless:

         LIVE       share price, and the market cap computed from it. Dated with the quote's OWN timestamp
                    (the last close timestamp the Yahoo response carries, or meta.regularMarketTime on the
                    per-symbol path); only if the response omits both do we fall back to the fetch time, and
                    priceTexact records which of the two it was, so the UI never claims more precision than it has.
         HISTORICAL time-machine year: that calendar year's year-end close (see setYear).
         CURATED    the RAW table above — revenue, net income, employees, founded, and the reported market-cap
                    snapshot used for names with no live US listing.

       CURATED_ASOF is the date the table entered this repository (git: R139, 2026-07-20) — i.e. when the figures
       were compiled, which is the only vintage that is true of the whole table. CURATED_FY is the fiscal-year
       basis of the annual figures; it is a BASIS, not a common end date, because each company's fiscal year ends
       on its own date (Apple FY2024 ended 2024-09-28, Microsoft's 2024-06-30, NVIDIA's 2024-01-28 — all three
       match this table). The UI states it that way instead of implying one shared reporting date. */
    const CURATED_ASOF='2026-07-20';
    const CURATED_FY='FY2024';
    const PROX=[x=>x, x=>'https://corsproxy.io/?url='+encodeURIComponent(x), x=>'https://api.allorigins.win/raw?url='+encodeURIComponent(x)];
    async function _fjson(u){ for(const p of PROX){ try{ const r=await fetch(p(u)); if(r&&r.ok) return await r.json(); }catch(_){} } return null; }
    /* (#R151) BATCHED multi-symbol quote via Yahoo's keyless "spark" endpoint — ONE request for up to ~40 tickers instead
       of one-per-name, so live prices paint far faster (低遅延) and time-machine year-scrubbing no longer refetches ~150
       symbols per year. Robust to both spark response shapes (nested spark.result[].response[] and the older flat
       {TK:{timestamp,close,...}} form). Returns Map<tk,{ts:number[],close:number[],price:number}>. */
    async function _spark(syms, range, interval){ const out=new Map(); const B=40;
      for(let i=0;i<syms.length;i+=B){ const batch=syms.slice(i,i+B);
        const u='https://query1.finance.yahoo.com/v8/finance/spark?symbols='+batch.map(encodeURIComponent).join(',')+'&range='+range+'&interval='+interval;
        let j=null; try{ j=await _fjson(u); }catch(_){} if(!j) continue;
        const res=(j.spark&&Array.isArray(j.spark.result))?j.spark.result:null;
        if(res){ res.forEach(r=>{ try{ const tk=r.symbol, rp=r.response&&r.response[0]; if(!tk||!rp) return;
              const ts=rp.timestamp||[], cl=(rp.indicators&&rp.indicators.quote&&rp.indicators.quote[0]&&rp.indicators.quote[0].close)||[];
              out.set(tk,{ts,close:cl,price:(rp.meta&&+rp.meta.regularMarketPrice)||0}); }catch(_){} }); }
        else { batch.forEach(tk=>{ try{ const r=j[tk]; if(!r) return; out.set(tk,{ts:r.timestamp||[],close:r.close||[],price:+(r.regularMarketPrice||r.chartPreviousClose||r.previousClose||0)||0}); }catch(_){} }); }
      }
      return out; }
    /* (#R151) FULL monthly price history for every live name, fetched ONCE (batched spark, range=max) and cached as
       {tk:{year:yearEndClose}} — the time-machine then reads any past year from this INSTANTLY (もっと昔も見れる) with no
       per-year network. Built lazily on the first time-travel / time-series request; guarded so a failure just falls back. */
    let _HALL=null, _HALLp=null, _HMON=null;
    function _histAll(){ if(_HALL) return Promise.resolve(_HALL); if(_HALLp) return _HALLp;
      const syms=DATA.filter(c=>c.sh>0).map(c=>c.tk);
      _HALLp=(async()=>{ const map={}, mon={}; try{ const sp=await _spark(syms,'max','1mo');
          sp.forEach((v,tk)=>{ const by={}, series=[], ts=v.ts||[], cl=v.close||[]; for(let i=0;i<ts.length;i++){ const cv=+cl[i]; if(cv>0){ const d=new Date(ts[i]*1000); by[d.getUTCFullYear()]=cv; series.push([d.getUTCFullYear()+d.getUTCMonth()/12, cv, ts[i]*1000]); } } map[tk]=by; mon[tk]=series; }); }catch(_){}   /* (#R152) ALSO keep the raw MONTHLY series (fractional-year, close) for the higher-precision time-series chart; (#R158) 3rd tuple = the point's REAL ms timestamp so the hover tooltip can show month/day, not just the year */
        _HALL=map; _HMON=mon; return _HALL; })();
      return _HALLp; }
    /* (#R152) MONTHLY price path for the compare time-series ("株価も高精度で") — every month, not just year-end, for a
       smooth high-fidelity curve reaching as far back as Yahoo has (spark max). Served from the one-time full-history
       cache; per-symbol monthly chart fallback for any name spark didn't cover. Returns [[fractionalYear, close], …]. */
    const _fineCache={};
    async function priceSeriesFine(tk, y0, y1){ const key=tk+'|'+y0+'|'+y1+'|f'; if(_fineCache[key]) return _fineCache[key];
      let series=null; try{ await _histAll(); if(_HMON&&_HMON[tk]&&_HMON[tk].length) series=_HMON[tk]; }catch(_){}
      if(!series){ const p1=Math.floor(Date.UTC(y0,0,1)/1000), p2=Math.floor(Date.UTC(y1,11,31)/1000); series=[];
        try{ const j=await _fjson('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(tk)+'?period1='+p1+'&period2='+p2+'&interval=1mo');
          const rt=j&&j.chart&&j.chart.result&&j.chart.result[0]; const ts=rt&&rt.timestamp; const q=rt&&rt.indicators&&rt.indicators.quote&&rt.indicators.quote[0]&&rt.indicators.quote[0].close;
          if(Array.isArray(ts)&&Array.isArray(q)){ for(let i=0;i<ts.length;i++){ if(q[i]>0){ const d=new Date(ts[i]*1000); series.push([d.getUTCFullYear()+d.getUTCMonth()/12, +q[i], ts[i]*1000]); } } } }catch(_){} }   /* (#R158) 3rd tuple = real ms timestamp (hover month/day) */
      const out=(series||[]).filter(p=>p[0]>=y0 && p[0]<y1+1); _fineCache[key]=out; return out; }
    /* (#R142) _hy = the time-machine year (null = present/live). In a past year market cap = today's shares × the share
       price AT that year (c.hp); a company founded AFTER the year, or a non-live name with no price path, has no cap. */
    let _hy=null, _hSeq=0, _hyLoaded=null;
    function priceOf(c){ return (_hy!=null)?(c.hp||0):(c.price||0); }
    function mcap(c){ if(_hy!=null){ if(c.fnd>_hy) return NaN; return (c.sh>0&&c.hp>0)?(c.sh*c.hp):NaN; } return (c.sh>0 && c.price>0)?(c.sh*c.price):c.mcapSnap; }
    function isLive(c){ return _hy==null && c.sh>0 && c.price>0; }
    let _loading=false, _loaded=0;
    /* Live market cap for US-listed names: fetch each price via the keyless Yahoo v8 chart endpoint (through the
       same CORS-proxy ladder the ticker uses), concurrency-limited, cached 5 min. onUpdate fires progressively and
       once at completion so the ranking re-sorts live. Non-US names keep their reported snapshot. Fully guarded —
       if the proxies are down the tab still shows real (reported) figures. */
    /* SANITY GUARD: a live market cap that deviates by more than ~5× from the reported snapshot means a bad fetch
       (wrong symbol / stale proxy response / currency mismatch) or an off share count — reject it and keep the honest
       reported figure rather than corrupt the ranking. Genuine price movement stays live. */
    /* (#R170) tMs = the quote's OWN timestamp when the response supplies one (exact), else 0 → we stamp the fetch
       time and mark it inexact, so the UI can say "fetched HH:MM" rather than pretend it is the quote time. */
    function _applyPrice(c,p,tMs){ if(!(p>0)) return false; const cand=c.sh*p; if(cand>=c.mcapSnap*0.2 && cand<=c.mcapSnap*5){ c.price=p; c.priceT=(tMs>0?tMs:Date.now()); c.priceTexact=(tMs>0); return true; } return false; }
    async function loadPrices(onUpdate){
      const now=Date.now(); if(_loading) return; if(_loaded && (now-_loaded)<120000) return;   /* (#R152) 5min→2min: fresher live prices (低遅延) — a batched spark refresh is cheap */
      _loading=true; const live=DATA.filter(c=>c.sh>0); const byTk={}; live.forEach(c=>byTk[c.tk]=c);
      /* (#R151) FAST PATH: one batched spark request per ~40 names → the whole board prices in a few round-trips (低遅延). */
      let missing=live;
      try{ const sp=await _spark(live.map(c=>c.tk),'1d','1d'); const done=new Set();
        sp.forEach((v,tk)=>{ const c=byTk[tk]; if(!c) return; let p=+v.price; if(!(p>0)&&Array.isArray(v.close)){ for(let k=v.close.length-1;k>=0;k--){ if(+v.close[k]>0){ p=+v.close[k]; break; } } }
          const tms=(Array.isArray(v.ts)&&v.ts.length)?(+v.ts[v.ts.length-1]*1000):0;   /* (#R170) the last close's real timestamp */
          if(_applyPrice(c,p,tms)) done.add(tk); });
        missing=live.filter(c=>!done.has(c.tk)); if(onUpdate){ try{ onUpdate(); }catch(_){} } }catch(_){}
      /* FALLBACK: per-symbol chart for any the batch didn't resolve (proxy hiccup / symbol quirk). */
      let idx=0, upd=0; const CONC=6;
      async function w(){ for(;;){ const i=idx++; if(i>=missing.length) return; const c=missing[i];
        try{ const j=await _fjson('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(c.tk)+'?range=1d&interval=1d');
          const m=j&&j.chart&&j.chart.result&&j.chart.result[0]&&j.chart.result[0].meta;
          if(m&&_applyPrice(c,+m.regularMarketPrice,(+m.regularMarketTime||0)*1000)){ if((++upd%8===0)&&onUpdate){ try{ onUpdate(); }catch(_){} } } }catch(_){} } }   /* (#R170) Yahoo's own quote time */
      try{ await Promise.all(Array.from({length:CONC},()=>w())); }catch(_){}
      _loaded=Date.now(); _loading=false; if(onUpdate){ try{ onUpdate(); }catch(_){} }
    }
    /* (#R142) TIME MACHINE — set the historical year and fetch each live name's share price AT that year (keyless Yahoo v8
       chart, monthly, year-end close). period1/period2 = that calendar year. onUpdate fires progressively + at completion so
       the ranking re-sorts to the historical market caps. Guarded by _hSeq so a rapid year change supersedes stale fetches.
       Non-live names (no ADR/US listing) and not-yet-founded names have no historical cap → mcap()=NaN (shown as —). */
    async function setYear(year, onUpdate){
      const cur=new Date().getFullYear();
      if(year==null || year>=cur){ const ch=(_hy!=null); _hy=null; if(ch){ _hyLoaded=null; if(onUpdate){ try{ onUpdate(); }catch(_){} } } return; }
      _hy=year; const my=++_hSeq;
      if(_hyLoaded===year){ if(onUpdate){ try{ onUpdate(); }catch(_){} } return; }
      DATA.forEach(c=>{ c.hp=0; }); if(onUpdate){ try{ onUpdate(); }catch(_){} }   /* show the loading (—) state at once */
      const live=DATA.filter(c=>c.sh>0 && c.fnd<=year);
      /* (#R151) read each name's year-end close from the ONE-TIME full-history cache → instant, and reaches as far back
         as Yahoo has data. A name whose data starts later simply has no entry for this year (mcap()=NaN, honest —). */
      let all=null; try{ all=await _histAll(); }catch(_){} if(my!==_hSeq) return;
      if(all){ live.forEach(c=>{ const by=all[c.tk]; const v=by&&by[year]; if(v>0) c.hp=v; }); if(onUpdate){ try{ onUpdate(); }catch(_){} } }
      /* FALLBACK: any live name the cache didn't cover (spark failed / gap) → the proven per-year chart fetch. */
      const miss=live.filter(c=>!(c.hp>0));
      if(miss.length){ const p1=Math.floor(Date.UTC(year,0,1)/1000), p2=Math.floor(Date.UTC(year,11,31)/1000); let idx=0, upd=0; const CONC=6;
        async function w(){ for(;;){ if(my!==_hSeq) return; const i=idx++; if(i>=miss.length) return; const c=miss[i];
          try{ const j=await _fjson('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(c.tk)+'?period1='+p1+'&period2='+p2+'&interval=1mo');
            const rt=j&&j.chart&&j.chart.result&&j.chart.result[0]; const q=rt&&rt.indicators&&rt.indicators.quote&&rt.indicators.quote[0]&&rt.indicators.quote[0].close;
            if(Array.isArray(q)){ for(let k=q.length-1;k>=0;k--){ if(q[k]>0){ c.hp=+q[k]; break; } } if(c.hp>0 && (++upd%8===0) && onUpdate){ try{ onUpdate(); }catch(_){} } } }catch(_){} } }
        try{ await Promise.all(Array.from({length:CONC},()=>w())); }catch(_){} }
      if(my===_hSeq){ _hyLoaded=year; if(onUpdate){ try{ onUpdate(); }catch(_){} } }
    }
    /* (#R145) Share-price HISTORY for the compare Time-series mode — one keyless Yahoo v8 call per name over a year
       range (monthly), reduced to the last close of each calendar year. Cached per name+range. Live (sh>0/US-listed)
       names only; snapshot-only names have no path and return {} (charted honestly as "no history"). */
    const _histCache={};
    async function priceSeries(tk, y0, y1){ const key=tk+'|'+y0+'|'+y1; if(_histCache[key]) return _histCache[key];
      /* (#R151) serve from the full-history cache when present (no extra network); else the per-symbol chart below. */
      try{ const all=await _histAll(); if(all&&all[tk]){ const by={}; for(let y=y0;y<=y1;y++){ if(all[tk][y]>0) by[y]=all[tk][y]; } if(Object.keys(by).length){ _histCache[key]=by; return by; } } }catch(_){}
      const p1=Math.floor(Date.UTC(y0,0,1)/1000), p2=Math.floor(Date.UTC(y1,11,31)/1000);
      const byYear={};
      try{ const j=await _fjson('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(tk)+'?period1='+p1+'&period2='+p2+'&interval=1mo');
        const rt=j&&j.chart&&j.chart.result&&j.chart.result[0]; const ts=rt&&rt.timestamp; const q=rt&&rt.indicators&&rt.indicators.quote&&rt.indicators.quote[0]&&rt.indicators.quote[0].close;
        if(Array.isArray(ts)&&Array.isArray(q)){ for(let i=0;i<ts.length;i++){ if(q[i]>0){ const y=new Date(ts[i]*1000).getUTCFullYear(); byYear[y]=+q[i]; } } }   /* later month overwrites → year-end close */
      }catch(_){}
      _histCache[key]=byYear; return byYear; }
    /* (#R170) the vintage of every class of figure, so the UI can date each number it prints. */
    return { DATA, mcap, isLive, loadPrices, setYear, priceOf, priceSeries, priceSeriesFine, histYear:()=>_hy,
      CURATED_ASOF, CURATED_FY,
      /* ms timestamp behind a company's LIVE price (0 = no live price for this name), and whether it is the
         quote's own time (true) or merely when we fetched it (false). */
      priceAsOf:c=>((c&&c.price>0&&c.priceT)||0), priceAsOfExact:c=>!!(c&&c.priceTexact) };
  })();
};
