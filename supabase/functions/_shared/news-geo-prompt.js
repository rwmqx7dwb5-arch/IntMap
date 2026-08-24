/* ============================================================================
 *  IntMap · ニュース地点解析 — AI に渡す規則の正本  (#R404)
 * ----------------------------------------------------------------------------
 *  #R29 がこの規則を `refresh-news` の中に書いた。#R404 で `news-ingest`
 *  （＝UI が実際に読む経路）にも AI 地点解析が要るようになった。
 *
 *  ⚠ **同じ散文を 2 か所に置かない。** 片方だけ直した日に、同じ製品の 2 つの経路が
 *    同じ見出しを違う場所に置く。⇒ **規則はここ 1 つ**にし、呼び出し側が足すのは
 *    「返し方（JSON の形）」だけにする。形は同じではない——`refresh-news` は
 *    `{i,name,lat,lng}` を書く先しか持たず、`news-ingest` は種別（`subject_type`）も
 *    列に持っていて、それが Event の代表地点の選び方（具体性 × 支持）を決めるからである。
 *
 *  ⚠ この文字列は**人格を含まない**。人格の正本は `_shared/atlas-persona.js` 1 本で
 *    (#R285)、呼び出し側が `personaPrompt(...) + NEWS_GEO_RULES + <返し方>` と組む。
 * ==========================================================================*/

/**
 * 「その見出しの出来事はどこで起きたか」を AI に決めさせるための規則。
 * 番号付きの見出し一覧を渡す前提で書かれている（`1. <title> — <desc>` の形）。
 *
 * ⚠ 規則 (2) と (3) は飾りではない——これが #R161 の決定論エンジンが
 *   「デートライン抑止」と「階層吸収」で解いている 2 つの失敗クラスそのもので、
 *   AI 側にも同じことを要求しないと、両者が別のものを最適化することになる。
 */
export const NEWS_GEO_RULES =
  "For EACH numbered headline, return the SUBJECT LOCATION: the single specific real-world place where the main event actually happens. " +
  "RULES: (1) NOT the news outlet's HQ or dateline. (2) NOT where someone merely SPOKE about it — if an official in Washington comments on the Middle East, return the Middle-East place the event concerns. " +
  "(3) Be as SPECIFIC as the headline allows: prefer a city, district, landmark, port, base, or border crossing over a whole country; give the coordinates of that specific place, not the country centroid. " +
  "(4) Resolve sports clubs, companies, airports, universities, parliaments and stadiums to their actual physical city. (5) Disambiguate same-name places using country/region cues in the headline (e.g. Springfield, Tripoli, San José, Córdoba). " +
  "(6) For a whole country/region story with no city, return the capital (or the region's main city) and name it as the country/region. " +
  "(7) Only OMIT an item if it is genuinely global or placeless (e.g. 'global markets', 'AI ethics', a generic explainer). Do NOT omit an item just because it is country-level — country-level is fine. Aim to locate as many items as possible. ";

/**
 * 地点の種別。**`js/newsgeo.js` の `KIND_LOCAL` と同じ語彙**でなければならない——
 * `summariseEvent()` は種別の具体性で Event の代表地点を選び、`news-cluster.js` の
 * `geoClass()` は「代表点しか持たない種別」（country / admin1 / org）を近さの判定から
 * 外す。AI が知らない語を返すと、その記事は**種別 0 として扱われ**、
 * 決定論エンジンが置いた粗い地点に代表を譲る。
 */
export const NEWS_GEO_KINDS = ['seat', 'flashpoint', 'city', 'feature', 'admin1', 'country', 'org'];

/** 種別の意味を AI に 1 行で渡す（語彙をこちらの都合で言い換えない）。 */
export const NEWS_GEO_KIND_LINE =
  "Also return the kind of place, exactly one of: " +
  "\"city\" (a city, town, district or neighbourhood), " +
  "\"seat\" (a seat of power or named institution-place: the White House, the Pentagon, the Kremlin, The Hague, Davos, Wall Street), " +
  "\"flashpoint\" (a conflict zone or contested territory: Gaza, Donbas, the Taiwan Strait), " +
  "\"feature\" (a physical feature: a mountain, river, island, strait, sea or volcano), " +
  "\"admin1\" (a state, province, oblast, prefecture or region), " +
  "\"country\" (a whole country), " +
  "\"org\" (an organisation's own site when no better place exists). ";
