/* ============================================================================
 *  IntMap · A POINT UP IN THE AIR, IN THE UNIT EACH HALF OF MAPLIBRE'S PRELUDE WANTS
 * ----------------------------------------------------------------------------
 *  The GLSL the elevated custom layers share — js/orbit-points.js (satellites),
 *  js/aircraft-points.js (live aircraft) and js/solid3d.js (the 3-D volume) — in
 *  place of calling the prelude's `projectTileFor3D(pos, e)` with ONE elevation.
 *
 *  WHY ONE ELEVATION STOPPED BEING ENOUGH (MapLibre 6). The globe prelude's
 *  projectTileFor3D lifts the point on the sphere by `e` METRES and, while the
 *  globe cross-fades to the plane (z11→z12), blends that with
 *  `u_projection_fallback_matrix · (pos, e, 1)` — and for custom layers the
 *  fallback matrix is the PLANE's custom-layer matrix, whose z is in MERCATOR
 *  UNITS (MercatorTransform.getProjectionDataForCustomLayer scales z by
 *  worldSize / pixelsPerMeter). 5.24 never reached that blend: it handed custom
 *  layers `projectionTransition` = 1 for the whole fade (the 6.4.1 changelog
 *  calls it «hardcoded to 1 … so a custom layer jumped straight to the fully
 *  bent globe»). 6.4.1 gave custom layers the live value, and from then on a
 *  point handed metres was blended with the plane's reading of those metres as
 *  mercator units — tens of thousands of world widths up.
 *  MEASURED on 6.11.2, globe z11.5 (projectionTransition 0.5), Tokyo, 8 km:
 *  the orbit layer's dot was not drawn anywhere on the canvas (on 5.24 it was
 *  drawn, globe-only, at y 15.5); a probe fed 8000 m to projectTileFor3D drew
 *  nothing, and one fed 2.9·10⁻⁴ mercator units drew at 198.5 — half the lift,
 *  because then the SPHERE half reads it as metres.
 *
 *  So each half is fed the unit it takes: the sphere half through the prelude's
 *  own projectToSphere and u_projection_matrix with metres, the plane half
 *  through u_projection_fallback_matrix with mercator units, mixed by
 *  u_projection_transition exactly as the prelude's interpolateProjectionFor3D
 *  mixes them (src/shaders/glsl/_projection_globe.vertex.glsl). Off the globe it
 *  IS the prelude's projectTileFor3D, with mercator units. The CPU half of the
 *  same law — what a hover picks — is js/geo-engine.js `_lifted`, and
 *  tests/maplibre-6-migration.spec.js measures it against MapLibre's own drawing
 *  of an elevated point.
 * ==========================================================================*/
export const LIFTED_GLSL = `
/* IntMap (js/lifted-projection.js): projectTileFor3D with each half of the prelude fed its own unit */
vec4 projectLifted(vec2 p, float metres, float merc) {
#ifdef GLOBE
  vec3 sp = projectToSphere(p, p);
  vec4 g = u_projection_matrix * vec4(sp * (1.0 + metres / GLOBE_RADIUS), 1.0);
  if (u_projection_transition > 0.999) return g;
  return mix(u_projection_fallback_matrix * vec4(p, merc, 1.0), g, u_projection_transition);
#else
  return projectTileFor3D(p, merc);
#endif
}
`;
