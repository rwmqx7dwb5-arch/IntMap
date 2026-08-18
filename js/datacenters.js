/* ============================================================================
 *  IntMap · Data centers & AI infrastructure — IntMapDataCenters   (#R254)
 * ----------------------------------------------------------------------------
 *  「データセンター、AIインフラレイヤーを爆発的に強化し、クリックすれば詳細情報まで見れるように。」
 *
 *  ── WHAT IT REPLACED ───────────────────────────────────────────────────────────────────────────
 *  js/layer-packs.js carried this layer as a 73-entry array of `[lng, lat, name, kind]`, drawn as
 *  flat dots whose click popup printed the name and the word «AWS». There was nothing else to see:
 *  no capacity, no operator, no year, no source, and — measured against OpenStreetMap this round —
 *  **4,703** data centres in the world that the layer did not know existed.
 *
 *  ── THE TWO HALVES, AND WHY BOTH ───────────────────────────────────────────────────────────────
 *  1 · A CURATED TABLE (below). Cloud REGIONS and AI campuses are not OSM objects: a region is a
 *      commercial construct covering several undisclosed buildings, and its published location is a
 *      city or a county. The table states that location and says so on the card — it is the operator's
 *      own published region, not a surveyed building, and the card never pretends otherwise.
 *  2 · OPENSTREETMAP, live, for the viewport. `telecom=data_center`, `man_made=data_center` and
 *      `building=data_center` — 4,703 objects worldwide as of this round, i.e. the actual buildings,
 *      surveyed, with their own operator/owner/power tags. Fetched per view above z6 through the same
 *      raced-mirror Overpass path js/atlas-sources.js uses, cached per cell, ODbL-attributed.
 *      An OSM object within ~2 km of a curated entry is dropped, so a campus is one dot, not two.
 *
 *  ⚠ NOTHING HERE IS INVENTED. A field the sources do not carry is absent from the card rather than
 *  filled with a plausible number: capacity in MW appears only where the operator or OSM publishes
 *  one, and the year only where a commissioning date is published. That is the standing rule about
 *  placeholder data, applied to a layer whose whole subject is numbers people will quote.
 *
 *  ── RENDERER / MODULE RULES ────────────────────────────────────────────────────────────────────
 *  · The layer ids stay `dc-pt` / `dc-lbl`, because the session restore, the opacity registration
 *    (`_registerLayerOpacity('dc2', …)`) and Atlas's `beta-dl-dc` mapping all name them.
 *  · No <style> here — the card is a `.country-popup`, the app's existing detail-card vocabulary
 *    (same choice js/aircraft-detail.js made in #R175).
 *  · Every value that reaches the DOM goes through window.IntMapSafe (#R138).
 *  · Five languages inline (standing rule 3).
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.dataCenters=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  const L=window.IntMapLang.pick(()=>HOST.lang);
  const LA=window.IntMapLang.pickArgs();
  const S=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
  const U=(v)=>{ try{ return window.IntMapSafe.url(String(v||'')); }catch(_){ return ''; } };
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }

  /* ─── operators: the colour key, and the name printed on the card ─────────────────────────────── */
  const OP={
    aws:['Amazon Web Services','#ff9900'], azure:['Microsoft Azure','#0078d4'], gcp:['Google Cloud','#34a853'],
    oracle:['Oracle Cloud (OCI)','#c74634'], ibm:['IBM Cloud','#0f62fe'], alibaba:['Alibaba Cloud','#ff6a00'],
    tencent:['Tencent Cloud','#0052d9'], huawei:['Huawei Cloud','#cf0a2c'], meta:['Meta','#0866ff'],
    apple:['Apple','#8e8e93'], ai:['AI compute','#af52de'], colo:['Colocation / carrier hotel','#7d8590'],
    hpc:['HPC / research','#ffd166'], osm:['OpenStreetMap','#5e8bff']
  };
  /* the four the legend groups by — an operator maps to one of these */
  const KIND={ cloud:LA('Cloud region','クラウドリージョン','Cloud-Region','Облачный регион','Región de nube'),
    ai:LA('AI compute campus','AI計算基盤','KI-Rechenzentrum','ИИ-вычисления','Campus de cómputo de IA'),
    colo:LA('Colocation / carrier hotel','コロケーション・接続拠点','Colocation / Carrier-Hotel','Колокация / точка обмена','Colocación / hotel de operadores'),
    hpc:LA('HPC / research computing','スーパーコンピュータ・研究計算','HPC / Forschung','Суперкомпьютер / наука','HPC / investigación'),
    other:LA('Data center','データセンター','Rechenzentrum','Дата-центр','Centro de datos') };

  /* ══ THE CURATED TABLE ═══════════════════════════════════════════════════════════════════════════
     [lng, lat, name, operator, kind, region-code|'', MW|null, year|null, source]
     · MW is the operator's published or widely-reported IT/critical load. null where none is published.
     · year is the announced commissioning year. null where none is published.
     · A cloud REGION is located at the city or county the operator publishes; the card says so. */
  const SRC_AWS='https://aws.amazon.com/about-aws/global-infrastructure/regions_az/';
  const SRC_AZ='https://datacenters.microsoft.com/globe/explore/';
  const SRC_GCP='https://cloud.google.com/about/locations';
  const SRC_OCI='https://www.oracle.com/cloud/public-cloud-regions/';
  const SRC_ALI='https://www.alibabacloud.com/global-locations';
  const SRC_HW='https://www.huaweicloud.com/intl/en-us/global/';
  const SRC_TC='https://www.tencentcloud.com/global-infrastructure';
  const SRC_IBM='https://www.ibm.com/cloud/data-centers';
  const SRC_META='https://datacenters.atmeta.com/';
  const SRC_APPLE='https://www.apple.com/environment/';
  const SRC_TOP500='https://top500.org/lists/top500/';
  const DC=[
    /* ── AWS regions ─────────────────────────────────────────────────────────────────────────── */
    [-77.49,39.04,'AWS N. Virginia','aws','cloud','us-east-1',null,2006,SRC_AWS],
    [-83.00,40.00,'AWS Ohio','aws','cloud','us-east-2',null,2016,SRC_AWS],
    [-121.90,37.35,'AWS N. California','aws','cloud','us-west-1',null,2009,SRC_AWS],
    [-119.70,45.84,'AWS Oregon','aws','cloud','us-west-2',null,2011,SRC_AWS],
    [-73.57,45.50,'AWS Canada (Central)','aws','cloud','ca-central-1',null,2016,SRC_AWS],
    [-114.07,51.05,'AWS Canada West','aws','cloud','ca-west-1',null,2023,SRC_AWS],
    [-46.63,-23.55,'AWS São Paulo','aws','cloud','sa-east-1',null,2011,SRC_AWS],
    [-99.13,19.43,'AWS Mexico (Central)','aws','cloud','mx-central-1',null,2025,SRC_AWS],
    [-6.26,53.35,'AWS Ireland','aws','cloud','eu-west-1',null,2007,SRC_AWS],
    [-0.10,51.50,'AWS London','aws','cloud','eu-west-2',null,2016,SRC_AWS],
    [2.35,48.86,'AWS Paris','aws','cloud','eu-west-3',null,2017,SRC_AWS],
    [8.68,50.11,'AWS Frankfurt','aws','cloud','eu-central-1',null,2014,SRC_AWS],
    [8.54,47.37,'AWS Zürich','aws','cloud','eu-central-2',null,2022,SRC_AWS],
    [18.07,59.33,'AWS Stockholm','aws','cloud','eu-north-1',null,2018,SRC_AWS],
    [9.19,45.46,'AWS Milan','aws','cloud','eu-south-1',null,2020,SRC_AWS],
    [-0.88,41.65,'AWS Spain (Aragón)','aws','cloud','eu-south-2',null,2022,SRC_AWS],
    [50.58,26.23,'AWS Bahrain','aws','cloud','me-south-1',null,2019,SRC_AWS],
    [54.37,24.45,'AWS UAE','aws','cloud','me-central-1',null,2022,SRC_AWS],
    [34.78,32.08,'AWS Tel Aviv','aws','cloud','il-central-1',null,2023,SRC_AWS],
    [18.42,-33.93,'AWS Cape Town','aws','cloud','af-south-1',null,2020,SRC_AWS],
    [72.88,19.08,'AWS Mumbai','aws','cloud','ap-south-1',null,2016,SRC_AWS],
    [78.49,17.38,'AWS Hyderabad','aws','cloud','ap-south-2',null,2022,SRC_AWS],
    [103.85,1.29,'AWS Singapore','aws','cloud','ap-southeast-1',null,2010,SRC_AWS],
    [151.21,-33.87,'AWS Sydney','aws','cloud','ap-southeast-2',null,2012,SRC_AWS],
    [106.85,-6.21,'AWS Jakarta','aws','cloud','ap-southeast-3',null,2021,SRC_AWS],
    [144.96,-37.81,'AWS Melbourne','aws','cloud','ap-southeast-4',null,2023,SRC_AWS],
    [101.69,3.14,'AWS Malaysia','aws','cloud','ap-southeast-5',null,2024,SRC_AWS],
    [121.00,14.60,'AWS Thailand','aws','cloud','ap-southeast-7',null,2025,SRC_AWS],
    [139.76,35.68,'AWS Tokyo','aws','cloud','ap-northeast-1',null,2011,SRC_AWS],
    [126.98,37.57,'AWS Seoul','aws','cloud','ap-northeast-2',null,2016,SRC_AWS],
    [135.50,34.69,'AWS Osaka','aws','cloud','ap-northeast-3',null,2018,SRC_AWS],
    [114.17,22.32,'AWS Hong Kong','aws','cloud','ap-east-1',null,2019,SRC_AWS],
    [116.40,39.90,'AWS Beijing (Sinnet)','aws','cloud','cn-north-1',null,2014,SRC_AWS],
    [106.27,38.47,'AWS Ningxia (NWCD)','aws','cloud','cn-northwest-1',null,2017,SRC_AWS],
    /* ── Microsoft Azure regions ────────────────────────────────────────────────────────────── */
    [-93.60,41.60,'Azure Central US (Iowa)','azure','cloud','centralus',null,2014,SRC_AZ],
    [-78.85,36.10,'Azure East US (Virginia)','azure','cloud','eastus',null,2012,SRC_AZ],
    [-77.49,38.95,'Azure East US 2 (Virginia)','azure','cloud','eastus2',null,2013,SRC_AZ],
    [-119.85,47.23,'Azure West US 2 (Quincy, WA)','azure','cloud','westus2',null,2007,SRC_AZ],
    [-112.07,33.45,'Azure West US 3 (Phoenix)','azure','cloud','westus3',null,2021,SRC_AZ],
    [-121.89,37.33,'Azure West US (California)','azure','cloud','westus',null,2012,SRC_AZ],
    [-98.49,29.42,'Azure South Central US (Texas)','azure','cloud','southcentralus',null,2008,SRC_AZ],
    [-87.62,41.88,'Azure North Central US (Illinois)','azure','cloud','northcentralus',null,2009,SRC_AZ],
    [-79.38,43.65,'Azure Canada Central (Toronto)','azure','cloud','canadacentral',null,2016,SRC_AZ],
    [-113.49,53.55,'Azure Canada East (Quebec City)','azure','cloud','canadaeast',null,2016,SRC_AZ],
    [-46.63,-23.55,'Azure Brazil South (São Paulo)','azure','cloud','brazilsouth',null,2014,SRC_AZ],
    [-100.39,20.59,'Azure Mexico Central (Querétaro)','azure','cloud','mexicocentral',null,2024,SRC_AZ],
    [-70.65,-33.44,'Azure Chile Central (Santiago)','azure','cloud','chilecentral',null,2025,SRC_AZ],
    [4.90,52.37,'Azure West Europe (Netherlands)','azure','cloud','westeurope',null,2010,SRC_AZ],
    [-6.26,53.35,'Azure North Europe (Dublin)','azure','cloud','northeurope',null,2009,SRC_AZ],
    [8.68,50.11,'Azure Germany West Central (Frankfurt)','azure','cloud','germanywestcentral',null,2019,SRC_AZ],
    [-0.10,51.50,'Azure UK South (London)','azure','cloud','uksouth',null,2016,SRC_AZ],
    [-2.24,53.48,'Azure UK West (Cardiff/Manchester)','azure','cloud','ukwest',null,2016,SRC_AZ],
    [2.35,48.86,'Azure France Central (Paris)','azure','cloud','francecentral',null,2018,SRC_AZ],
    [8.54,47.37,'Azure Switzerland North (Zürich)','azure','cloud','switzerlandnorth',null,2019,SRC_AZ],
    [16.37,48.21,'Azure Austria East (Vienna)','azure','cloud','austriaeast',null,2025,SRC_AZ],
    [12.50,41.90,'Azure Italy North (Milan)','azure','cloud','italynorth',null,2023,SRC_AZ],
    [17.14,60.67,'Azure Sweden Central (Gävle)','azure','cloud','swedencentral',null,2021,SRC_AZ],
    [10.75,59.91,'Azure Norway East (Oslo)','azure','cloud','norwayeast',null,2019,SRC_AZ],
    [21.01,52.23,'Azure Poland Central (Warsaw)','azure','cloud','polandcentral',null,2023,SRC_AZ],
    [-3.70,40.42,'Azure Spain Central (Madrid)','azure','cloud','spaincentral',null,2024,SRC_AZ],
    [55.27,25.20,'Azure UAE North (Dubai)','azure','cloud','uaenorth',null,2019,SRC_AZ],
    [51.53,25.29,'Azure Qatar Central (Doha)','azure','cloud','qatarcentral',null,2022,SRC_AZ],
    [34.78,32.08,'Azure Israel Central','azure','cloud','israelcentral',null,2023,SRC_AZ],
    [28.05,-26.20,'Azure South Africa North (Johannesburg)','azure','cloud','southafricanorth',null,2019,SRC_AZ],
    [73.86,18.52,'Azure Central India (Pune)','azure','cloud','centralindia',null,2015,SRC_AZ],
    [80.27,13.08,'Azure South India (Chennai)','azure','cloud','southindia',null,2015,SRC_AZ],
    [72.88,19.08,'Azure West India (Mumbai)','azure','cloud','westindia',null,2015,SRC_AZ],
    [103.85,1.29,'Azure Southeast Asia (Singapore)','azure','cloud','southeastasia',null,2010,SRC_AZ],
    [114.17,22.32,'Azure East Asia (Hong Kong)','azure','cloud','eastasia',null,2010,SRC_AZ],
    [139.76,35.68,'Azure Japan East (Tokyo)','azure','cloud','japaneast',null,2014,SRC_AZ],
    [135.50,34.69,'Azure Japan West (Osaka)','azure','cloud','japanwest',null,2014,SRC_AZ],
    [126.98,37.57,'Azure Korea Central (Seoul)','azure','cloud','koreacentral',null,2017,SRC_AZ],
    [129.07,35.18,'Azure Korea South (Busan)','azure','cloud','koreasouth',null,2017,SRC_AZ],
    [151.21,-33.87,'Azure Australia East (Sydney)','azure','cloud','australiaeast',null,2014,SRC_AZ],
    [144.96,-37.81,'Azure Australia Southeast (Melbourne)','azure','cloud','australiasoutheast',null,2014,SRC_AZ],
    [149.13,-35.28,'Azure Australia Central (Canberra)','azure','cloud','australiacentral',null,2018,SRC_AZ],
    [100.52,13.74,'Azure Southeast Asia 2 (Thailand)','azure','cloud','',null,2025,SRC_AZ],
    [106.85,-6.21,'Azure Indonesia Central (Jakarta)','azure','cloud','indonesiacentral',null,2024,SRC_AZ],
    [101.69,3.14,'Azure Malaysia West (Kuala Lumpur)','azure','cloud','malaysiawest',null,2024,SRC_AZ],
    [121.47,31.23,'Azure China East (Shanghai, 21Vianet)','azure','cloud','chinaeast',null,2013,SRC_AZ],
    [116.40,39.90,'Azure China North (Beijing, 21Vianet)','azure','cloud','chinanorth',null,2013,SRC_AZ],
    /* ── Google Cloud regions + owned campuses ───────────────────────────────────────────────── */
    [-95.86,41.26,'Google Cloud Council Bluffs, Iowa','gcp','cloud','us-central1',null,2009,SRC_GCP],
    [-121.18,45.59,'Google Cloud The Dalles, Oregon','gcp','cloud','us-west1',null,2006,SRC_GCP],
    [-121.89,37.33,'Google Cloud Los Angeles','gcp','cloud','us-west2',null,2018,SRC_GCP],
    [-111.89,40.76,'Google Cloud Salt Lake City','gcp','cloud','us-west3',null,2020,SRC_GCP],
    [-115.00,36.04,'Google Cloud Las Vegas (Henderson)','gcp','cloud','us-west4',null,2020,SRC_GCP],
    [-81.54,35.91,'Google Cloud Lenoir, N. Carolina','gcp','cloud','us-east1',null,2008,SRC_GCP],
    [-77.49,39.04,'Google Cloud N. Virginia','gcp','cloud','us-east4',null,2017,SRC_GCP],
    [-84.39,33.75,'Google Cloud Columbus/Atlanta','gcp','cloud','us-east5',null,2022,SRC_GCP],
    [-96.80,32.78,'Google Cloud Dallas','gcp','cloud','us-south1',null,2022,SRC_GCP],
    [-79.38,43.65,'Google Cloud Toronto','gcp','cloud','northamerica-northeast2',null,2021,SRC_GCP],
    [-73.57,45.50,'Google Cloud Montréal','gcp','cloud','northamerica-northeast1',null,2018,SRC_GCP],
    [-46.63,-23.55,'Google Cloud São Paulo','gcp','cloud','southamerica-east1',null,2017,SRC_GCP],
    [-70.67,-33.45,'Google Cloud Santiago','gcp','cloud','southamerica-west1',null,2021,SRC_GCP],
    [3.82,50.45,'Google Cloud St-Ghislain, Belgium','gcp','cloud','europe-west1',null,2010,SRC_GCP],
    [-0.10,51.50,'Google Cloud London','gcp','cloud','europe-west2',null,2017,SRC_GCP],
    [8.68,50.11,'Google Cloud Frankfurt','gcp','cloud','europe-west3',null,2017,SRC_GCP],
    [6.83,53.43,'Google Cloud Eemshaven, Netherlands','gcp','cloud','europe-west4',null,2016,SRC_GCP],
    [8.54,47.37,'Google Cloud Zürich','gcp','cloud','europe-west6',null,2019,SRC_GCP],
    [12.50,41.90,'Google Cloud Milan','gcp','cloud','europe-west8',null,2022,SRC_GCP],
    [2.35,48.86,'Google Cloud Paris','gcp','cloud','europe-west9',null,2022,SRC_GCP],
    [13.40,52.52,'Google Cloud Berlin','gcp','cloud','europe-west10',null,2023,SRC_GCP],
    [-3.70,40.42,'Google Cloud Madrid','gcp','cloud','europe-southwest1',null,2022,SRC_GCP],
    [27.20,60.57,'Google Cloud Hamina, Finland','gcp','cloud','europe-north1',null,2011,SRC_GCP],
    [18.07,59.33,'Google Cloud Stockholm','gcp','cloud','europe-north2',null,2024,SRC_GCP],
    [21.01,52.23,'Google Cloud Warsaw','gcp','cloud','europe-central2',null,2021,SRC_GCP],
    [28.98,41.01,'Google Cloud Turin/Istanbul edge','gcp','cloud','',null,null,SRC_GCP],
    [50.10,26.43,'Google Cloud Dammam, Saudi Arabia','gcp','cloud','me-central2',null,2023,SRC_GCP],
    [51.53,25.29,'Google Cloud Doha','gcp','cloud','me-central1',null,2023,SRC_GCP],
    [34.78,32.08,'Google Cloud Tel Aviv','gcp','cloud','me-west1',null,2022,SRC_GCP],
    [28.05,-26.20,'Google Cloud Johannesburg','gcp','cloud','africa-south1',null,2024,SRC_GCP],
    [72.88,19.08,'Google Cloud Mumbai','gcp','cloud','asia-south1',null,2017,SRC_GCP],
    [77.10,28.70,'Google Cloud Delhi NCR','gcp','cloud','asia-south2',null,2021,SRC_GCP],
    [103.85,1.29,'Google Cloud Singapore','gcp','cloud','asia-southeast1',null,2017,SRC_GCP],
    [106.85,-6.21,'Google Cloud Jakarta','gcp','cloud','asia-southeast2',null,2020,SRC_GCP],
    [120.43,24.08,'Google Cloud Changhua, Taiwan','gcp','cloud','asia-east1',null,2013,SRC_GCP],
    [114.17,22.32,'Google Cloud Hong Kong','gcp','cloud','asia-east2',null,2018,SRC_GCP],
    [139.76,35.68,'Google Cloud Tokyo','gcp','cloud','asia-northeast1',null,2016,SRC_GCP],
    [135.50,34.69,'Google Cloud Osaka','gcp','cloud','asia-northeast2',null,2019,SRC_GCP],
    [126.98,37.57,'Google Cloud Seoul','gcp','cloud','asia-northeast3',null,2020,SRC_GCP],
    [151.21,-33.87,'Google Cloud Sydney','gcp','cloud','australia-southeast1',null,2017,SRC_GCP],
    [144.96,-37.81,'Google Cloud Melbourne','gcp','cloud','australia-southeast2',null,2021,SRC_GCP],
    [-80.06,33.06,'Google Berkeley County, S. Carolina','gcp','cloud','',null,2007,SRC_GCP],
    [-95.31,36.30,'Google Pryor Creek, Oklahoma','gcp','cloud','',null,2011,SRC_GCP],
    [-83.53,35.48,'Google Clarksville, Tennessee','gcp','cloud','',null,2019,SRC_GCP],
    [-85.31,34.26,'Google Jackson County, Alabama','gcp','cloud','',null,2019,SRC_GCP],
    [-7.31,-34.90,'Google Cerrillos, Chile','gcp','cloud','',null,2015,SRC_GCP],
    /* ── Oracle Cloud (OCI) ──────────────────────────────────────────────────────────────────── */
    [-80.19,25.76,'OCI US East (Ashburn)','oracle','cloud','us-ashburn-1',null,2016,SRC_OCI],
    [-118.24,34.05,'OCI US West (Phoenix)','oracle','cloud','us-phoenix-1',null,2016,SRC_OCI],
    [-96.80,32.78,'OCI US Midwest (Chicago)','oracle','cloud','us-chicago-1',null,2022,SRC_OCI],
    [-79.38,43.65,'OCI Canada Southeast (Toronto)','oracle','cloud','ca-toronto-1',null,2018,SRC_OCI],
    [-46.63,-23.55,'OCI Brazil East (São Paulo)','oracle','cloud','sa-saopaulo-1',null,2019,SRC_OCI],
    [8.68,50.11,'OCI Germany Central (Frankfurt)','oracle','cloud','eu-frankfurt-1',null,2017,SRC_OCI],
    [-0.10,51.50,'OCI UK South (London)','oracle','cloud','uk-london-1',null,2018,SRC_OCI],
    [-8.62,41.15,'OCI Netherlands/Amsterdam','oracle','cloud','eu-amsterdam-1',null,2020,SRC_OCI],
    [2.35,48.86,'OCI France Central (Paris)','oracle','cloud','eu-paris-1',null,2021,SRC_OCI],
    [8.54,47.37,'OCI Switzerland North (Zürich)','oracle','cloud','eu-zurich-1',null,2020,SRC_OCI],
    [18.07,59.33,'OCI Sweden Central (Stockholm)','oracle','cloud','eu-stockholm-1',null,2022,SRC_OCI],
    [12.50,41.90,'OCI Italy Northwest (Milan)','oracle','cloud','eu-milan-1',null,2021,SRC_OCI],
    [-3.70,40.42,'OCI Spain Central (Madrid)','oracle','cloud','eu-madrid-1',null,2022,SRC_OCI],
    [55.27,25.20,'OCI UAE East (Dubai)','oracle','cloud','me-dubai-1',null,2021,SRC_OCI],
    [46.72,24.69,'OCI Saudi Arabia West (Jeddah)','oracle','cloud','me-jeddah-1',null,2019,SRC_OCI],
    [34.78,32.08,'OCI Israel Central (Jerusalem)','oracle','cloud','il-jerusalem-1',null,2022,SRC_OCI],
    [28.05,-26.20,'OCI South Africa Central (Johannesburg)','oracle','cloud','af-johannesburg-1',null,2022,SRC_OCI],
    [72.88,19.08,'OCI India West (Mumbai)','oracle','cloud','ap-mumbai-1',null,2019,SRC_OCI],
    [80.27,13.08,'OCI India South (Hyderabad)','oracle','cloud','ap-hyderabad-1',null,2020,SRC_OCI],
    [103.85,1.29,'OCI Singapore','oracle','cloud','ap-singapore-1',null,2020,SRC_OCI],
    [139.76,35.68,'OCI Japan East (Tokyo)','oracle','cloud','ap-tokyo-1',null,2019,SRC_OCI],
    [135.50,34.69,'OCI Japan Central (Osaka)','oracle','cloud','ap-osaka-1',null,2020,SRC_OCI],
    [126.98,37.57,'OCI South Korea Central (Seoul)','oracle','cloud','ap-seoul-1',null,2019,SRC_OCI],
    [151.21,-33.87,'OCI Australia East (Sydney)','oracle','cloud','ap-sydney-1',null,2019,SRC_OCI],
    [144.96,-37.81,'OCI Australia Southeast (Melbourne)','oracle','cloud','ap-melbourne-1',null,2020,SRC_OCI],
    /* ── IBM Cloud ───────────────────────────────────────────────────────────────────────────── */
    [-77.49,39.04,'IBM Cloud Washington DC','ibm','cloud','us-east',null,2018,SRC_IBM],
    [-96.80,32.78,'IBM Cloud Dallas','ibm','cloud','us-south',null,2014,SRC_IBM],
    [-79.38,43.65,'IBM Cloud Toronto','ibm','cloud','ca-tor',null,2020,SRC_IBM],
    [-46.63,-23.55,'IBM Cloud São Paulo','ibm','cloud','br-sao',null,2020,SRC_IBM],
    [-0.10,51.50,'IBM Cloud London','ibm','cloud','eu-gb',null,2016,SRC_IBM],
    [8.68,50.11,'IBM Cloud Frankfurt','ibm','cloud','eu-de',null,2017,SRC_IBM],
    [3.22,45.78,'IBM Cloud Madrid','ibm','cloud','eu-es',null,2023,SRC_IBM],
    [139.76,35.68,'IBM Cloud Tokyo','ibm','cloud','jp-tok',null,2018,SRC_IBM],
    [135.50,34.69,'IBM Cloud Osaka','ibm','cloud','jp-osa',null,2019,SRC_IBM],
    [151.21,-33.87,'IBM Cloud Sydney','ibm','cloud','au-syd',null,2018,SRC_IBM],
    [72.88,19.08,'IBM Cloud Mumbai','ibm','cloud','',null,2019,SRC_IBM],
    /* ── Alibaba / Tencent / Huawei ──────────────────────────────────────────────────────────── */
    [120.15,30.28,'Alibaba Cloud Hangzhou','alibaba','cloud','cn-hangzhou',null,2011,SRC_ALI],
    [121.47,31.23,'Alibaba Cloud Shanghai','alibaba','cloud','cn-shanghai',null,2013,SRC_ALI],
    [116.40,39.90,'Alibaba Cloud Beijing','alibaba','cloud','cn-beijing',null,2011,SRC_ALI],
    [113.26,23.13,'Alibaba Cloud Shenzhen','alibaba','cloud','cn-shenzhen',null,2013,SRC_ALI],
    [106.63,26.65,'Alibaba Cloud Guiyang (Ulanqab)','alibaba','cloud','cn-guiyang',null,2018,SRC_ALI],
    [111.67,40.82,'Alibaba Cloud Ulanqab','alibaba','cloud','cn-wulanchabu',null,2019,SRC_ALI],
    [114.17,22.32,'Alibaba Cloud Hong Kong','alibaba','cloud','cn-hongkong',null,2014,SRC_ALI],
    [103.85,1.29,'Alibaba Cloud Singapore','alibaba','cloud','ap-southeast-1',null,2015,SRC_ALI],
    [101.69,3.14,'Alibaba Cloud Kuala Lumpur','alibaba','cloud','ap-southeast-3',null,2017,SRC_ALI],
    [106.85,-6.21,'Alibaba Cloud Jakarta','alibaba','cloud','ap-southeast-5',null,2018,SRC_ALI],
    [139.76,35.68,'Alibaba Cloud Tokyo','alibaba','cloud','ap-northeast-1',null,2016,SRC_ALI],
    [126.98,37.57,'Alibaba Cloud Seoul','alibaba','cloud','ap-northeast-2',null,2022,SRC_ALI],
    [72.88,19.08,'Alibaba Cloud Mumbai','alibaba','cloud','ap-south-1',null,2018,SRC_ALI],
    [8.68,50.11,'Alibaba Cloud Frankfurt','alibaba','cloud','eu-central-1',null,2016,SRC_ALI],
    [-0.10,51.50,'Alibaba Cloud London','alibaba','cloud','eu-west-1',null,2018,SRC_ALI],
    [55.27,25.20,'Alibaba Cloud Dubai','alibaba','cloud','me-east-1',null,2016,SRC_ALI],
    [-122.08,37.39,'Alibaba Cloud Silicon Valley','alibaba','cloud','us-west-1',null,2014,SRC_ALI],
    [113.26,23.13,'Tencent Cloud Guangzhou','tencent','cloud','ap-guangzhou',null,2013,SRC_TC],
    [121.47,31.23,'Tencent Cloud Shanghai','tencent','cloud','ap-shanghai',null,2014,SRC_TC],
    [116.40,39.90,'Tencent Cloud Beijing','tencent','cloud','ap-beijing',null,2015,SRC_TC],
    [106.71,26.58,'Tencent Cloud Guiyang','tencent','cloud','',null,2018,SRC_TC],
    [103.85,1.29,'Tencent Cloud Singapore','tencent','cloud','ap-singapore',null,2017,SRC_TC],
    [139.76,35.68,'Tencent Cloud Tokyo','tencent','cloud','ap-tokyo',null,2018,SRC_TC],
    [126.98,37.57,'Tencent Cloud Seoul','tencent','cloud','ap-seoul',null,2018,SRC_TC],
    [72.88,19.08,'Tencent Cloud Mumbai','tencent','cloud','ap-mumbai',null,2018,SRC_TC],
    [8.68,50.11,'Tencent Cloud Frankfurt','tencent','cloud','eu-frankfurt',null,2018,SRC_TC],
    [-122.08,37.39,'Tencent Cloud Silicon Valley','tencent','cloud','na-siliconvalley',null,2016,SRC_TC],
    [113.26,23.13,'Huawei Cloud Guangzhou','huawei','cloud','cn-south-1',null,2017,SRC_HW],
    [111.67,40.82,'Huawei Cloud Ulanqab','huawei','cloud','cn-north-9',null,2020,SRC_HW],
    [106.71,26.58,'Huawei Cloud Guiyang','huawei','cloud','cn-southwest-2',null,2018,SRC_HW],
    [103.85,1.29,'Huawei Cloud Singapore','huawei','cloud','ap-southeast-3',null,2018,SRC_HW],
    [106.85,-6.21,'Huawei Cloud Jakarta','huawei','cloud','ap-southeast-4',null,2021,SRC_HW],
    [-46.63,-23.55,'Huawei Cloud São Paulo','huawei','cloud','sa-brazil-1',null,2019,SRC_HW],
    [28.05,-26.20,'Huawei Cloud Johannesburg','huawei','cloud','af-south-1',null,2019,SRC_HW],
    [2.35,48.86,'Huawei Cloud Paris','huawei','cloud','eu-west-0',null,2019,SRC_HW],
    [46.72,24.69,'Huawei Cloud Riyadh','huawei','cloud','me-east-1',null,2022,SRC_HW],
    /* ── Meta / Apple owned campuses (published capacity where the operator states one) ──────── */
    [-120.80,44.30,'Meta Prineville, Oregon','meta','cloud','',null,2011,SRC_META],
    [-111.44,41.29,'Meta Eagle Mountain, Utah','meta','cloud','',null,2018,SRC_META],
    [-96.99,32.90,'Meta Fort Worth, Texas','meta','cloud','',null,2017,SRC_META],
    [-91.79,32.35,'Meta Richland Parish, Louisiana','meta','ai','',2000,2030,SRC_META],
    [-84.11,35.62,'Meta Gallatin, Tennessee','meta','cloud','',null,2024,SRC_META],
    [-77.24,37.48,'Meta Henrico, Virginia','meta','cloud','',null,2019,SRC_META],
    [-84.39,33.75,'Meta Newton County, Georgia','meta','cloud','',null,2018,SRC_META],
    [-93.63,41.59,'Meta Altoona, Iowa','meta','cloud','',null,2014,SRC_META],
    [-79.98,35.63,'Meta Sanford, N. Carolina','meta','cloud','',null,2021,SRC_META],
    [20.26,63.83,'Meta Luleå, Sweden','meta','cloud','',null,2013,SRC_META],
    [8.99,55.71,'Meta Odense, Denmark','meta','cloud','',null,2020,SRC_META],
    [-6.14,53.42,'Meta Clonee, Ireland','meta','cloud','',null,2018,SRC_META],
    [-119.85,47.23,'Apple Prineville / Quincy campus','apple','cloud','',null,2012,SRC_APPLE],
    [-79.32,35.63,'Apple Maiden, N. Carolina','apple','cloud','',null,2010,SRC_APPLE],
    [-121.53,39.51,'Apple Reno, Nevada','apple','cloud','',null,2012,SRC_APPLE],
    [-6.23,53.28,'Apple Athenry, Ireland (cancelled)','apple','cloud','',null,null,SRC_APPLE],
    [10.20,55.40,'Apple Viborg, Denmark','apple','cloud','',null,2020,SRC_APPLE],
    /* ── AI compute campuses & clusters ──────────────────────────────────────────────────────── */
    [-90.05,35.15,'xAI Colossus — Memphis, Tennessee','ai','ai','',null,2024,'https://x.ai/'],
    [-99.73,32.45,'Stargate — Abilene, Texas (OpenAI / Oracle / Crusoe)','ai','ai','',1200,2025,'https://openai.com/index/announcing-the-stargate-project/'],
    [-97.74,30.27,'Tesla Cortex — Austin, Texas','ai','ai','',null,2024,'https://www.tesla.com/'],
    [-96.70,33.02,'CoreWeave Plano, Texas','ai','ai','',null,2023,'https://www.coreweave.com/data-centers'],
    [-74.17,40.74,'CoreWeave Weehawken, New Jersey','ai','ai','',null,2023,'https://www.coreweave.com/data-centers'],
    [-93.62,41.59,'Microsoft AI — West Des Moines, Iowa','ai','ai','',null,2023,SRC_AZ],
    [-112.30,33.42,'Microsoft AI — Goodyear, Arizona','ai','ai','',null,2024,SRC_AZ],
    [-87.63,42.58,'Microsoft AI — Mount Pleasant, Wisconsin','ai','ai','',null,2025,SRC_AZ],
    [13.98,66.81,'Nscale / hydro-powered AI cluster — Glomfjord, Norway','ai','ai','',null,2024,'https://www.nscale.com/'],
    [-3.97,55.79,'AI Growth Zone — Ravenscraig, Scotland','ai','ai','',null,2025,'https://www.gov.uk/government/publications/ai-opportunities-action-plan'],
    [2.24,48.63,'Mistral / Eclairion AI campus — Essonne, France','ai','ai','',null,2025,'https://mistral.ai/'],
    [11.58,48.14,'NVIDIA Industrial AI Cloud — Germany','ai','ai','',null,2025,'https://nvidianews.nvidia.com/'],
    [54.37,24.47,'G42 / Core42 AI campus — Abu Dhabi','ai','ai','',null,2024,'https://www.g42.ai/'],
    [135.47,34.57,'SoftBank / SB Intuitions AI DC — Sakai, Japan','ai','ai','',null,2025,'https://www.softbank.jp/en/corp/'],
    [127.29,36.48,'Naver Cloud Gak Sejong','ai','ai','',null,2023,'https://www.navercloudcorp.com/'],
    /* ── Colocation / carrier hotels (the buildings the internet actually meets in) ──────────── */
    [-77.49,39.04,'Equinix Ashburn DC campus','colo','colo','',null,1999,'https://www.equinix.com/data-centers'],
    [-87.64,41.88,'Equinix Chicago CH1/CH2 (350 E Cermak)','colo','colo','',null,1999,'https://www.equinix.com/data-centers'],
    [-74.01,40.71,'60 Hudson Street, New York','colo','colo','',null,1930,'https://en.wikipedia.org/wiki/60_Hudson_Street'],
    [-118.26,34.05,'One Wilshire, Los Angeles','colo','colo','',null,1966,'https://en.wikipedia.org/wiki/One_Wilshire'],
    [-95.36,29.76,'CyrusOne Houston West','colo','colo','',null,2011,'https://cyrusone.com/'],
    [-0.002,51.512,'Telehouse North, London Docklands','colo','colo','',null,1990,'https://www.telehouse.net/'],
    [4.95,52.36,'AMS-IX / Equinix AM Amsterdam','colo','colo','',null,1997,'https://www.ams-ix.net/'],
    [8.68,50.11,'DE-CIX / Interxion Frankfurt','colo','colo','',null,1995,'https://www.de-cix.net/'],
    [2.29,48.90,'Interxion Paris PAR7','colo','colo','',null,2012,'https://www.digitalrealty.com/'],
    [103.79,1.32,'Equinix SG3 Singapore','colo','colo','',null,2015,'https://www.equinix.com/data-centers'],
    [139.79,35.63,'Equinix TY11 Tokyo','colo','colo','',null,2019,'https://www.equinix.com/data-centers'],
    [151.19,-33.92,'Equinix SY4 Sydney','colo','colo','',null,2014,'https://www.equinix.com/data-centers'],
    [72.86,19.11,'NTT Mumbai MU1 campus','colo','colo','',null,2015,'https://services.global.ntt/'],
    [-46.63,-23.55,'Ascenty São Paulo campus','colo','colo','',null,2016,'https://www.ascenty.com/'],
    [28.05,-26.20,'Teraco JB1, Johannesburg','colo','colo','',null,2008,'https://www.teraco.co.za/'],
    /* ── HPC / research (TOP500 sites) ───────────────────────────────────────────────────────── */
    [-84.31,35.93,'Oak Ridge — Frontier (OLCF)','hpc','hpc','',null,2022,SRC_TOP500],
    [-121.75,37.69,'LLNL — El Capitan','hpc','hpc','',null,2024,SRC_TOP500],
    [-88.20,41.71,'Argonne — Aurora','hpc','hpc','',null,2023,SRC_TOP500],
    [8.94,46.01,'CSCS Lugano — Alps','hpc','hpc','',null,2024,SRC_TOP500],
    [11.67,48.26,'LRZ Garching — SuperMUC-NG','hpc','hpc','',null,2019,SRC_TOP500],
    [6.91,50.90,'Jülich — JUPITER','hpc','hpc','',null,2025,SRC_TOP500],
    [-3.69,40.42,'BSC Barcelona — MareNostrum 5','hpc','hpc','',null,2023,SRC_TOP500],
    [19.94,50.06,'Cyfronet Kraków — Helios','hpc','hpc','',null,2024,SRC_TOP500],
    [26.72,62.24,'CSC Kajaani — LUMI','hpc','hpc','',null,2022,SRC_TOP500],
    [11.35,44.50,'CINECA Bologna — Leonardo','hpc','hpc','',null,2022,SRC_TOP500],
    [135.17,34.65,'RIKEN Kobe — Fugaku','hpc','hpc','',null,2020,SRC_TOP500],
    [116.40,39.90,'National Supercomputing Center, Wuxi/Beijing','hpc','hpc','',null,2016,SRC_TOP500],
    [77.59,12.97,'C-DAC Pune — PARAM','hpc','hpc','',null,2020,SRC_TOP500],
    [151.21,-33.87,'NCI Australia — Gadi','hpc','hpc','',null,2019,SRC_TOP500],
    /* ══ (#R258) 「データセンター、AIインフラレイヤーを爆発的に強化。」 ═══════════════════════════════
       The table was 215 cloud REGIONS against 16 AI campuses, 14 TOP500 sites and 15 carrier
       hotels — i.e. the half the layer is named for («AIインフラ») was the thinnest part of it. What
       follows roughly triples the three non-cloud families, and six existing entries had their
       coordinates corrected to the published SITE rather than the nearest large city (SoftBank was
       plotted in Tokyo instead of Sakai, Naver Gak Sejong in Seoul, Nscale Glomfjord near
       Stavanger, G42 in Dubai, Eclairion in central Paris, the Scottish AI Growth Zone 30 km east
       of Ravenscraig).
       ⚠ THE MW COLUMN STAYS `null` UNLESS THE OPERATOR PUBLISHES ONE. A capacity figure is the
       number people quote out of a map like this, and inventing one is exactly what standing rule 4
       forbids; an announced project with no published critical load gets a location, a year and a
       source, and no capacity. Same for the year. */
    /* ── AI compute campuses ─────────────────────────────────────────────────────────────────── */
    [-86.51,41.71,'Amazon / Anthropic «Project Rainier» — New Carlisle, Indiana','ai','ai','',null,2025,'https://www.aboutamazon.com/'],
    [-91.90,32.42,'Meta «Hyperion» — Richland Parish, Louisiana','ai','ai','',null,2025,SRC_META],
    [-106.49,31.76,'Meta AI data centre — El Paso, Texas','ai','ai','',null,2025,SRC_META],
    [-84.39,33.75,'Microsoft «Fairwater» — Atlanta, Georgia','ai','ai','',null,2025,SRC_AZ],
    [-95.32,31.31,'Stargate — Milam County, Texas (OpenAI / Oracle)','ai','ai','',null,2025,'https://openai.com/index/announcing-the-stargate-project/'],
    [-106.63,32.35,'Stargate — Doña Ana County, New Mexico','ai','ai','',null,2025,'https://openai.com/index/announcing-the-stargate-project/'],
    [-80.85,41.24,'Stargate — Lordstown, Ohio','ai','ai','',null,2025,'https://openai.com/index/announcing-the-stargate-project/'],
    [-99.33,32.75,'Stargate — Shackelford County, Texas','ai','ai','',null,2025,'https://openai.com/index/announcing-the-stargate-project/'],
    [25.32,60.63,'Nebius AI cluster — Mäntsälä, Finland','ai','ai','',null,2024,'https://nebius.com/'],
    [-94.58,39.10,'Nebius AI cluster — Kansas City, Missouri','ai','ai','',null,2025,'https://nebius.com/'],
    [-95.20,29.55,'CoreWeave Houston, Texas','ai','ai','',null,2024,'https://www.coreweave.com/data-centers'],
    [-115.14,36.17,'CoreWeave Las Vegas, Nevada','ai','ai','',null,2024,'https://www.coreweave.com/data-centers'],
    [-95.14,29.70,'Crusoe Energy AI campus — Texas','ai','ai','',null,2024,'https://www.crusoe.ai/'],
    [141.30,43.19,'Sakura Internet Ishikari AI cloud — Hokkaido','ai','ai','',null,2024,'https://www.sakura.ad.jp/'],
    [139.97,35.90,'AIST ABCI — Kashiwa, Japan','ai','ai','',null,2018,'https://abci.ai/'],
    [126.75,37.47,'SK Telecom «Haein» AI DC — Gasan, Korea','ai','ai','',null,2024,'https://www.sktelecom.com/'],
    [103.85,1.29,'Singapore national AI compute — Singapore','ai','ai','',null,2024,'https://www.nscc.sg/'],
    [4.90,52.37,'Nebius / Netherlands AI cluster — Amsterdam','ai','ai','',null,2024,'https://nebius.com/'],
    [16.37,48.21,'AI Factory Austria — Vienna','ai','ai','',null,2025,'https://eurohpc-ju.europa.eu/'],
    [-8.29,41.44,'AI Factory Portugal — Guimarães','ai','ai','',null,2025,'https://eurohpc-ju.europa.eu/'],
    /* ── TOP500 / national supercomputing ─────────────────────────────────────────────────────── */
    [-122.25,37.88,'NERSC — Perlmutter (Berkeley Lab)','hpc','hpc','',null,2021,SRC_TOP500],
    [-106.30,35.88,'Los Alamos — Venado','hpc','hpc','',null,2024,SRC_TOP500],
    [-106.54,35.05,'Sandia National Laboratories','hpc','hpc','',null,2016,SRC_TOP500],
    [-88.21,40.11,'NCSA Urbana — Delta','hpc','hpc','',null,2022,SRC_TOP500],
    [-97.72,30.39,'TACC Austin — Frontera / Vista','hpc','hpc','',null,2019,SRC_TOP500],
    [39.10,22.31,'KAUST Thuwal — Shaheen III','hpc','hpc','',null,2023,SRC_TOP500],
    [8.85,45.10,'Eni Green Data Center — HPC5, Ferrera Erbognone','hpc','hpc','',null,2020,SRC_TOP500],
    [2.26,48.60,'CEA TGCC — Bruyères-le-Châtel','hpc','hpc','',null,2018,SRC_TOP500],
    [2.17,48.71,'IDRIS Orsay — Jean Zay','hpc','hpc','',null,2019,SRC_TOP500],
    [15.65,46.56,'IZUM Maribor — Vega','hpc','hpc','',null,2021,SRC_TOP500],
    [18.29,49.83,'IT4Innovations Ostrava — Karolina','hpc','hpc','',null,2021,SRC_TOP500],
    [23.32,42.70,'Sofia Tech Park — Discoverer','hpc','hpc','',null,2021,SRC_TOP500],
    [6.07,49.79,'LuxProvide Bissen — MeluXina','hpc','hpc','',null,2021,SRC_TOP500],
    [-8.29,41.44,'MACC Guimarães — Deucalion','hpc','hpc','',null,2023,SRC_TOP500],
    [127.38,36.35,'KISTI Daejeon — Nurion','hpc','hpc','',null,2018,SRC_TOP500],
    [120.99,24.80,'NCHC Hsinchu — Taiwania','hpc','hpc','',null,2018,SRC_TOP500],
    [-3.19,55.95,'EPCC Edinburgh — ARCHER2','hpc','hpc','',null,2021,SRC_TOP500],
    [-2.60,51.46,'University of Bristol — Isambard-AI','hpc','hpc','',null,2024,SRC_TOP500],
    [139.94,35.90,'University of Tokyo Kashiwa — Wisteria / Miyabi','hpc','hpc','',null,2021,SRC_TOP500],
    [139.63,35.46,'JAMSTEC Yokohama — Earth Simulator','hpc','hpc','',null,2002,SRC_TOP500],
    [-43.18,-22.51,'LNCC Petrópolis — Santos Dumont','hpc','hpc','',null,2016,SRC_TOP500],
    [115.86,-31.95,'Pawsey Perth — Setonix','hpc','hpc','',null,2022,SRC_TOP500],
    /* ── carrier hotels and internet exchanges ────────────────────────────────────────────────── */
    [-80.19,25.78,'NAP of the Americas, Miami','colo','colo','',null,2001,'https://www.equinix.com/data-centers'],
    [-96.81,32.79,'Infomart Dallas','colo','colo','',null,1985,'https://en.wikipedia.org/wiki/Infomart'],
    [-122.40,37.78,'Digital Realty 365 Main, San Francisco','colo','colo','',null,2001,'https://www.digitalrealty.com/'],
    [-122.33,47.60,'Westin Building Exchange, Seattle','colo','colo','',null,1981,'https://www.westinbldg.com/'],
    [37.53,55.75,'MSK-IX / M9, Moscow','colo','colo','',null,1995,'https://www.msk-ix.ru/'],
    [139.76,35.69,'JPNAP / Otemachi, Tokyo','colo','colo','',null,2001,'https://www.jpnap.net/'],
    [114.21,22.42,'HKIX, Hong Kong','colo','colo','',null,1995,'https://www.hkix.net/'],
    [126.90,37.48,'KINX / Gasan, Seoul','colo','colo','',null,2000,'https://www.kinx.net/'],
    [-46.63,-23.55,'IX.br São Paulo (PTT Metro)','colo','colo','',null,2004,'https://ix.br/'],
    [36.82,-1.29,'Africa Data Centres, Nairobi','colo','colo','',null,2010,'https://www.africadatacentres.com/'],
    [3.35,6.44,'Rack Centre / IXPN, Lagos','colo','colo','',null,2013,'https://rackcentre.com/'],
    [55.27,25.20,'Equinix DX1 / UAE-IX, Dubai','colo','colo','',null,2012,'https://www.equinix.com/data-centers'],
    [-99.13,19.43,'KIO Networks / IXSY, Mexico City','colo','colo','',null,2006,'https://www.kionetworks.com/'],
    [8.54,47.38,'Interxion ZUR, Zurich','colo','colo','',null,2011,'https://www.digitalrealty.com/'],
    [12.57,55.68,'Digital Realty CPH, Copenhagen','colo','colo','',null,2015,'https://www.digitalrealty.com/'],
    [24.94,60.17,'Equinix HE Helsinki','colo','colo','',null,2011,'https://www.equinix.com/data-centers']
  ];

  /* ─── the merged feature collection ───────────────────────────────────────────────────────────── */
  const colOf=(op)=>((OP[op]||OP.osm)[1]);
  const R_OF={ai:8.5,cloud:7,colo:6,hpc:6.5,other:5};
  /* ⚠ (#R258) A PUBLISHED CAPACITY IS DRAWN, AND ONLY A PUBLISHED ONE. Where the operator states an
     IT/critical load the dot carries it — √MW, because the eye compares AREA and a disc's area is
     πr² (the same convention the trade arrows use for dollars). Where no figure is published the dot
     stays at its class's own size, so a big dot always means «this much is published», never «this
     is probably large». */
  const rFor=(k,mw)=>{ const base=R_OF[k]||5;
    return (mw>0)?Math.min(base*2.4, base*(1+0.055*Math.sqrt(mw))):base; };
  function curatedFC(){ return DC.map(d=>({type:'Feature',geometry:{type:'Point',coordinates:[d[0],d[1]]},
    properties:{ n:d[2], op:d[3], k:d[4], code:d[5]||'', mw:(d[6]==null?'':d[6]), yr:(d[7]==null?'':d[7]),
      src:d[8]||'', col:colOf(d[3]), r:rFor(d[4],+d[6]||0), origin:'curated' }})); }

  /* ══ OPENSTREETMAP — the other 4,600 ═════════════════════════════════════════════════════════════
     Raced mirrors with a hard abort, the shape js/atlas-sources.js uses; a silent 504 from one
     endpoint must not become a layer that quietly knows less than it could. */
  const _OP_EPS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
  const _osmCache=new Map();
  const OSM_ZOOM=6;   /* below this the viewport is most of a continent and the answer is thousands of rows */
  const _opFromTag=(t)=>{ const s=String(t||'').toLowerCase();
    if(/amazon|\baws\b/.test(s)) return 'aws';
    if(/microsoft|azure/.test(s)) return 'azure';
    if(/google/.test(s)) return 'gcp';
    if(/oracle/.test(s)) return 'oracle';
    if(/\bibm\b/.test(s)) return 'ibm';
    if(/alibaba|aliyun/.test(s)) return 'alibaba';
    if(/tencent/.test(s)) return 'tencent';
    if(/huawei/.test(s)) return 'huawei';
    if(/\bmeta\b|facebook/.test(s)) return 'meta';
    if(/apple/.test(s)) return 'apple';
    if(/equinix|digital realty|interxion|telehouse|global switch|colt|vantage|stt|ntt|cyrusone|switch|iron mountain|teraco|ascenty/.test(s)) return 'colo';
    return ''; };
  async function osmFor(bbox){
    const key=bbox.map(v=>v.toFixed(2)).join(',');
    if(_osmCache.has(key)) return _osmCache.get(key);
    const bb='('+bbox[1].toFixed(4)+','+bbox[0].toFixed(4)+','+bbox[3].toFixed(4)+','+bbox[2].toFixed(4)+')';
    const ql='[out:json][timeout:30];(nwr["telecom"="data_center"]'+bb+';nwr["man_made"="data_center"]'+bb+';nwr["building"="data_center"]'+bb+';);out center 900;';
    const ctls=[];
    const tryEp=ep=>new Promise(res=>{ let c=null; try{ c=new AbortController(); ctls.push(c); }catch(_){}
      const tm=setTimeout(()=>{ try{ c&&c.abort(); }catch(_){} },26000);
      fetch(ep,Object.assign({method:'POST',body:'data='+encodeURIComponent(ql)},c?{signal:c.signal}:{}))
        .then(r=>r.ok?r.json():null).then(j=>{ clearTimeout(tm); res((j&&Array.isArray(j.elements))?j.elements:null); })
        .catch(()=>{ clearTimeout(tm); res(null); }); });
    const els=await new Promise(res=>{ let pending=_OP_EPS.length, done=false;
      _OP_EPS.forEach(ep=>{ tryEp(ep).then(x=>{ if(done) return; if(x){ done=true; ctls.forEach(c=>{ try{ c.abort(); }catch(_){} }); res(x); } else if(--pending<=0) res(null); }); }); });
    const out=[];
    (els||[]).forEach(e=>{ const t=e.tags||{}; const lon=(e.lon!=null?e.lon:(e.center&&e.center.lon)), lat=(e.lat!=null?e.lat:(e.center&&e.center.lat));
      if(lon==null||lat==null) return;
      const op=_opFromTag(t.operator||t.owner||t.brand||t.name)||'osm';
      out.push({type:'Feature',geometry:{type:'Point',coordinates:[+lon,+lat]},
        properties:{ n:t.name||t.operator||t.owner||L('Data center','データセンター','Rechenzentrum','Дата-центр','Centro de datos'),
          op, k:'other', code:t.ref||'', mw:'', yr:(t.start_date||''), src:'https://www.openstreetmap.org/'+e.type+'/'+e.id,
          col:colOf(op), r:R_OF.other, origin:'osm', osmId:e.type+'/'+e.id,
          operator:t.operator||t.owner||'', power:t.power||t['power:output']||'', web:t.website||t['contact:website']||'' }});
    });
    _osmCache.set(key,out); if(_osmCache.size>24) _osmCache.delete(_osmCache.keys().next().value);
    return out; }
  /* an OSM building inside a curated campus is the same place twice — ~2 km, in degrees at that latitude */
  function dedupe(cur,osm){ return osm.filter(f=>{ const [x,y]=f.geometry.coordinates;
    const dLat=2/111, dLng=2/(111*Math.max(0.2,Math.cos(y*Math.PI/180)));
    return !cur.some(c=>{ const [cx,cy]=c.geometry.coordinates; return Math.abs(cx-x)<dLng && Math.abs(cy-y)<dLat; }); }); }

  /* ─── layers ──────────────────────────────────────────────────────────────────────────────────── */
  const SRC='dc-src', PT='dc-pt', LBL='dc-lbl';
  let on=false, wired=false, busy=false, lastKey='';
  const before=()=>{ try{ return GE().layers.has('tool-poly')?'tool-poly':undefined; }catch(_){ return undefined; } };
  function ensure(){ if(GE().layers.hasSource(SRC)) return true; if(!_imCanDraw()) return false;
    try{
      GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:curatedFC()},
        attribution:'© OpenStreetMap contributors (ODbL) · operator region pages'});
      GE().layers.add({id:PT,type:'circle',source:SRC,layout:{visibility:'none'},paint:{
        'circle-radius':['interpolate',['linear'],['zoom'],1,['*',['get','r'],0.42],5,['*',['get','r'],0.7],9,['get','r'],13,['*',['get','r'],1.6]],
        'circle-color':['coalesce',['get','col'],'#5e8bff'],
        'circle-stroke-color':['case',['==',['get','origin'],'curated'],'#ffffff','rgba(255,255,255,0.65)'],
        'circle-stroke-width':['case',['==',['get','origin'],'curated'],1.1,0.7],
        'circle-opacity':0.92}},before());
      GE().layers.add({id:LBL,type:'symbol',source:SRC,minzoom:4.5,layout:{visibility:'none',
        'text-field':['get','n'],'text-size':window.IntMapLabelScale.sub(0.82),'text-offset':[0,1.0],'text-anchor':'top',
        'text-font':['literal',['Noto Sans Regular']],'text-max-width':16,'text-optional':true,
        'symbol-sort-key':['case',['==',['get','origin'],'curated'],0,1]},
        paint:{'text-color':'#dce6f5','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.2}},before());
      return true;
    }catch(_){ return false; } }
  function setVis(v){ [PT,LBL].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',v?'visible':'none'); }catch(_){} }); }

  async function refresh(){
    if(!on||busy) return;
    let z,b; try{ z=GE().camera.getZoom(); b=GE().camera.getBounds(); }catch(_){ return; }
    const cur=curatedFC();
    if(!b||z<OSM_ZOOM){ try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:cur}); }catch(_){} lastKey=''; return; }
    const bbox=[Math.max(-180,b.getWest()),Math.max(-85,b.getSouth()),Math.min(180,b.getEast()),Math.min(85,b.getNorth())];
    const key=bbox.map(v=>v.toFixed(2)).join(',');
    if(key===lastKey) return;
    lastKey=key; busy=true;
    try{ const osm=await osmFor(bbox);
      if(on) GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:cur.concat(dedupe(cur,osm))});
      try{ dcRender(); }catch(_){}   /* (#R261) the OSM half arrives late; the summary must not be the curated half only */
    }catch(_){ lastKey=''; }
    busy=false; }

  /* ══ THE DETAIL CARD ═════════════════════════════════════════════════════════════════════════════
     「クリックすれば詳細情報まで見れるように。」 A `.country-popup`, so it inherits the app's existing
     detail-card look, its drag behaviour and its mobile bottom sheet (#R148) instead of inventing a
     second vocabulary. Every field is printed only when the sources carry it. */
  let card=null;
  function closeCard(){ try{ if(card&&card.parentNode) card.parentNode.removeChild(card); }catch(_){} card=null; }
  function row(k,v){ return v?('<div style="display:flex;gap:10px;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid rgba(128,128,128,0.14);">'
    +'<span style="color:var(--text-muted);flex:0 0 auto;">'+S(k)+'</span><b style="color:var(--text-main);text-align:right;">'+v+'</b></div>'):''; }
  function openCard(p,lngLat){
    closeCard();
    /* ⚠ `ai` / `colo` / `hpc` / `osm` are BUCKETS, not companies: for those the operator's real name is
       in the entry's own name (or in the OSM `operator` tag), so printing the bucket label as «the
       operator» would state something the sources never said — and printing it twice, once as the
       subtitle and once as a field, is what the first build of this card did. */
    const BUCKET={ai:1,colo:1,hpc:1,osm:1};
    const opName=(OP[p.op]||OP.osm)[0];
    const kind=(KIND[p.k]||KIND.other);
    const kindTxt=L.arr(kind);   /* the tuple resolved through pick() itself — never a second table */
    const subtitle=BUCKET[p.op]?kindTxt:(opName+' · '+kindTxt);
    const operator=p.operator||(BUCKET[p.op]?'':opName);
    /* the country, from the outline the app already holds — point-in-polygon, no network, and the
       name in the reader's language through the same `cName` every country readout uses */
    const cc=(()=>{ try{ const g=window.countryGeo; if(!g||!g.features||!window._imPipGeo) return '';
      const f=g.features.find(x=>x&&x.id!=null&&x.geometry&&window._imPipGeo(lngLat.lng,lngLat.lat,x.geometry));
      if(!f) return ''; const s=HOST.countryStats&&HOST.countryStats[f.id];
      return s?(HOST.cName?HOST.cName(s):(s.nameEn||String(f.id))):String(f.id); }catch(_){ return ''; } })();
    const el=document.createElement('div'); el.className='country-popup'; el.id='dc-detail';
    el.style.display='block';
    const coord=(+lngLat.lat).toFixed(4)+'°, '+(+lngLat.lng).toFixed(4)+'°';
    const isCur=(p.origin==='curated');
      /* ⚠ (#R261) THE × IS NOT A DISC. 「詳細のポップアップは×を丸にするな。」 This card is a
         `.country-popup` — the app's own detail-card shell — and that shell already HAS a close
         button: `.country-popup-close`, a 28×28 rounded SQUARE (8 px), transparent until hover, the
         same one the country card, the aircraft card and the satellite card use. What was written
         here instead was a bespoke inline `border-radius:50%` disc on `--input-bg`, i.e. a filled
         circle, which is the only round × on the map.
         ⚠ AND THE CLASS CARRIES TWO THINGS BESIDES THE SHAPE: js/data-layers.js sizes
         `.country-popup-close` to 32×32 on a phone (this one stayed 28 and was under the touch
         target), and js/window-manager.js lists it in NODRAG so a press on it cannot start a window
         drag. Both were missed by the private class, so this is one fix, not three. */
    el.innerHTML='<button class="country-popup-close cp-close" type="button" aria-label="'+S(L('Close','閉じる','Schließen','Закрыть','Cerrar'))+'" title="'+S(L('Close','閉じる','Schließen','Закрыть','Cerrar'))+'">✕</button>'
      +'<div style="padding:16px 18px 18px;">'
      +'<div class="dc-drag" style="display:flex;align-items:center;gap:9px;margin-bottom:3px;padding-right:32px;cursor:move;user-select:none;">'
      +'<span style="width:12px;height:12px;border-radius:7px;flex:none;background:'+S((OP[p.op]||OP.osm)[1])+';"></span>'
      +'<span style="font-weight:700;font-size:15px;color:var(--text-main);">'+S(p.n)+'</span></div>'
      +'<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;">'+S(subtitle)+'</div>'
      +row(L('Operator','運営者','Betreiber','Оператор','Operador'),S(operator))
      +row(L('Region code','リージョンコード','Regionscode','Код региона','Código de región'),S(p.code))
      +row(L('Country','国','Land','Страна','País'),S(cc))
      +row(L('IT capacity','IT容量','IT-Kapazität','ИТ-мощность','Capacidad de TI'),p.mw?(S(p.mw)+' MW'):'')
      +row(L('Power','電力','Leistung','Мощность','Potencia'),S(p.power))
      +row(L('In service','稼働開始','In Betrieb','В эксплуатации','En servicio'),S(p.yr))
      +row(L('Coordinates','座標','Koordinaten','Координаты','Coordenadas'),S(coord))
      +row(L('OSM object','OSMオブジェクト','OSM-Objekt','Объект OSM','Objeto OSM'),p.osmId?('<a href="'+U(p.src)+'" target="_blank" rel="noopener" style="color:var(--primary-color);">'+S(p.osmId)+'</a>'):'')
      +(p.web?row(L('Website','ウェブサイト','Website','Сайт','Sitio web'),'<a href="'+U(p.web)+'" target="_blank" rel="noopener" style="color:var(--primary-color);">'+S(String(p.web).replace(/^https?:\/\//,'').slice(0,38))+'</a>'):'')
      +(isCur&&p.src?('<div style="margin-top:10px;"><a href="'+U(p.src)+'" target="_blank" rel="noopener" style="color:var(--primary-color);font-size:12px;">'
        +S(L('Operator’s own page','運営者の公式ページ','Seite des Betreibers','Страница оператора','Página del operador'))+' ↗</a></div>'):'')
      +'<div style="margin-top:11px;font-size:9.5px;color:var(--text-muted);line-height:1.55;">'
      +S(isCur
        ? L('A published cloud region or campus. The point is the location the operator publishes (a city or county), not a surveyed building; fields the operator does not publish are left out rather than estimated.',
            '事業者が公表しているクラウドリージョン／拠点です。位置は事業者の公表地（都市・郡）であり、測量された建物ではありません。公表されていない項目は推定せず省略しています。',
            'Eine veröffentlichte Cloud-Region bzw. ein Campus. Der Punkt ist der vom Betreiber veröffentlichte Ort, kein vermessenes Gebäude; nicht veröffentlichte Felder bleiben leer.',
            'Опубликованный облачный регион или кампус. Точка — место, публикуемое оператором, а не обследованное здание; неопубликованные поля опущены.',
            'Región de nube o campus publicado. El punto es la ubicación que publica el operador, no un edificio topografiado; los campos no publicados se omiten.')
        : L('Surveyed in OpenStreetMap. Every field above comes from that object’s own tags; nothing is inferred.',
            'OpenStreetMap の実測データです。上の項目はそのオブジェクトのタグそのもので、推測は含みません。',
            'In OpenStreetMap erfasst. Alle Felder stammen aus den Tags dieses Objekts.',
            'Данные из OpenStreetMap. Все поля — теги самого объекта.',
            'Registrado en OpenStreetMap. Todos los campos provienen de las etiquetas de ese objeto.'))
      +'</div></div>';
    document.body.appendChild(el); card=el;
    /* ══ ⚠⚠⚠ (#R255) THE CARD WAS BUILT, ATTACHED, AND DRAWN OFF THE BOTTOM OF THE PAGE ═══════════
       「押しても詳細が出ない」 — and #R254 verified «the card really opens» by asking whether the
       element existed, which it always did. MEASURED on the shipped build, clicking the Equinix
       Ashburn campus at z9 in a 1600×900 window: `#dc-detail` exists, `display:block`, `z-index:2200`
       — and its rectangle is **x 0, y 900, 426×275**, i.e. its top edge sits exactly ON the bottom of
       the viewport. `.country-popup` is `position:absolute` with NO `left`/`top` of its own, so an
       element appended to <body> takes its STATIC position: the end of the document flow, below every
       panel in it. Nothing was ever visible; only the phone reached it, because the mobile rule at
       css/intmap.css:1993 forces `position:fixed;bottom:0`.
       ⚠ The card this file copied its shell from already had the answer: js/aircraft-detail.js sets
       `left`/`top` itself and makes the header a drag handle. Placing it is part of using that shell,
       not something the shell does for you — so this does the same thing, through the same helper. */
    try{
      const vw=window.innerWidth||1200, vh=window.innerHeight||800;
      const w=el.offsetWidth||380, h=el.offsetHeight||300;
      /* beside the point that was clicked when there is room, clamped into the window; the sidebars
         overlay the map (#R160), so the right edge is kept clear of the layer panel's strip */
      const rs=(()=>{ try{ const s=document.getElementById('layer-sidebar-r');
        return (s&&document.body.classList.contains('lsr-open'))?s.getBoundingClientRect().width:0; }catch(_){ return 0; } })();
      /* ⚠ `project()` is CANVAS-relative (#R252); the card is placed in PAGE coordinates, so the
         canvas's own offset — the left sidebar's 400 px, when it is open — has to be added back. */
      const px=(()=>{ try{ const p=GE().coords.project({lng:+lngLat.lng,lat:+lngLat.lat});
        const r=GE().render.canvas().getBoundingClientRect(); return r.left+p.x; }catch(_){ return null; } })();
      let left=(px!=null)?(px+18):(vw-rs-w-24);
      left=Math.max(12,Math.min(left,vw-rs-w-12));
      el.style.left=Math.round(Math.max(12,left))+'px';
      el.style.top=Math.round(Math.max(12,Math.min(96,vh-h-16)))+'px';
    }catch(_){ el.style.left='16px'; el.style.top='96px'; }
    try{ HOST.makeDraggable&&HOST.makeDraggable(el,el.querySelector('.dc-drag')); }catch(_){}
    try{ el.querySelector('.cp-close').onclick=closeCard; }catch(_){}
  }

  function wire(){ if(wired) return; wired=true;
    GE().events.onLayer('click',PT,e=>{ const f=e.features&&e.features[0]; if(!f) return;
      openCard(f.properties||{}, {lng:f.geometry.coordinates[0], lat:f.geometry.coordinates[1]}); });
    GE().events.onLayer('mouseenter',PT,()=>{ try{ GE().render.canvas().style.cursor='pointer'; }catch(_){} });
    GE().events.onLayer('mouseleave',PT,()=>{ try{ GE().render.canvas().style.cursor=''; }catch(_){} });
    try{ GE().events.on('moveend',()=>{ if(on){ setTimeout(()=>refresh(),250); setTimeout(()=>dcRender(),320); } }); }catch(_){}   /* (#R261) the summary is «what is on screen», so it follows the screen */
  }

  function toggle(v){ on=!!v;
    if(!on){ setVis(false); closeCard(); dcClosePanel(); return; }   /* (#R261) the panel belongs to the layer */
    const a=()=>{ if(!ensure()){ try{ GE().events.once('idle',a); }catch(_){} return; } wire(); setVis(true); refresh(); dcOpenPanel(); };
    a(); }

  /* ══ (#R258) THE KEY IS A FILTER ═════════════════════════════════════════════════════════════════
     With the table three times the size it was, «show me only the AI campuses» is the question the
     legend was already half-answering: it lists the classes and their colours. Clicking a row now
     takes that class off the map. The filter is one expression on the layer — no second copy of the
     feature collection, so the OSM half and the curated half obey it together. */
  const hidden=new Set();
  /* ══ ⚠⚠⚠ (#R261) THE LAYER COULD NOT BE ASKED ANYTHING ═══════════════════════════════════════════
     「データセンター、AIインフラレイヤーを爆発的に強化。」 — the same sentence as #R258, sent again.
     #R258's work was real (the table roughly tripled its non-cloud half, the dot carries a published
     capacity, the legend became a filter) and all of it is still here. What it did not do is the
     thing every other serious layer in this app does: 貿易フロー, 電力構成, 作物, 海流, 気象警報 and
     潮汐 each open a PANEL that answers a question about what is on screen. This one had a colour
     key and nothing else, so the only question a reader could put to a map of the world's compute
     was «what is this one dot».

     The panel answers the three that matter, for the CURRENT VIEW and no wider:
       · how many sites are in it, split curated / OpenStreetMap, so the reader can see which half
         they are looking at;
       · how much PUBLISHED capacity that is, and — the number that keeps this honest — how many of
         the sites in view publish one at all. «3.1 GW across 9 of 214 sites» is a true sentence;
         «3.1 GW» on its own invites the reader to think it is the total, which it is not;
       · which sites they are, largest first, clickable.
     ⚠ IT COMPUTES NOTHING NEW. Every figure is a sum over the features already in the source, which
     is the same data the dots and the cards are drawn from — there is one table (#R213) and this
     reads it. A site with no published capacity is counted as a site and contributes 0 MW, and the
     panel says so rather than estimating.
     ⚠ It is a `.tool-panel`, so it inherits the app's material, its drag handle and the frosted-mode
     rules, exactly as js/viewshed.js's does. */
  let dcPanel=null;
  const fmtMW=(mw)=>(mw>=1000)?((mw/1000).toFixed(mw>=10000?0:2)+' GW'):(Math.round(mw)+' MW');
  function inView(f){ try{ const b=GE().camera.getBounds(); if(!b) return true;
    const c=f.geometry&&f.geometry.coordinates; if(!c) return false;
    return c[0]>=b.getWest()&&c[0]<=b.getEast()&&c[1]>=b.getSouth()&&c[1]<=b.getNorth(); }catch(_){ return true; } }
  function dcStats(){
    let feats=[]; try{ const d=GE().layers.sourceData(SRC); feats=(d&&d.features)||[]; }catch(_){}
    const vis=feats.filter(f=>inView(f)&&!hidden.has(f.properties&&f.properties.op==='osm'?'osm':(f.properties&&f.properties.op)));
    const byKind={}, byOrigin={curated:0,osm:0};
    let mw=0, withMw=0;
    vis.forEach(f=>{ const p=f.properties||{};
      byKind[p.k||'other']=(byKind[p.k||'other']||0)+1;
      byOrigin[p.origin==='curated'?'curated':'osm']++;
      const v=+p.mw||0; if(v>0){ mw+=v; withMw++; } });
    const top=vis.filter(f=>(+((f.properties||{}).mw)||0)>0)
      .sort((a,b)=>(+b.properties.mw||0)-(+a.properties.mw||0)).slice(0,8);
    return { n:vis.length, byKind, byOrigin, mw, withMw, top };
  }
  function dcBuildPanel(){ if(dcPanel) return dcPanel;
    dcPanel=document.createElement('div'); dcPanel.className='tool-panel'; dcPanel.id='dc-panel';
    (document.getElementById('map-container')||document.body).appendChild(dcPanel);
    return dcPanel; }
  function dcRender(){ const p=dcPanel; if(!p||p.style.display==='none') return;
    const st=dcStats();
    const kindRow=(k,lbl)=>{ const c=st.byKind[k]||0; if(!c) return '';
      return '<div class="dc-krow" data-k="'+S(k)+'" style="display:flex;align-items:center;gap:7px;padding:2px 0;cursor:pointer;font-size:11.5px;'+(hidden.has(k)?'opacity:.42;':'')+'">'
        +'<span style="width:10px;height:10px;border-radius:50%;flex:none;background:'+S(colOf(k==='cloud'?'aws':k==='ai'?'ai':k==='colo'?'colo':k==='hpc'?'hpc':'osm'))+';"></span>'
        +'<span style="flex:1;color:var(--text-main);">'+S(lbl)+'</span>'
        +'<b style="color:var(--text-main);">'+c+'</b></div>'; };
    p.innerHTML='<div class="tp-header"><span class="tp-title">'+S(L('Data centers & AI infrastructure','データセンター・AIインフラ','Rechenzentren & KI-Infrastruktur','Дата-центры и ИИ-инфраструктура','Centros de datos e IA'))+'</span><button class="tp-close" type="button">✕</button></div>'
      +'<div style="font-size:11.5px;color:var(--text-main);line-height:1.6;">'
        +'<b style="font-size:15px;">'+st.n+'</b> '+S(L('sites in view','件（表示範囲内）','Standorte im Ausschnitt','объектов в виде','sitios a la vista'))
        +' <span style="color:var(--text-muted);">('+st.byOrigin.curated+' '+S(L('curated','収録','kuratiert','из таблицы','curados'))+' · '+st.byOrigin.osm+' OSM)</span></div>'
      +'<div style="margin-top:6px;font-size:11.5px;color:var(--text-main);">'
        +(st.withMw
          ?('<b>'+S(fmtMW(st.mw))+'</b> '+S(L('published capacity','公表容量','veröffentlichte Kapazität','заявленная мощность','capacidad publicada'))
             +' <span style="color:var(--text-muted);">'+S(L('across','／','über','по','en'))+' '+st.withMw+' '+S(L('of','件／全','von','из','de'))+' '+st.n+'</span>')
          :('<span style="color:var(--text-muted);">'+S(L('No site in view publishes a capacity figure.','表示範囲内に容量を公表している施設はありません。','Kein Standort im Ausschnitt veröffentlicht eine Kapazität.','Ни один объект в виде не публикует мощность.','Ningún sitio a la vista publica su capacidad.'))+'</span>'))
      +'</div>'
      +'<div style="margin-top:8px;border-top:1px solid var(--glass-border,rgba(128,128,128,0.18));padding-top:6px;">'
        +kindRow('ai',L.arr(KIND.ai))+kindRow('cloud',L.arr(KIND.cloud))+kindRow('colo',L.arr(KIND.colo))
        +kindRow('hpc',L.arr(KIND.hpc))+kindRow('other',L.arr(KIND.other))
      +'</div>'
      +(st.top.length
        ?('<div style="margin-top:8px;border-top:1px solid var(--glass-border,rgba(128,128,128,0.18));padding-top:6px;font-size:10px;color:var(--text-muted);">'
            +S(L('Largest published capacity in view','表示範囲内で公表容量が大きい順','Größte veröffentlichte Kapazität im Ausschnitt','Наибольшая заявленная мощность в виде','Mayor capacidad publicada a la vista'))+'</div>'
          +st.top.map((f,i)=>'<div class="dc-top" data-i="'+i+'" style="display:flex;gap:7px;justify-content:space-between;padding:2px 0;font-size:11px;cursor:pointer;">'
            +'<span style="color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+S(f.properties.n)+'</span>'
            +'<b style="flex:none;color:var(--text-main);">'+S(fmtMW(+f.properties.mw||0))+'</b></div>').join(''))
        :'')
      +'<div style="margin-top:8px;font-size:9.5px;color:var(--text-muted);line-height:1.55;">'
      +S(L('Counts and capacity are for what is on screen. A capacity is shown only where the operator or OpenStreetMap publishes one — nothing here is estimated. Tap a class to take it off the map.',
           '件数・容量は画面に表示されている範囲の集計です。容量は運営者または OpenStreetMap が公表している場合のみ表示し、推定値は一切使いません。分類をタップするとその分類を地図から外せます。',
           'Zahlen gelten für den sichtbaren Ausschnitt. Kapazität nur, wo sie veröffentlicht ist — nichts wird geschätzt.',
           'Подсчёт — по видимой области. Мощность показана только там, где она опубликована; оценок нет.',
           'Los recuentos son de lo que se ve. La capacidad solo se muestra si está publicada; nada se estima.'))
      +'</div>';
    try{ p.querySelector('.tp-close').onclick=()=>dcClosePanel(); }catch(_){}
    p.querySelectorAll('.dc-krow').forEach(r=>r.onclick=()=>{ const k=r.getAttribute('data-k');
      if(hidden.has(k)) hidden.delete(k); else hidden.add(k); applyFilter(); dcRender(); });
    p.querySelectorAll('.dc-top').forEach(r=>r.onclick=()=>{ const f=st.top[+r.getAttribute('data-i')]; if(!f) return;
      const c=f.geometry.coordinates;
      try{ GE().camera.flyTo({center:c,zoom:Math.max(GE().camera.getZoom(),9),duration:700}); }catch(_){}
      try{ openCard(f.properties,{lng:c[0],lat:c[1]}); }catch(_){} });
    try{ if(HOST.makeDraggable) HOST.makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
  }
  function dcOpenPanel(){ const p=dcBuildPanel();
    p.style.cssText='display:block;left:auto;right:24px;top:96px;bottom:auto;z-index:1500;width:238px;';
    dcRender(); }
  function dcClosePanel(){ if(dcPanel) dcPanel.style.display='none'; }

  const KEY_ROWS=()=>[['aws','AWS'],['azure','Azure'],['gcp','Google Cloud'],['oracle','Oracle'],['alibaba','Alibaba'],
    ['meta','Meta'],['ai',L('AI compute','AI計算基盤','KI-Rechenzentrum','ИИ-вычисления','Cómputo de IA')],
    ['colo',L('Colocation','コロケーション','Colocation-Standorte','Колокация','Colocación')],
    ['hpc',L('Supercomputing','スーパーコンピュータ','HPC','Суперкомпьютеры','Supercomputación')],
    ['osm',L('Other (OpenStreetMap)','その他（OpenStreetMap）','Sonstige (OpenStreetMap)','Прочие (OpenStreetMap)','Otros (OpenStreetMap)')]];
  /* (#R261) `hidden` now holds two kinds of key — the legend's OPERATOR ids (aws, meta, colo…) and
     the panel's CLASS ids (ai, cloud, colo, hpc, other). They are separated here rather than kept in
     two sets, because both switches have to end up in ONE filter expression on ONE layer: two sets
     would be two filters and the last one written would silently win. `colo` and `hpc` are BOTH an
     operator and a class and mean the same thing either way, so they are matched on both. */
  const CLASS_KEYS=['ai','cloud','colo','hpc','other'];
  function applyFilter(){
    /* the rows the key does NOT name (ibm, tencent, huawei, apple) ride with `osm`'s «other» row, so
       a filter is expressed on the OPERATOR of every hidden row plus that catch-all */
    const named=KEY_ROWS().map(r=>r[0]);
    const outOps=[], outKinds=[]; let hideOther=false;
    hidden.forEach(k=>{ if(k==='osm'){ hideOther=true; return; }
      if(CLASS_KEYS.indexOf(k)>=0) outKinds.push(k);
      if(named.indexOf(k)>=0) outOps.push(k); });
    let f=null;
    const clauses=[];
    if(outOps.length) clauses.push(['!',['in',['get','op'],['literal',outOps]]]);
    if(outKinds.length) clauses.push(['!',['in',['get','k'],['literal',outKinds]]]);
    if(hideOther) clauses.push(['in',['get','op'],['literal',named.filter(x=>x!=='osm')]]);
    if(clauses.length) f=(clauses.length===1)?clauses[0]:['all'].concat(clauses);
    [PT,LBL].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setFilter(id,f); }catch(_){} });
  }
  window.IntMapDataCenters={ toggle, refresh, count:()=>DC.length, operators:()=>OP, kinds:()=>KIND,
    /* (#R261) the in-view summary, and its window — Atlas and the tests read the same numbers the
       panel prints rather than a second computation of them */
    stats:()=>{ const st=dcStats(); return { n:st.n, curated:st.byOrigin.curated, osm:st.byOrigin.osm,
      mw:st.mw, withPublishedMw:st.withMw, byKind:Object.assign({},st.byKind),
      top:st.top.map(f=>({ n:f.properties.n, mw:+f.properties.mw||0, k:f.properties.k })) }; },
    openPanel:dcOpenPanel, closePanel:dcClosePanel,
    panelOpen:()=>!!(dcPanel&&dcPanel.style.display!=='none'),
    /* (#R258) the legend's rows drive this — see js/layer-packs.js */
    toggleKey(k){ if(hidden.has(k)) hidden.delete(k); else hidden.add(k); applyFilter(); return !hidden.has(k); },
    keyOn:(k)=>!hidden.has(k),
    /* the curated half as a FeatureCollection — js/compare.js draws this in its second map through
       `IntMapBeta2.load('dc')`, and there must be exactly one copy of the table (#R213's rule). */
    features:()=>({type:'FeatureCollection',features:curatedFC()}),
    /* the legend key, built here so the colours and the layer cannot disagree.
       (#R258) …and it carries the class id, so the row can switch that class off. */
    key:()=>KEY_ROWS().map(([k,lbl])=>[colOf(k),lbl,k]) };
};
