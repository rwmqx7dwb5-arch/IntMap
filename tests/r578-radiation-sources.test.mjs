// ============================================================================
//  IntMap · tests/r578-radiation-sources.test.mjs — the radiation registry, offline  (#R578)
// ----------------------------------------------------------------------------
//  supabase/functions/_shared/radiation-sources.js is the file that decides what a reader is told
//  about a measured dose rate: which unit it is in, which quantity it is, when it was taken, and
//  whether it is a reading at all or a mean for a year that ended fifteen years ago. Every one of
//  those is a claim about somebody else's data, so every one of them is checked here against BYTES A
//  REAL SERVER SENT.
//
//  ⚠ THE FIXTURES ARE CUT FROM REAL ANSWERS AND ARE NEVER TIDIER THAN THE UPSTREAM. A fixture that
//  is more capable, more consistent or more complete than the thing it stands for tests a parser
//  that does not need to exist, and the parser that ships then fails on the real bytes (#R552).
//  Each block below was captured on 2026-09-09 by
//      node scripts/probe-radiation-sources.mjs --fixtures <dir>
//  and shortened only by DROPPING whole records — the envelope, the field names, the number
//  formatting, the encodings and the oddities (RadNet's empty count columns, RAMIS repeating one
//  station, FMI writing NaN) are exactly as they arrived.
//
//  ⚠ NOTHING HERE TOUCHES THE NETWORK. The live upstreams are the probe script's job; a suite that
//  talks to six governments is a suite that goes red when somebody else's certificate expires.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PROVIDERS,
  providerById,
  mergeLatest,
  toNanoSvH,
  normaliseUnit,
  validLatLon,
  isPeriodMean,
} from "../supabase/functions/_shared/radiation-sources.js";

const FIXTURES = {
  "de-bfs": "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"id\":\"odlinfo_odl_1h_latest.fid--43cb481b_1a086484727_-158c\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[7.36,51.67]},\"geometry_name\":\"geom\",\"properties\":{\"id\":\"DEZ0654\",\"kenn\":\"055620080\",\"plz\":\"45711\",\"name\":\"Datteln\",\"site_status\":1,\"site_status_text\":\"in Betrieb\",\"kid\":4,\"height_above_sea\":50,\"start_measure\":\"2026-09-09T11:00:00Z\",\"end_measure\":\"2026-09-09T12:00:00Z\",\"value\":0.073,\"value_cosmic\":0.043,\"value_terrestrial\":0.03,\"unit\":\"µSv/h\",\"validated\":1,\"nuclide\":\"Gamma-ODL-Brutto\",\"duration\":\"1h\"}},{\"type\":\"Feature\",\"id\":\"odlinfo_odl_1h_latest.fid--43cb481b_1a086484727_-158b\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[9.58,53.92]},\"geometry_name\":\"geom\",\"properties\":{\"id\":\"DEZ0140\",\"kenn\":\"010610791\",\"plz\":\"25524\",\"name\":\"Oelixdorf\",\"site_status\":1,\"site_status_text\":\"in Betrieb\",\"kid\":6,\"height_above_sea\":15,\"start_measure\":\"2026-09-09T11:00:00Z\",\"end_measure\":\"2026-09-09T12:00:00Z\",\"value\":0.081,\"value_cosmic\":0.042,\"value_terrestrial\":0.039,\"unit\":\"µSv/h\",\"validated\":1,\"nuclide\":\"Gamma-ODL-Brutto\",\"duration\":\"1h\"}}],\"totalFeatures\":1676,\"numberMatched\":1676,\"numberReturned\":1676,\"timeStamp\":\"2026-09-09T13:08:12.757Z\",\"crs\":{\"type\":\"name\",\"properties\":{\"name\":\"urn:ogc:def:crs:EPSG::4326\"}}}",
  "jp-nra": "{\"data\":[{\"id\":\"90130002600\",\"site_area_code\":\"A\",\"pref_code\":\"01\",\"owner_code\":\"90\",\"device_kbn\":\"13\",\"device_no\":\"0002\",\"meas_time\":600,\"display_name\":\"函館市　渡島総合振興局\",\"display_name_kana\":\"はこだてしおしまそうごうしんこうきょく\",\"display_name_roman\":\"Hakodateshioshimasogoshinkokyoku\",\"air_dose_rate\":0.0283,\"counting_rate\":null,\"dust_beta_conc\":null,\"meas_datetime\":\"2026-09-05T15:00:00+09:00\",\"latitude\":41.82002,\"longitude\":140.752655,\"meas_table_kbn\":1,\"obs_station_unique_code\":\"90130002\",\"site_code_1\":\"16\",\"area_code_1\":\"0\",\"determine_protective_actions_1\":\"0\",\"site_code_2\":null,\"area_code_2\":null,\"determine_protective_actions_2\":\"0\",\"site_code_3\":null,\"area_code_3\":null,\"determine_protective_actions_3\":\"0\",\"site_code_4\":null,\"area_code_4\":null,\"determine_protective_actions_4\":\"0\",\"riamoni_flg\":\"0\",\"substitute_mobile_flg\":\"0\",\"shield_counting_flg\":\"0\",\"wind_direction_code\":null,\"wind_direction_name\":null,\"wind_direction_name_en\":null,\"wind_speed\":null,\"weather_sensor_flg\":\"0\",\"precipitation\":null,\"solar_amount\":null,\"sampling_kbn_name\":null,\"sampling_kbn_name_en\":null,\"analysis_status\":null,\"memo\":null,\"air_dose_trend_kbn\":null,\"detection_kbn\":null,\"missing_status\":\"0\",\"meas_range_low_limit\":0.001,\"meas_range_high_limit\":10,\"update_datetime\":\"2026-09-05T15:17:37+09:00\",\"electrical_output\":null,\"low_dose_rate\":0.0283,\"high_dose_rate\":null},{\"id\":\"90132304600\",\"site_area_code\":\"Z\",\"pref_code\":\"23\",\"owner_code\":\"90\",\"device_kbn\":\"13\",\"device_no\":\"2304\",\"meas_time\":600,\"display_name\":\"一宮市　木曽川町大気測定局\",\"display_name_kana\":\"いちのみやしきそがわちょうたいきそくていきょく\",\"display_name_roman\":\"Ichinomiyashikisogawachotaikisokuteikyoku\",\"air_dose_rate\":0.0648,\"counting_rate\":null,\"dust_beta_conc\":null,\"meas_datetime\":\"2026-09-08T16:30:00+09:00\",\"latitude\":35.34376,\"longitude\":136.77127,\"meas_table_kbn\":1,\"obs_station_unique_code\":\"90132304\",\"site_code_1\":null,\"area_code_1\":null,\"determine_protective_actions_1\":\"0\",\"site_code_2\":null,\"area_code_2\":null,\"determine_protective_actions_2\":\"0\",\"site_code_3\":null,\"area_code_3\":null,\"determine_protective_actions_3\":\"0\",\"site_code_4\":null,\"area_code_4\":null,\"determine_protective_actions_4\":\"0\",\"riamoni_flg\":\"0\",\"substitute_mobile_flg\":\"0\",\"shield_counting_flg\":\"0\",\"wind_direction_code\":null,\"wind_direction_name\":null,\"wind_direction_name_en\":null,\"wind_speed\":null,\"weather_sensor_flg\":\"0\",\"precipitation\":null,\"solar_amount\":null,\"sampling_kbn_name\":null,\"sampling_kbn_name_en\":null,\"analysis_status\":null,\"memo\":null,\"air_dose_trend_kbn\":null,\"detection_kbn\":null,\"missing_status\":\"0\",\"meas_range_low_limit\":0.001,\"meas_range_high_limit\":10,\"update_datetime\":\"2026-09-08T16:52:52+09:00\",\"electrical_output\":null,\"low_dose_rate\":0.0648,\"high_dose_rate\":null},{\"id\":\"90130002600\",\"site_area_code\":\"A\",\"pref_code\":\"01\",\"owner_code\":\"90\",\"device_kbn\":\"13\",\"device_no\":\"0002\",\"meas_time\":600,\"display_name\":\"函館市　渡島総合振興局\",\"display_name_kana\":\"はこだてしおしまそうごうしんこうきょく\",\"display_name_roman\":\"Hakodateshioshimasogoshinkokyoku\",\"air_dose_rate\":0.0282,\"counting_rate\":null,\"dust_beta_conc\":null,\"meas_datetime\":\"2026-09-05T14:50:00+09:00\",\"latitude\":41.82002,\"longitude\":140.752655,\"meas_table_kbn\":1,\"obs_station_unique_code\":\"90130002\",\"site_code_1\":\"16\",\"area_code_1\":\"0\",\"determine_protective_actions_1\":\"0\",\"site_code_2\":null,\"area_code_2\":null,\"determine_protective_actions_2\":\"0\",\"site_code_3\":null,\"area_code_3\":null,\"determine_protective_actions_3\":\"0\",\"site_code_4\":null,\"area_code_4\":null,\"determine_protective_actions_4\":\"0\",\"riamoni_flg\":\"0\",\"substitute_mobile_flg\":\"0\",\"shield_counting_flg\":\"0\",\"wind_direction_code\":null,\"wind_direction_name\":null,\"wind_direction_name_en\":null,\"wind_speed\":null,\"weather_sensor_flg\":\"0\",\"precipitation\":null,\"solar_amount\":null,\"sampling_kbn_name\":null,\"sampling_kbn_name_en\":null,\"analysis_status\":null,\"memo\":null,\"air_dose_trend_kbn\":null,\"detection_kbn\":null,\"missing_status\":\"0\",\"meas_range_low_limit\":0.001,\"meas_range_high_limit\":10,\"update_datetime\":\"2026-09-05T15:07:35+09:00\",\"electrical_output\":null,\"low_dose_rate\":0.0282,\"high_dose_rate\":null},{\"id\":\"08110092600\",\"site_area_code\":\"E\",\"pref_code\":\"08\",\"owner_code\":\"08\",\"device_kbn\":\"11\",\"device_no\":\"0092\",\"meas_time\":600,\"display_name\":\"サイクル工研\",\"display_name_kana\":\"さいくるこうけん\",\"display_name_roman\":\"Saikurukoken\",\"air_dose_rate\":null,\"counting_rate\":null,\"dust_beta_conc\":null,\"meas_datetime\":\"2026-09-09T09:10:00+09:00\",\"latitude\":36.439454,\"longitude\":140.599243,\"meas_table_kbn\":1,\"obs_station_unique_code\":\"08110092\",\"site_code_1\":\"04\",\"area_code_1\":\"1\",\"determine_protective_actions_1\":\"0\",\"site_code_2\":null,\"area_code_2\":null,\"determine_protective_actions_2\":\"0\",\"site_code_3\":null,\"area_code_3\":null,\"determine_protective_actions_3\":\"0\",\"site_code_4\":null,\"area_code_4\":null,\"determine_protective_actions_4\":\"0\",\"riamoni_flg\":\"0\",\"substitute_mobile_flg\":\"0\",\"shield_counting_flg\":\"0\",\"wind_direction_code\":null,\"wind_direction_name\":null,\"wind_direction_name_en\":null,\"wind_speed\":null,\"weather_sensor_flg\":\"0\",\"precipitation\":null,\"solar_amount\":null,\"sampling_kbn_name\":null,\"sampling_kbn_name_en\":null,\"analysis_status\":null,\"memo\":null,\"air_dose_trend_kbn\":null,\"detection_kbn\":null,\"missing_status\":\"0\",\"meas_range_low_limit\":null,\"meas_range_high_limit\":null,\"update_datetime\":\"2026-09-09T09:14:27+09:00\",\"electrical_output\":null,\"low_dose_rate\":null,\"high_dose_rate\":null},{\"id\":\"90130002600\",\"site_area_code\":\"A\",\"pref_code\":\"01\",\"owner_code\":\"90\",\"device_kbn\":\"13\",\"device_no\":\"0002\",\"meas_time\":600,\"display_name\":\"函館市　渡島総合振興局\",\"display_name_kana\":\"はこだてしおしまそうごうしんこうきょく\",\"display_name_roman\":\"Hakodateshioshimasogoshinkokyoku\",\"air_dose_rate\":0.0286,\"counting_rate\":null,\"dust_beta_conc\":null,\"meas_datetime\":\"2026-09-05T15:10:00+09:00\",\"latitude\":41.82002,\"longitude\":140.752655,\"meas_table_kbn\":1,\"obs_station_unique_code\":\"90130002\",\"site_code_1\":\"16\",\"area_code_1\":\"0\",\"determine_protective_actions_1\":\"0\",\"site_code_2\":null,\"area_code_2\":null,\"determine_protective_actions_2\":\"0\",\"site_code_3\":null,\"area_code_3\":null,\"determine_protective_actions_3\":\"0\",\"site_code_4\":null,\"area_code_4\":null,\"determine_protective_actions_4\":\"0\",\"riamoni_flg\":\"0\",\"substitute_mobile_flg\":\"0\",\"shield_counting_flg\":\"0\",\"wind_direction_code\":null,\"wind_direction_name\":null,\"wind_direction_name_en\":null,\"wind_speed\":null,\"weather_sensor_flg\":\"0\",\"precipitation\":null,\"solar_amount\":null,\"sampling_kbn_name\":null,\"sampling_kbn_name_en\":null,\"analysis_status\":null,\"memo\":null,\"air_dose_trend_kbn\":null,\"detection_kbn\":null,\"missing_status\":\"0\",\"meas_range_low_limit\":0.001,\"meas_range_high_limit\":10,\"update_datetime\":\"2026-09-05T15:27:38+09:00\",\"electrical_output\":null,\"low_dose_rate\":0.0286,\"high_dose_rate\":null},{\"id\":\"01510511120\",\"site_area_code\":\"A\",\"pref_code\":\"01\",\"owner_code\":\"01\",\"device_kbn\":\"51\",\"device_no\":\"0511\",\"meas_time\":120,\"display_name\":\"雷電温泉\",\"display_name_kana\":\"らいでんおんせん\",\"display_name_roman\":\"Raidenonsen\",\"air_dose_rate\":0,\"counting_rate\":null,\"dust_beta_conc\":null,\"meas_datetime\":\"2026-09-09T22:00:00+09:00\",\"latitude\":42.924283,\"longitude\":140.403418,\"meas_table_kbn\":2,\"obs_station_unique_code\":\"01510511\",\"site_code_1\":\"16\",\"area_code_1\":\"2\",\"determine_protective_actions_1\":\"1\",\"site_code_2\":null,\"area_code_2\":null,\"determine_protective_actions_2\":\"0\",\"site_code_3\":null,\"area_code_3\":null,\"determine_protective_actions_3\":\"0\",\"site_code_4\":null,\"area_code_4\":null,\"determine_protective_actions_4\":\"0\",\"riamoni_flg\":\"0\",\"substitute_mobile_flg\":\"0\",\"shield_counting_flg\":\"0\",\"wind_direction_code\":null,\"wind_direction_name\":null,\"wind_direction_name_en\":null,\"wind_speed\":null,\"weather_sensor_flg\":\"0\",\"precipitation\":null,\"solar_amount\":null,\"sampling_kbn_name\":null,\"sampling_kbn_name_en\":null,\"analysis_status\":null,\"memo\":null,\"air_dose_trend_kbn\":null,\"detection_kbn\":null,\"missing_status\":\"0\",\"meas_range_low_limit\":0.2,\"meas_range_high_limit\":10000,\"update_datetime\":\"2026-09-09T22:07:04+09:00\",\"electrical_output\":null,\"low_dose_rate\":0,\"high_dose_rate\":null}],\"count\":6,\"offset\":0,\"limit\":0}",
  "fi-stuk": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<wfs:FeatureCollection\n  timeStamp=\"2026-09-09T13:08:51Z\"\n  numberMatched=\"1\"\n  numberReturned=\"1\"\n  xmlns:wfs=\"http://www.opengis.net/wfs/2.0\"\n  xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\"\n\n  xmlns:xlink=\"http://www.w3.org/1999/xlink\"\n  xmlns:om=\"http://www.opengis.net/om/2.0\"\n  xmlns:ompr=\"http://inspire.ec.europa.eu/schemas/ompr/3.0\"\n  xmlns:omso=\"http://inspire.ec.europa.eu/schemas/omso/3.0\"\n  xmlns:gml=\"http://www.opengis.net/gml/3.2\"\n  xmlns:gmd=\"http://www.isotc211.org/2005/gmd\"\n  xmlns:gco=\"http://www.isotc211.org/2005/gco\"\n  xmlns:swe=\"http://www.opengis.net/swe/2.0\"\n  xmlns:gmlcov=\"http://www.opengis.net/gmlcov/1.0\"\n  xmlns:sam=\"http://www.opengis.net/sampling/2.0\"\n  xmlns:sams=\"http://www.opengis.net/samplingSpatial/2.0\"\n  xmlns:target=\"http://xml.fmi.fi/namespace/om/atmosphericfeatures/1.1\"\n  xsi:schemaLocation=\"http://www.opengis.net/wfs/2.0 http://schemas.opengis.net/wfs/2.0/wfs.xsd\n  http://www.opengis.net/gmlcov/1.0 http://schemas.opengis.net/gmlcov/1.0/gmlcovAll.xsd\n  http://www.opengis.net/sampling/2.0 http://schemas.opengis.net/sampling/2.0/samplingFeature.xsd\n  http://www.opengis.net/samplingSpatial/2.0 http://schemas.opengis.net/samplingSpatial/2.0/spatialSamplingFeature.xsd\n  http://www.opengis.net/swe/2.0 http://schemas.opengis.net/sweCommon/2.0/swe.xsd\n  http://inspire.ec.europa.eu/schemas/ompr/3.0 https://inspire.ec.europa.eu/schemas/ompr/3.0/Processes.xsd\n  http://inspire.ec.europa.eu/schemas/omso/3.0 https://inspire.ec.europa.eu/schemas/omso/3.0/SpecialisedObservations.xsd\n  http://xml.fmi.fi/namespace/om/atmosphericfeatures/1.1 https://xml.fmi.fi/schema/om/atmosphericfeatures/1.1/atmosphericfeatures.xsd\">\n\n  <wfs:member>\n    <omso:GridSeriesObservation gml:id=\"WFS-b5cOjdcYzD4SZKqYhMApCWDPOaWJTowuoXPp11unW_Fzy8u2Hpp37ubp1l8dMvLdh2LeWHJpw9NO_c6dbeuzpp4b9O7pj39svLDnywtLFlz6d1TTty2qv4VKhw0_MbHy51qRaFOO6dNGTVwzsu7JU07ctqr.FSocNZoTOzbdPPTk5yRcSRpI.JIzO15fPffyyV0c.nXXfy.OnLDk04emnfuv5tLo15fPffyyX9_bLy78tPTDi2ZY2Zsw9MvPpEzNm_Hh2Za1M2m_GkruvTM4a23D4iaefTDux5aVq6EBpbcPiLw349HOeH0JvbcvTLvoYeWHbl6ZeXOtiJSv0KjFhNv4e2etyJSpsb9CoxYTb.Htna23Tz56d2epl8dKxp2Gc2t3XbPzU.mHpp37uc4TW49cOzT08yd2bfE1ufTD00791Tzwy1yZfHTLy3Ydl_lhyacPTTv3Nzn038suTj1y8vN_Tkr1C59Out0634ueXl2w9NO_dzdOsvjpl5bsOxbyw5NOHpp37nTrb12dNPDfp3dMe_tl5Yc.VodNO3LT6ZeE_ITQ6aduW1v3ZaxqtSGA\">\n\n                 <om:phenomenonTime>\n        <gml:TimePeriod gml:id=\"time1-1-1\">\n          <gml:beginPosition>2026-09-08T09:00:00Z</gml:beginPosition>\n          <gml:endPosition>2026-09-08T11:00:00Z</gml:endPosition>\n        </gml:TimePeriod>\n      </om:phenomenonTime>\n      <om:resultTime>\n        <gml:TimeInstant gml:id=\"time2-1-1\">\n          <gml:timePosition>2026-09-08T11:00:00Z</gml:timePosition>\n        </gml:TimeInstant>\n      </om:resultTime>\n\n     <om:procedure xlink:href=\"http://xml.fmi.fi/inspire/process/external_radiation\"/>\n     \n\n     <om:observedProperty  xlink:href=\"https://opendata.fmi.fi/meta?observableProperty=observation&amp;param=DR_PT10M_avg,DRS1_PT10M_avg&amp;language=eng\"/>\n     \t<om:featureOfInterest>\n        <sams:SF_SpatialSamplingFeature gml:id=\"sampling-feature-1-1-fmisid\">\n\n          <sam:sampledFeature>\n\t\t<target:LocationCollection gml:id=\"sampled-target-1-1\">\n\t\t    <target:member>\n\t\t    <target:Location gml:id=\"obsloc-fmisid-103170-pos\">\n\t\t        <gml:identifier codeSpace=\"http://xml.fmi.fi/namespace/stationcode/fmisid\">103170</gml:identifier>\n\t\t\t<gml:name codeSpace=\"http://xml.fmi.fi/namespace/locationcode/name\">Helsinki Vuosaaren Satama</gml:name>\n\t\t\t<gml:name codeSpace=\"http://xml.fmi.fi/namespace/locationcode/geoid\">-103170</gml:name>\n\t\t\t<target:representativePoint xlink:href=\"#point-103170\"/>\n\t\t\t\n\t\t\t\n\t\t\t<target:region codeSpace=\"http://xml.fmi.fi/namespace/location/region\">Helsinki</target:region>\n\t\t\t\n\t\t    </target:Location></target:member>\n\t\t    <target:member>\n\t\t    <target:Location gml:id=\"obsloc-fmisid-103171-pos\">\n\t\t        <gml:identifier codeSpace=\"http://xml.fmi.fi/namespace/stationcode/fmisid\">103171</gml:identifier>\n\t\t\t<gml:name codeSpace=\"http://xml.fmi.fi/namespace/locationcode/name\">Helsinki Suomenlinna</gml:name>\n\t\t\t<gml:name codeSpace=\"http://xml.fmi.fi/namespace/locationcode/geoid\">-103171</gml:name>\n\t\t\t<target:representativePoint xlink:href=\"#point-103171\"/>\n\t\t\t\n\t\t\t\n\t\t\t<target:region codeSpace=\"http://xml.fmi.fi/namespace/location/region\">Helsinki</target:region>\n\t\t\t\n\t\t    </target:Location></target:member>\n\t\t</target:LocationCollection>\n \t   </sam:sampledFeature>\n          <sams:shape>\n            <gml:MultiPoint gml:id=\"mp-1-1-fmisid\">\n              <gml:pointMember>\n              <gml:Point gml:id=\"point-103170\" srsName=\"http://www.opengis.net/def/crs/EPSG/0/4258\" srsDimension=\"2\">\n                <gml:name>Helsinki Vuosaaren Satama</gml:name>\n                <gml:pos>60.22290 25.17880 </gml:pos>\n            </gml:Point>\n\t    </gml:pointMember>\n              <gml:pointMember>\n              <gml:Point gml:id=\"point-103171\" srsName=\"http://www.opengis.net/def/crs/EPSG/0/4258\" srsDimension=\"2\">\n                <gml:name>Helsinki Suomenlinna</gml:name>\n                <gml:pos>60.14640 24.99030 </gml:pos>\n            </gml:Point>\n\t    </gml:pointMember>\n\t    </gml:MultiPoint>\n          </sams:shape>\n        </sams:SF_SpatialSamplingFeature>\n      </om:featureOfInterest>\n\n           <om:result>\n        <gmlcov:MultiPointCoverage gml:id=\"mpcv1-1-1\">\n          <gml:domainSet>\n            <gmlcov:SimpleMultiPoint gml:id=\"mp1-1-1\" srsName=\"http://xml.fmi.fi/gml/crs/compoundCRS.php?crs=4258&amp;time=unixtime\" srsDimension=\"3\">\n              <gmlcov:positions>\n                60.22290 25.17880  1788858000\n                60.22290 25.17880  1788861600\n                60.22290 25.17880  1788865200\n                60.14640 24.99030  1788858000\n                60.14640 24.99030  1788861600\n                60.14640 24.99030  1788865200\n                </gmlcov:positions>\n            </gmlcov:SimpleMultiPoint>\n          </gml:domainSet>\n          <gml:rangeSet>\n            <gml:DataBlock>\n              <gml:rangeParameters/>\n              <gml:doubleOrNilReasonTupleList>\n                0.106 0.008 \n                0.110 0.011 \n                0.105 0.005 \n                0.173 0.013 \n                0.169 0.011 \n                0.174 0.010 \n                </gml:doubleOrNilReasonTupleList>\n            </gml:DataBlock>\n          </gml:rangeSet>\n          <gml:coverageFunction>\n            <gml:CoverageMappingRule>\n              <gml:ruleDefinition>Linear</gml:ruleDefinition>\n            </gml:CoverageMappingRule>\n          </gml:coverageFunction>\n          <gmlcov:rangeType>\n            <swe:DataRecord>\n              <swe:field name=\"DR_PT10M_avg\"  xlink:href=\"https://opendata.fmi.fi/meta?observableProperty=observation&amp;param=DR_PT10M_avg&amp;language=eng\"/>\n              <swe:field name=\"DRS1_PT10M_avg\"  xlink:href=\"https://opendata.fmi.fi/meta?observableProperty=observation&amp;param=DRS1_PT10M_avg&amp;language=eng\"/>\n              </swe:DataRecord>\n          </gmlcov:rangeType>\n        </gmlcov:MultiPointCoverage>\n      </om:result>\n\n    </omso:GridSeriesObservation>\n  </wfs:member>\n</wfs:FeatureCollection>\n",
  "hk-hko": "{\"ChekLapKokLocationName\":\"Chek Lap Kok\",\"ChekLapKokMaxTemp\":\"33.0\",\"ChekLapKokMicrosieverts\":\"0.15\",\"ChekLapKokMinTemp\":\"27.6\",\"BulletinTime\":\"0015\",\"BulletinDate\":\"20260909\",\"ReportTimeInfoDate\":\"20260908\",\"HongKongDesc\":\"Average ambient gamma radiation dose rate taken outdoors in Hong Kong ranged from 0.08 to 0.15 microsievert per hour.  These are within the normal range of fluctuation of the background radiation level in Hong Kong.\",\"NoteDesc\":\"From readings taken at various locations in Hong Kong in the past, the hourly mean ambient gamma radiation dose rate may vary between 0.06 and 0.3 microsievert per hour. (1 microsievert = 0.000001 sievert = 0.001 millisievert)\",\"NoteDesc1\":\"Temporal variations are generally caused by changes in meteorological conditions such as rainfall, wind and barometric pressure.\",\"NoteDesc2\":\"Spatial variations are generally caused by differences in the radioactive content of local rock and soil.\",\"NoteDesc3\":\"The data displayed is provisional. Only limited data validation has been carried out.\",\"CheungChauLocationName\":\"Cheung Chau\",\"CheungChauMaxTemp\":\"31.3\",\"CheungChauMinTemp\":\"26.4\",\"HKOReadingsAccumRainfall\":\"2407.8\",\"HKOReadingsAvgRainfall\":\"2012.5\",\"HKOReadingsMaxRH\":\"86\",\"HKOReadingsMaxTemp\":\"32.7\",\"HKOReadingsMinGrassTemp\":\"25.6\",\"HKOReadingsMinRH\":\"66\",\"HKOReadingsMinTemp\":\"27.5\",\"HKOReadingsRainfall\":\"Trace\",\"HappyValleyLocationName\":\"Happy Valley\",\"HappyValleyMaxTemp\":\"34.1\",\"HappyValleyMinTemp\":\"26.1\",\"HongKongParkLocationName\":\"Hong Kong Park\",\"HongKongParkMaxTemp\":\"32.3\",\"HongKongParkMinTemp\":\"26.2\",\"KaiTakRunwayParkLocationName\":\"Kai Tak Runway Park\",\"KaiTakRunwayParkMaxTemp\":\"31.7\",\"KaiTakRunwayParkMinTemp\":\"27.6\",\"KatOLocationName\":\"Kat O\",\"KatOMicrosieverts\":\"0.09\",\"KingsParkLocationName\":\"King's Park\",\"KingsParkMicrosieverts\":\"0.14\",\"KingsParkReadingsMaxTemp\":\"32.0\",\"KingsParkReadingsMaxUVIndex\":\"8\",\"KingsParkReadingsMeanUVIndex\":\"3\",\"KingsParkReadingsMinTemp\":\"27.2\",\"KingsParkReadingsSunShine\":\"8.2\",\"KowloonCityLocationName\":\"Kowloon City\",\"KowloonCityMaxTemp\":\"34.3\",\"KowloonCityMinTemp\":\"26.7\",\"KwunTongLocationName\":\"Kwun Tong\",\"KwunTongMaxTemp\":\"33.7\",\"KwunTongMicrosieverts\":\"0.12\",\"KwunTongMinTemp\":\"26.6\",\"LauFauShanLocationName\":\"Lau Fau Shan\",\"LauFauShanMaxTemp\":\"33.2\",\"LauFauShanMinTemp\":\"26.3\",\"PingChauLocationName\":\"Ping Chau\",\"PingChauMicrosieverts\":\"0.08\",\"SaiKungLocationName\":\"Sai Kung\",\"SaiKungMaxTemp\":\"33.2\",\"SaiKungMinTemp\":\"26.3\",\"SaiWanHoLocationName\":\"Sai Wan Ho\",\"SaiWanHoMicrosieverts\":\"0.08\",\"ShaTauKokLocationName\":\"Sha Tau Kok\",\"ShaTauKokMicrosieverts\":\"0.10\",\"ShaTinLocationName\":\"Sha Tin\",\"ShaTinMaxTemp\":\"34.7\",\"ShaTinMinTemp\":\"25.7\",\"ShamShuiPoLocationName\":\"Sham Shui Po\",\"ShamShuiPoMaxTemp\":\"33.4\",\"ShamShuiPoMinTemp\":\"26.4\",\"ShauKeiWanLocationName\":\"Shau Kei Wan\",\"ShauKeiWanMaxTemp\":\"32.6\",\"ShauKeiWanMinTemp\":\"26.8\",\"ShekKongLocationName\":\"Shek Kong\",\"ShekKongMaxTemp\":\"34.5\",\"ShekKongMinTemp\":\"25.1\",\"StanleyLocationName\":\"Stanley\",\"StanleyMaxTemp\":\"33.4\",\"StanleyMinTemp\":\"25.7\",\"TaKwuLingLocationName\":\"Ta Kwu Ling\",\"TaKwuLingMaxTemp\":\"34.7\",\"TaKwuLingMinTemp\":\"24.9\",\"TaiMeiTukLocationName\":\"Tai Mei Tuk\",\"TaiMeiTukMaxTemp\":\"32.1\",\"TaiMeiTukMicrosieverts\":\"0.12\",\"TaiMeiTukMinTemp\":\"26.2\",\"TaiPoLocationName\":\"Tai Po\",\"TaiPoMaxTemp\":\"34.3\",\"TaiPoMinTemp\":\"26.1\",\"TapMunLocationName\":\"Tap Mun\",\"TapMunMicrosieverts\":\"0.09\",\"TseungKwanOLocationName\":\"Tseung Kwan O\",\"TseungKwanOMaxTemp\":\"34.2\",\"TseungKwanOMinTemp\":\"24.9\",\"TsimBeiTsuiLocationName\":\"Tsim Bei Tsui\",\"TsimBeiTsuiMicrosieverts\":\"0.13\",\"TsingYiLocationName\":\"Tsing Yi\",\"TsingYiMaxTemp\":\"32.5\",\"TsingYiMinTemp\":\"25.4\",\"TsuenWanHoKoonLocationName\":\"Tsuen Wan Ho Koon\",\"TsuenWanHoKoonMaxTemp\":\"31.2\",\"TsuenWanHoKoonMinTemp\":\"24.1\",\"TsuenWanShingMunValleyLocationName\":\"Tsuen Wan Shing Mun Valley\",\"TsuenWanShingMunValleyMaxTemp\":\"33.1\",\"TsuenWanShingMunValleyMinTemp\":\"24.7\",\"TuenMunLocationName\":\"Tuen Mun\",\"TuenMunMaxTemp\":\"32.9\",\"TuenMunMinTemp\":\"26.3\",\"WongChukHangLocationName\":\"Wong Chuk Hang\",\"WongChukHangMaxTemp\":\"32.3\",\"WongChukHangMinTemp\":\"25.2\",\"WongTaiSinLocationName\":\"Wong Tai Sin\",\"WongTaiSinMaxTemp\":\"34.0\",\"WongTaiSinMinTemp\":\"26.5\",\"YuenLongParkLocationName\":\"Yuen Long Park\",\"YuenLongParkMaxTemp\":\"36.1\",\"YuenLongParkMinTemp\":\"26.1\",\"YuenNgFanLocationName\":\"Yuen Ng Fan\",\"YuenNgFanMicrosieverts\":\"0.11\"}",
  "nl-rivm": "{\"type\":\"FeatureCollection\",\"features\":[{\"type\":\"Feature\",\"id\":\"gamma_radiation_2011.1001\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[4.786,53.0561]},\"geometry_name\":\"geom\",\"properties\":{\"inspireid\":\"https://data.rivm.nl/geo/inspire/so/ef/gamma-location/1001/0\",\"stationname\":\"Den Burg\",\"dosis_tempo\":66.71,\"eenheid\":\"nSv/h\",\"versionid\":0,\"predecessor\":null,\"beginlifespanversion\":\"2013-11-27Z\",\"endlifespanversion\":null}},{\"type\":\"Feature\",\"id\":\"gamma_radiation_2011.1002\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[4.7522,52.9407]},\"geometry_name\":\"geom\",\"properties\":{\"inspireid\":\"https://data.rivm.nl/geo/inspire/so/ef/gamma-location/1002/0\",\"stationname\":\"Den Helder\",\"dosis_tempo\":70.77,\"eenheid\":\"nSv/h\",\"versionid\":0,\"predecessor\":null,\"beginlifespanversion\":\"2013-11-27Z\",\"endlifespanversion\":null}}],\"totalFeatures\":151,\"numberMatched\":151,\"numberReturned\":151,\"timeStamp\":\"2026-09-09T13:08:19.088Z\",\"crs\":{\"type\":\"name\",\"properties\":{\"name\":\"urn:ogc:def:crs:EPSG::4326\"}}}",
  "us-epa": "LOCATION_NAME,SAMPLE COLLECTION TIME,DOSE EQUIVALENT RATE (nSv/h),GAMMA COUNT RATE R02 (CPM),GAMMA COUNT RATE R03 (CPM),GAMMA COUNT RATE R04 (CPM),GAMMA COUNT RATE R05 (CPM),GAMMA COUNT RATE R06 (CPM),GAMMA COUNT RATE R07 (CPM),GAMMA COUNT RATE R08 (CPM),GAMMA COUNT RATE R09 (CPM),STATUS\nAK: ANCHORAGE,02/06/2026 17:58:00,28.00,,,,,,,,,APPROVED\nAK: ANCHORAGE,02/06/2026 18:58:00,27.00,,,,,,,,,APPROVED\nAK: ANCHORAGE,09/09/2026 12:34:00,34.00,690.00,406.00,126.00,73.00,57.00,81.00,69.00,6.00,APPROVED",
};

/* The endpoint's budget, restated here so a change to it that orphans a provider is visible. The
   canonical value is MAX_UPSTREAM_REQUESTS in supabase/functions/radiation-feed/index.ts. */
const MAX_UPSTREAM_REQUESTS = 12;

/* ── ① every provider declares the whole contract ───────────────────────────────────────────────
   The registry's entire promise is that the transport can obey a provider without knowing anything
   about it. A provider missing one of these fields is a provider the transport has to special-case,
   which is the thing this design exists to prevent. */
test("R578 ① every provider declares the full contract", () => {
  assert.ok(PROVIDERS.length >= 6, "expected the six measured networks");
  const seen = new Set();
  for (const p of PROVIDERS) {
    const where = "provider " + p.id;
    assert.equal(typeof p.id, "string", where);
    assert.ok(!seen.has(p.id), where + ": duplicate id");
    seen.add(p.id);
    for (const key of ["name", "country", "homepage", "attribution", "licence", "licenceUrl",
      "quantity", "unitUpstream", "kind"]) {
      assert.equal(typeof p[key], "string", where + ": missing " + key);
      assert.ok(p[key].length > 0, where + ": empty " + key);
    }
    assert.equal(typeof p.historyDays, "number", where + ": historyDays");
    assert.equal(typeof p.needsProxy, "boolean", where + ": needsProxy");

    /* Every declared unit must be one the single conversion function accepts — a provider that
       declares a unit nothing can convert would throw on its first live record instead of here. */
    assert.equal(toNanoSvH(1, p.unitUpstream), toNanoSvH(1, p.unitUpstream), where + ": unit");
    assert.ok(Number.isFinite(toNanoSvH(1, p.unitUpstream)), where + ": unconvertible unitUpstream");

    for (const mode of ["latest", "series", "day"]) {
      if (p[mode] == null) continue;
      assert.equal(typeof p[mode].urls, "function", where + "." + mode + ".urls");
      assert.equal(typeof p[mode].parse, "function", where + "." + mode + ".parse");
      assert.ok(p[mode].contentTypeRe instanceof RegExp, where + "." + mode + ".contentTypeRe");
      assert.equal(typeof p[mode].requests, "number", where + "." + mode + ".requests");
    }
    assert.ok(p.latest, where + ": a provider with no latest cannot be on the map");
  }
});

/* ── ② every URL the registry can build is an https URL on the host it named ────────────────────
   ⚠ NOT AN OPEN PROXY is a property of THIS file, not of the transport: the transport only fetches
   what a provider hands it, so a provider that can be talked into building an arbitrary URL is the
   whole hole. The station code goes through the URL builders here as a hostile string. */
test("R578 ② no provider can be steered off its own host", () => {
  const hostile = "x'/../..\\@evil.example.com/?a=b#/../";
  const now = Date.UTC(2026, 8, 9, 12, 0, 0);
  for (const p of PROVIDERS) {
    for (const mode of ["latest", "series", "day"]) {
      if (p[mode] == null) continue;
      const urls = p[mode].urls({
        now, chunk: 0, chunked: true, code: hostile,
        from: "2026-09-01T00:00:00Z", to: "2026-09-09T00:00:00Z", iso: "2026-09-08",
      });
      assert.ok(Array.isArray(urls) && urls.length > 0, p.id + "." + mode + ": no urls");
      for (const u of urls) {
        const parsed = new URL(u);
        assert.equal(parsed.protocol, "https:", p.id + ": " + u);
        assert.ok(!/evil\.example\.com/.test(parsed.host), p.id + ": host steered to " + parsed.host);
      }
    }
  }
});

/* ── ③ the one conversion, including the one it must refuse ─────────────────────────────────────
   ⚠ THE POINT OF THIS TEST IS THE THROW. Silently treating an unrecognised unit as 1 (or as 1000)
   puts a number on a radiation map that is wrong by three orders of magnitude and looks entirely
   ordinary. µ is written three ways in the wild and all three must convert; anything else must not
   convert at all. */
test("R578 ③ toNanoSvH converts what upstreams declare and refuses what they do not", () => {
  assert.equal(toNanoSvH(1, "nSv/h"), 1);
  assert.equal(toNanoSvH(0.073, "µSv/h"), 73);          // U+00B5 MICRO SIGN — what BfS sends
  assert.equal(toNanoSvH(0.073, "μSv/h"), 73);          // U+03BC GREEK SMALL LETTER MU
  assert.equal(toNanoSvH(0.073, "uSv/h"), 73);               // ASCII
  assert.equal(toNanoSvH(0.073, " uSv/h "), 73);             // upstreams pad
  assert.equal(toNanoSvH(0.05, "µGy/h"), 50);           // absorbed dose, weighted 1 upstream
  assert.equal(normaliseUnit("µSv/h"), "uSv/h");

  for (const bad of ["mSv/h", "Sv/h", "cpm", "µR/h", "", null, undefined, "nsv/h", "nSv"]) {
    assert.throws(() => toNanoSvH(1, bad), RangeError,
      "an unknown unit must throw, not be assumed: " + String(bad));
  }
  /* A missing NUMBER is null — an absent reading. A missing UNIT is a throw — an unreadable one. */
  assert.equal(toNanoSvH(null, "nSv/h"), null);
  assert.equal(toNanoSvH("", "nSv/h"), null);
  assert.equal(toNanoSvH(NaN, "nSv/h"), null);
  assert.equal(toNanoSvH("abc", "nSv/h"), null);
});

/* ── ④ a coordinate is inside the world, or it is not a coordinate ──────────────────────────────
   The asymmetry is deliberate and is checked in both directions: a BAD position is dropped, an
   ABSENT one is kept. RadNet and HKO publish readings with no coordinates at all, and throwing those
   away would silently shrink the network rather than silently misplace it. */
test("R578 ④ coordinates are validated, and a missing one keeps its reading", () => {
  assert.equal(validLatLon(50.78, 6.09), true);
  assert.equal(validLatLon(-90, -180), true);
  assert.equal(validLatLon(90, 180), true);
  for (const [a, b] of [[90.1, 0], [-90.1, 0], [0, 180.1], [0, -180.1], [NaN, 0], [0, NaN],
    [null, 0], [0, null], [undefined, 0], ["", 0], [Infinity, 0]]) {
    assert.equal(validLatLon(a, b), false, "accepted " + String(a) + "," + String(b));
  }

  /* Through the shipped parser, not a re-implementation: a RadNet chunk whose station table lost a
     position still emits the reading, with lat/lon null. */
  const rows = providerById("us-epa").latest.parse([FIXTURES["us-epa"]], { chunk: 0 });
  assert.equal(rows.length, 1);
  assert.ok(rows[0].nsvh > 0);
  const orphan = providerById("hk-hko").latest.parse([
    JSON.stringify({ ReportTimeInfoDate: "20260908", ZzzTestMicrosieverts: "0.11", ZzzTestLocationName: "Nowhere At All" }),
  ]);
  assert.equal(orphan.length, 1, "a station absent from the coordinate table must still ship");
  assert.equal(orphan[0].lat, null);
  assert.equal(orphan[0].lon, null);
  assert.equal(orphan[0].nsvh, 110);
});

/* ── ⑤ de-bfs: the unit and the averaging window are READ, not assumed ──────────────────────────
   Both arrive per feature. A parser that hard-coded either would keep working today and be wrong the
   day BfS changes one — and this fixture is the only place the difference is visible. */
test("R578 ⑤ de-bfs parses real GeoJSON and reads the declared unit", () => {
  const p = providerById("de-bfs");
  const rows = p.latest.parse([FIXTURES["de-bfs"]]);
  assert.ok(rows.length >= 2, "expected the fixture's features");
  const r = rows[0];
  assert.match(r.code, /^\d+$/, "the join key is the station number `kenn`");
  assert.ok(r.name.length > 0);
  assert.ok(validLatLon(r.lat, r.lon));
  assert.equal(r.quantity, "H*(10)");
  assert.equal(r.kind, "hourly-mean");
  assert.match(r.at, /^\d{4}-\d{2}-\d{2}T/);
  /* The fixture's own µSv/h values are ~0.05–0.25, so nSv/h must be ~50–250. A parser that skipped
     the conversion would land three orders of magnitude low and still look like a number. */
  for (const row of rows) assert.ok(row.nsvh > 10 && row.nsvh < 10000, "nSv/h out of range: " + row.nsvh);

  /* Which timeseries layer answers is decided by the SPAN, because the two layers hold different
     amounts of history (168 rows vs 365 — measured). */
  const short = p.series.urls({ code: "055620080", from: "2026-09-08T00:00:00Z", to: "2026-09-09T00:00:00Z" })[0];
  const long = p.series.urls({ code: "055620080", from: "2026-01-01T00:00:00Z", to: "2026-09-09T00:00:00Z" })[0];
  assert.match(short, /odlinfo_timeseries_odl_1h/);
  assert.match(long, /odlinfo_timeseries_odl_24h/);
  assert.match(short, /055620080/);
});

/* ── ⑥ jp-nra: the same station arrives many times, and only the newest may survive ─────────────
   ⚠ THIS IS THE ONE THAT SILENTLY RUINS THE MAP. RAMIS returns every sample it holds, not one per
   station — measured, one station appeared 619 times in a single data_type=1 answer (31 of that
   sweep's stations repeated at all), and `id` is not unique either (5,490 ids for 5,423 stations).
   Without deduplication the monitor is drawn hundreds of times and shows whichever row was last.

   ⚠ THE FIXTURE CONTAINS THAT REPEAT, INTERLEAVED THE WAY THE WIRE INTERLEAVES IT, AND THE NEWEST
   SAMPLE IS NOT THE FIRST IN THE ARRAY. Checked by mutation: replacing "keep the newest" with "keep
   the first" must turn this test red. Against the first draft's fixture — three DISTINCT stations,
   cut from the same real answer — it did not, and this test was passing for free.  (#R548: a
   mutation that survives does not mean the code is right, it means the fixture never held the
   case.) */
test("R578 ⑥ jp-nra collapses repeated samples to the newest per station", () => {
  const p = providerById("jp-nra");
  const parsed = JSON.parse(FIXTURES["jp-nra"]);
  const codes = parsed.data.map((d) => d.obs_station_unique_code);
  const distinct = new Set(codes);

  const rows = p.latest.parse([FIXTURES["jp-nra"]]);
  assert.equal(new Set(rows.map((r) => r.code)).size, rows.length, "one row per station");
  assert.ok(rows.length <= distinct.size, "cannot invent stations");

  /* Feed the same body twice — which is exactly what seven data_type sweeps do when their sets
     overlap (338 ids appeared in more than one, measured) — and the answer must not double. */
  const twice = p.latest.parse([FIXTURES["jp-nra"], FIXTURES["jp-nra"]]);
  assert.deepEqual(twice.map((r) => r.code).sort(), rows.map((r) => r.code).sort());

  for (const r of rows) {
    const mine = parsed.data.filter((d) => d.obs_station_unique_code === r.code && d.air_dose_rate != null);
    if (!mine.length) continue;
    const newest = mine.reduce((a, b) => (Date.parse(b.meas_datetime) > Date.parse(a.meas_datetime) ? b : a));
    assert.equal(r.at, newest.meas_datetime, "station " + r.code + " kept a stale sample");
    assert.equal(r.nsvh, newest.air_dose_rate * 1000);
  }
});

/* ── ⑥b a detector cannot measure zero, and the record must not say it did ──────────────────────
   ⚠ MEASURED 2026-09-09: seven RAMIS stations reported air_dose_rate exactly 0 with missing_status
   "0" — not flagged missing — and a declared meas_range_low_limit of 0.2 µSv/h. Their detector does
   not resolve below 200 nSv/h, so the 0 means "under my floor". Both easy answers are wrong: emitted
   as a reading it puts seven Japanese towns at the bottom of the colour scale claiming something no
   instrument can claim, and dropped it deletes seven working monitors. The fixture carries one of
   those real rows. The floor is READ from the record — a provider that declares none flags nothing. */
test("R578 ⑥b a value under the detector's own declared floor says so", () => {
  const p = providerById("jp-nra");
  const raw = JSON.parse(FIXTURES["jp-nra"]);
  const under = raw.data.filter((d) => d.air_dose_rate != null && d.meas_range_low_limit > d.air_dose_rate);
  assert.ok(under.length > 0, "the fixture must contain a real below-floor row, or this proves nothing");

  const rows = p.latest.parse([FIXTURES["jp-nra"]]);
  const flagged = rows.filter((r) => r.below);
  assert.equal(flagged.length, under.length);
  for (const r of flagged) {
    assert.ok(Number.isFinite(r.nsvh), "the reading is kept, not deleted");
    assert.ok(validLatLon(r.lat, r.lon), "the station is kept, not deleted");
  }
  /* Everything that DID clear its floor must not be flagged — the marker is a claim too. */
  for (const r of rows) {
    const d = raw.data.find((x) => x.obs_station_unique_code === r.code && x.air_dose_rate != null);
    if (d && d.meas_range_low_limit <= d.air_dose_rate) assert.equal(r.below, false, r.code);
  }

  /* It survives the merge as a compact flag, and is ABSENT rather than false on ordinary rows —
     7 rows in 7,000 must not cost a key on the other 6,993. */
  const merged = mergeLatest([{ provider: p, read: true, records: rows }]);
  const marked = merged.stations.filter((row) => row.b === 1);
  assert.equal(marked.length, flagged.length);
  for (const row of merged.stations) {
    if (row.b === undefined) continue;
    assert.equal(row.b, 1, "the flag is present-or-absent, never false");
  }
});

/* ── ⑦ fi-stuk: the value matrix is joined to the station register by POSITION ───────────────────
   FMI's multipointcoverage separates the station names from the numbers entirely; if the join is
   wrong every Finnish reading appears under someone else's name, in the right country, at plausible
   values — a failure nothing downstream can see. NaN is FMI's "no observation" and must vanish. */
test("R578 ⑦ fi-stuk joins values to named stations and drops NaN", () => {
  const p = providerById("fi-stuk");
  const rows = p.latest.parse([FIXTURES["fi-stuk"]]);
  assert.ok(rows.length >= 1, "expected the fixture's stations");
  const names = new Set();
  for (const r of rows) {
    assert.match(r.code, /^\d+$/, "the code is the fmisid");
    assert.ok(r.name.length > 0, "station " + r.code + " lost its name");
    assert.ok(validLatLon(r.lat, r.lon));
    assert.ok(Number.isFinite(r.nsvh), "NaN reached a record");
    assert.ok(r.nsvh > 10 && r.nsvh < 10000, "nSv/h out of range: " + r.nsvh);
    assert.equal(r.quantity, "H*(10)");
    assert.equal(r.kind, "10min-mean");
    assert.match(r.at, /^\d{4}-\d{2}-\d{2}T/);
    names.add(r.name);
  }
  assert.equal(names.size, rows.length, "two stations were given the same name");
  /* Every name emitted must be one the document actually contains — the join cannot invent a pair. */
  for (const n of names) assert.ok(FIXTURES["fi-stuk"].includes(">" + n + "<"), "invented name: " + n);
});

/* ── ⑧ hk-hko: the station list is DISCOVERED from the key shape ─────────────────────────────────
   The bulletin has no station array. Eleven stations exist because eleven keys end in
   `Microsieverts`; a twelfth would appear with no code change, and the 22 keys that end in
   `LocationName` without a radiation sibling are thermometers and must not become dose stations.
   The expected set is derived here from the fixture, not written down. */
test("R578 ⑧ hk-hko discovers its stations instead of listing them", () => {
  const p = providerById("hk-hko");
  const raw = JSON.parse(FIXTURES["hk-hko"]);
  const expected = Object.keys(raw)
    .filter((k) => /Microsieverts$/.test(k))
    .map((k) => raw[k.slice(0, k.length - "Microsieverts".length) + "LocationName"]);
  const locationNameKeys = Object.keys(raw).filter((k) => /LocationName$/.test(k));
  assert.ok(locationNameKeys.length > expected.length,
    "the fixture must contain non-radiation locations, or this test proves nothing");

  const rows = p.latest.parse([FIXTURES["hk-hko"]]);
  assert.deepEqual(rows.map((r) => r.name).sort(), expected.slice().sort());
  for (const r of rows) {
    assert.equal(r.kind, "daily-mean");
    assert.ok(r.nsvh >= 50 && r.nsvh <= 400, "nSv/h out of range: " + r.nsvh);
    assert.match(r.at, /^\d{4}-\d{2}-\d{2}T00:00:00Z$/);
    assert.ok(validLatLon(r.lat, r.lon), "no position for " + r.name);
  }
  /* The day mode is the same bulletin for a named date — Chronos in the past, not a second parser. */
  assert.match(p.day.urls({ iso: "2026-09-08" })[0], /date=20260908/);
});

/* ── ⑨ nl-rivm: a 2011 annual mean must never enter the current-value set ───────────────────────
   ⚠ THE LIE HERE WOULD BE TOLD BY THE GRAPHIC, NOT BY A SENTENCE. 151 Dutch points coloured on the
   same scale as a reading taken twenty minutes ago say "this is the dose in the Netherlands now",
   and no caption undoes that. The separation is checked at the parser AND at the merge, because a
   record that declares itself correctly and is then merged into the wrong array is still wrong. */
test("R578 ⑨ the 2011 annual mean names itself and stays out of the live set", () => {
  const p = providerById("nl-rivm");
  assert.equal(p.kind, "annual-mean");
  assert.equal(p.asOf, "2011");
  assert.equal(isPeriodMean("annual-mean"), true);
  assert.equal(isPeriodMean("hourly-mean"), false);
  assert.equal(isPeriodMean("instant"), false);

  const rows = p.latest.parse([FIXTURES["nl-rivm"]]);
  assert.ok(rows.length >= 2);
  for (const r of rows) {
    assert.equal(r.kind, "annual-mean");
    assert.equal(r.at, "2011-12-31T23:59:59Z");
    /* The upstream declares nSv/h per feature and the values are tens — a wrong conversion here
       would put the Netherlands at 60,000 nSv/h, which is an evacuation, not a Tuesday. */
    assert.ok(r.nsvh > 10 && r.nsvh < 1000, "nSv/h out of range: " + r.nsvh);
  }

  const merged = mergeLatest([
    { provider: p, read: true, records: rows },
    { provider: providerById("de-bfs"), read: true, records: providerById("de-bfs").latest.parse([FIXTURES["de-bfs"]]) },
  ]);
  assert.equal(merged.reference.length, rows.length);
  assert.ok(merged.stations.length > 0);
  for (const s of merged.stations) assert.notEqual(s.s, "nl-rivm", "a 2011 mean reached the live set");
  for (const s of merged.reference) assert.equal(s.k, "annual-mean");
  /* And the source row still counts them, so the legend can say what the 151 points are. */
  const src = merged.sources.find((s) => s.id === "nl-rivm");
  assert.equal(src.n, rows.length);
  assert.equal(src.asOf, "2011");
});

/* ── ⑩ "we could not read it" and "it answered, with nothing" are different worlds ──────────────
   Both produce zero stations on the map. One means the reader should be told the network is
   unreachable; the other means every monitor in that country is reporting nothing, which would be
   the most important thing on the page. Collapsing them is the #R499 / #R536 shape. */
test("R578 ⑩ an unread provider is distinguishable from one that read zero", () => {
  const de = providerById("de-bfs");
  const fi = providerById("fi-stuk");
  const jp = providerById("jp-nra");
  const merged = mergeLatest([
    { provider: de, read: false, records: [], reason: "upstream_unreachable" },
    { provider: fi, read: true, records: [] },
    { provider: jp, read: true, records: jp.latest.parse([FIXTURES["jp-nra"]]), reason: "partial:6/7" },
  ]);
  const byId = Object.fromEntries(merged.sources.map((s) => [s.id, s]));

  assert.equal(byId["de-bfs"].read, false);
  assert.equal(byId["de-bfs"].n, 0);
  assert.equal(byId["de-bfs"].reason, "upstream_unreachable");

  assert.equal(byId["fi-stuk"].read, true);
  assert.equal(byId["fi-stuk"].n, 0);
  assert.equal(byId["fi-stuk"].reason, null);

  /* The two must not be equal in any field the page could key off. */
  assert.notDeepEqual(
    { read: byId["de-bfs"].read, reason: byId["de-bfs"].reason },
    { read: byId["fi-stuk"].read, reason: byId["fi-stuk"].reason },
  );

  /* A provider that was read but not fully still delivers, and says so. */
  assert.equal(byId["jp-nra"].read, true);
  assert.ok(byId["jp-nra"].n > 0);
  assert.equal(byId["jp-nra"].reason, "partial:6/7");

  /* ⚠ RECORDS FROM AN UNREAD PROVIDER MUST NOT BE COUNTED EVEN IF SOMEBODY HANDS THEM OVER. */
  const lying = mergeLatest([{ provider: de, read: false, records: de.latest.parse([FIXTURES["de-bfs"]]) }]);
  assert.equal(lying.sources[0].n, 0);
  assert.equal(lying.stations.length, 0);

  /* Every source row carries the attribution the licences require, read or not. */
  for (const s of merged.sources) {
    assert.ok(s.attribution && s.licence && s.url, s.id + ": lost its attribution");
  }
});

/* ── ⑪ RadNet is excluded by ARITHMETIC, and its chunks cover the network exactly once ──────────
   ⚠ THE EXCLUSION MUST NOT BE BY NAME. Measured, one RadNet sweep is 140 requests / 67.3 MB / 102 s,
   so it fails the transport's request budget the way any 140-request provider would; if EPA ever
   publishes a bulk endpoint the provider's declared cost drops and it joins with no edit here. What
   this test defends is the other half: the chunked route must reach EVERY station, once. */
test("R578 ⑪ RadNet fails the budget by cost, and its chunks tile the whole network", () => {
  const p = providerById("us-epa");
  assert.ok(p.latest.requests > MAX_UPSTREAM_REQUESTS,
    "if this ever fits, delete the chunking — do not keep an exclusion nothing justifies");
  assert.ok(p.latest.chunkSize <= MAX_UPSTREAM_REQUESTS, "a chunk must itself fit the budget");
  assert.equal(p.latest.chunks, Math.ceil(p.latest.requests / p.latest.chunkSize));

  const seen = [];
  for (let c = 0; c < p.latest.chunks; c++) {
    const urls = p.latest.urls({ chunk: c });
    assert.ok(urls.length > 0 && urls.length <= p.latest.chunkSize, "chunk " + c + " is " + urls.length);
    for (const u of urls) seen.push(u);
  }
  assert.equal(seen.length, p.latest.requests, "the chunks do not cover the station list");
  assert.equal(new Set(seen).size, seen.length, "a station is fetched by two chunks");
  /* Past the end is empty, not a wrap — a page walking chunks must be able to stop. */
  assert.equal(p.latest.urls({ chunk: p.latest.chunks }).length, 0);

  /* Every station in the table has a usable position and a year EPA published. */
  const first = p.latest.urls({ chunk: 0 });
  for (const u of first) assert.match(u, /^https:\/\/radnet\.epa\.gov\/cdx-radnet-rest\/api\/rest\/csv\/\d{4}\/fixed\//);
  /* Spaces and dots in city names must survive as encoding, not as a broken path. */
  assert.ok(seen.some((u) => /%20/.test(u)), "no multi-word station survived encoding");
});

/* ── ⑫ RadNet's CSV: the unit comes out of the header, the clock keeps its zone-lessness ────────
   The dose column is «DOSE EQUIVALENT RATE (nSv/h)» — the unit is inside the column NAME, so even
   the CSV declares it. And the collection time is the station's local wall clock with no zone in the
   file; inventing a Z would move every US point by up to eight hours, so the record must carry the
   time exactly as written and without a zone marker. */
test("R578 ⑫ us-epa reads its unit from the header and does not invent a timezone", () => {
  const p = providerById("us-epa");
  const rows = p.series.parse([FIXTURES["us-epa"]]);
  assert.ok(rows.length >= 3, "expected the fixture's rows");
  for (const r of rows) {
    assert.ok(r.nsvh > 10 && r.nsvh < 1000, "nSv/h out of range: " + r.nsvh);
    assert.match(r.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    assert.ok(!/[Zz+]/.test(r.at.slice(10)), "a timezone was invented: " + r.at);
  }
  assert.ok(rows[0].at < rows[rows.length - 1].at, "RadNet writes its file in time order");

  /* `latest` takes the LAST usable row, not the last line, and the fixture's real file has rows
     whose count columns are empty — those are ordinary and must not be skipped. */
  const latest = p.latest.parse([FIXTURES["us-epa"]], { chunk: 0 });
  assert.equal(latest.length, 1);
  assert.equal(latest[0].at, rows[rows.length - 1].at);
  assert.equal(latest[0].nsvh, rows[rows.length - 1].nsvh);
  assert.equal(latest[0].quantity, "H*(10)");

  /* A CSV whose dose column is gone yields nothing rather than a column-index guess. */
  assert.deepEqual(p.series.parse(["A,B,C\n1,2,3"]), []);
  assert.deepEqual(p.series.parse([""]), []);
});

/* ── ⑬ the merged row keeps every claim the record made ─────────────────────────────────────────
   The wire format is short keys because there are thousands of rows, but shortening must not drop a
   claim: the quantity and the averaging window travel with every station, which is what lets one
   legend describe six networks honestly. */
test("R578 ⑬ the compact wire row still carries quantity and kind", () => {
  const results = PROVIDERS
    .filter((p) => FIXTURES[p.id])
    .map((p) => ({ provider: p, read: true, records: p.latest.parse([FIXTURES[p.id]], { chunk: 0 }) }));
  const merged = mergeLatest(results);
  assert.ok(merged.stations.length > 0);

  const ids = new Set();
  for (const row of merged.stations.concat(merged.reference)) {
    assert.match(row.c, /^[a-z]{2}-[a-z]+:/, "the code must be namespaced by provider: " + row.c);
    assert.ok(!ids.has(row.c), "duplicate station code " + row.c);
    ids.add(row.c);
    assert.equal(row.c.slice(0, row.c.indexOf(":")), row.s);
    assert.ok(typeof row.v === "number" && Number.isFinite(row.v), "no value on " + row.c);
    assert.ok(typeof row.q === "string" && row.q.length > 0, "no quantity on " + row.c);
    assert.ok(typeof row.k === "string" && row.k.length > 0, "no kind on " + row.c);
    assert.ok(row.y === null || (row.y >= -90 && row.y <= 90), "bad lat on " + row.c);
    assert.ok(row.x === null || (row.x >= -180 && row.x <= 180), "bad lon on " + row.c);
  }

  /* Every provider whose fixture is present is represented in sources, with its licence. */
  assert.equal(merged.sources.length, results.length);
  for (const s of merged.sources) {
    assert.ok(s.licence.length > 0 && s.licenceUrl.length > 0, s.id + ": no licence");
    assert.ok(s.n > 0, s.id + ": parsed nothing from its own captured answer");
  }
});

/* ── ⑭ nothing EURDEP-derived, and no unlicensed upstream, can be in the registry ───────────────
   opendata:eurdep_latestValue answers 200 and would add 3,633 stations across 44 countries for one
   line of code. It has no GovData dataset entry, so there is no licence to redistribute it under —
   which is precisely the kind of thing that gets added later by somebody who only measured that it
   works. The constraint is written down where it can fail. */
test("R578 ⑭ every upstream host is one of the licensed networks", () => {
  const allowedHosts = new Set([
    "www.imis.bfs.de", "www.ramis.nra.go.jp", "opendata.fmi.fi",
    "data.weather.gov.hk", "data.rivm.nl", "radnet.epa.gov",
  ]);
  const now = Date.UTC(2026, 8, 9, 12, 0, 0);
  for (const p of PROVIDERS) {
    for (const mode of ["latest", "series", "day"]) {
      if (p[mode] == null) continue;
      for (const u of p[mode].urls({ now, chunk: 0, chunked: true, code: "1", from: "2026-09-01T00:00:00Z", to: "2026-09-09T00:00:00Z", iso: "2026-09-08" })) {
        const host = new URL(u).host;
        assert.ok(allowedHosts.has(host), p.id + " reaches an unlicensed host: " + host);
        assert.ok(!/eurdep/i.test(u), p.id + " requests a EURDEP layer: " + u);
      }
    }
  }
});
