/* ============================================================================
 *  IntMap · THE GEO-ENGINE CONTRACT, AS A TYPE
 * ----------------------------------------------------------------------------
 *  Two files implement one object: `makeMapLibreAdapter` in js/geo-engine.js and
 *  `makeCesiumAdapter` in js/cesium-engine.js. They are annotated
 *  `@returns {MapLibreAdapter}` / `@returns {CesiumAdapter}` (the facade
 *  `@returns {GeoEngineFacade}`, the three capability tables `GeoEngineCapabilities`),
 *  so `npm run check:types` (tsc --noEmit) answers the question the prose in
 *  Architecture.md §1.2 used to leave to the reader:
 *
 *    · a method added to ONE adapter and not declared here  → excess property (TS2353)
 *    · a method declared required here and missing from one → not assignable (TS2322),
 *                                                             naming the adapter that lacks it
 *    · a facade namespace calling an adapter method that the
 *      contract does not have                               → no such property (TS2339)
 *  tests/typecheck-gate-checks.test.mjs makes each of these on a copy and watches it fail.
 *  ⚠ NOT YET: a facade calling an OPTIONAL member without asking whether it is there. That is
 *  TS2722 and needs strictNullChecks, which is off (docs/TESTING.md, check:types).
 *
 *  REQUIRED vs OPTIONAL is not a judgement written here — it is what the two
 *  implementations actually carry. A member both adapters implement is required;
 *  a member only one implements is `?:`, and the facade must feature-test it
 *  (`A().x ? A().x() : fallback`), which is how an engine says 「I cannot」 rather
 *  than throwing. The two `…Only` interfaces below name which engine has which,
 *  so tsc also refuses an optional member that NEITHER adapter implements.
 *
 *  Parameters are `any` on purpose for now: this file fixes the SHAPE of the seam
 *  (which names exist, on which engine, with how many arguments). Tightening a
 *  signature is done one member at a time, and tsc then checks it on both sides.
 * ==========================================================================*/

export interface LngLat { lng: number; lat: number }

/** One source's answer to `render.drawn()` (js/geo-engine.js surfacesDrawn). */
export interface SurfaceState {
  owners: string[];
  state: 'drawn' | 'empty' | 'hidden' | 'unlayered' | 'absent' | 'unknown';
  features: number | null;
}
/** `render.drawn()` — `observable:false` means the renderer could not be asked, never 「nothing there」. */
export interface SurfacesDrawn {
  observable: boolean;
  surfaces: { [id: string]: SurfaceState };
  drawn: string[];
  gone: string[];
}

/** The camera the facade's `camera.get()` answers with. */
export interface CameraState { center: LngLat; zoom: number; bearing: number; pitch: number }

/**
 * What an engine says it can do. The three tables (MAPLIBRE_CAPS, CESIUM_CONTRACT.capabilities,
 * CESIUM_CAPS) are also compared as key sets by tests/r323-checks.test.mjs; this type makes a key
 * that exists in one table and not the others a compile error too.
 */
export interface GeoEngineCapabilities {
  engine: 'maplibre' | 'cesium';
  globe: boolean; flat: boolean; terrain3d: boolean; freeCamera: boolean; pitchBeyond90: boolean;
  rasterLayers: boolean; vectorLayers: boolean; geojson: boolean; terrainElevation: boolean;
  markers: boolean; opacity: boolean; projection: boolean; extrusion3d: boolean; solid3d: boolean;
  orbit3d: boolean; aircraftCloud: boolean; globeAllZooms: boolean; tiltRange: number[];
  cameraAltitude: boolean; eyeControl: boolean; eyeIsPosition: boolean;
  /** Cesium only: the style-language features its interpreter does not implement. */
  styleGaps?: () => string[];
}

/** A contract declared before (or without) an implementation — CESIUM_CONTRACT in js/geo-engine.js. */
export interface DeclaredContract { id: string; implemented: boolean; capabilities: GeoEngineCapabilities }

/** The members BOTH adapters implement. */
export interface GeoEngineAdapterCore {
  id: 'maplibre' | 'cesium';
  capabilities: GeoEngineCapabilities;
  getCamera(): CameraState | null;
  flyTo(o?: any): any;
  easeTo(o?: any): any;
  jumpTo(o?: any): any;
  fitBounds(b?: any, o?: any): any;
  setPadding(p?: any): any;
  cameraForBounds(b?: any, o?: any): any;
  getPadding(): any;
  setProjection(mode?: any): any;
  getProjection(): any;
  globeness(): any;
  setBearing(b?: any): any;
  setPitch(p?: any): any;
  getRoll(): any;
  setRoll(r?: any): any;
  getMaxPitch(): any;
  setMaxPitch(v?: any): any;
  getMinPitch(): any;
  setMinZoom(v?: any): any;
  getMinZoom(): any;
  setMaxZoom(v?: any): any;
  getMaxZoom(): any;
  zoomRange(): any;
  cameraAltitude(): any;
  eyePosition(): any;
  setEye(o?: any): any;
  isAnimating(): any;
  setCenterClamped(on?: any): any;
  setTiltPivot(mode?: any): any;
  eyePivotDiag(): any;
  project(ll?: any): any;
  unproject(pt?: any): any;
  projectAltitude(ll?: any, altM?: any): any;
  terrainElevation(ll?: any, o?: any): any;
  queryRenderedFeatures(g?: any, o?: any): any;
  hasSource(id?: any): any;
  addSource(id?: any, d?: any): any;
  setSourceData(id?: any, data?: any, opts?: any): any;
  removeSource(id?: any): any;
  imageRowLatitudes(coordinates?: any, height?: any): any;
  addDynamicImage(id?: any, o?: any, before?: any): any;
  touchDynamicImage(id?: any): any;
  setDynamicImageOpacity(id?: any, v?: any): any;
  setDynamicImageCoords(id?: any, c?: any): any;
  hasDynamicImage(id?: any): any;
  removeDynamicImage(id?: any): any;
  hasLayer(id?: any): any;
  addLayer(d?: any, b?: any): any;
  removeLayer(id?: any): any;
  setVisible(id?: any, v?: any): any;
  isVisible(id?: any): any;
  setPaint(id?: any, p?: any, v?: any): any;
  setLayout(id?: any, p?: any, v?: any, o?: any): any;
  setOpacity(id?: any, v?: any): any;
  on(e?: any, c?: any): any;
  off(e?: any, c?: any): any;
  once(e?: any, c?: any): any;
  getZoom(): any;
  getCenter(): any;
  getBearing(): any;
  getPitch(): any;
  getBounds(): any;
  zoomTo(z?: any, o?: any): any;
  zoomIn(o?: any): any;
  zoomOut(o?: any): any;
  stop(): any;
  resize(): any;
  triggerRepaint(): any;
  getCanvas(): any;
  getRenderScale(): any;
  setRenderScale(r?: any): any;
  setFeatureState(f?: any, s?: any): any;
  removeFeatureState(f?: any, k?: any): any;
  styleReady(): any;
  canDraw(): any;
  styleParsed(): any;
  addExtrusion(d?: any, before?: any): any;
  setExtrusionRange(id?: any, baseM?: any, topM?: any): any;
  addSolid(id?: any, before?: any): any;
  setSolid(id?: any, o?: any): any;
  removeSolid(id?: any): any;
  addOrbit(id?: any, before?: any): any;
  setOrbit(id?: any, o?: any): any;
  removeOrbit(id?: any): any;
  addAircraftCloud(id?: any, before?: any): any;
  setAircraftCloud(id?: any, o?: any): any;
  removeAircraftCloud(id?: any): any;
  hasAircraftCloud(id?: any): any;
  projectMercAlt(xy?: any): any;
  setDragPan(on?: any): any;
  getContainer(): any;
  getSize(): any;
  setCursor(c?: any): any;
  getPaint(id?: any, p?: any): any;
  onLayer(e?: any, layer?: any, c?: any): any;
  offLayer(e?: any, layer?: any, c?: any): any;
  onceLayer(e?: any, layer?: any, c?: any): any;
  getLayer(id?: any): any;
  getLayout(id?: any, p?: any): any;
  moveLayer(id?: any, before?: any): any;
  setFilter(id?: any, f?: any): any;
  getFilter(id?: any): any;
  getFeatureState(f?: any): any;
  querySourceFeatures(src?: any, params?: any): any;
  updateImageSource(id?: any, o?: any): any;
  setSourceTiles(id?: any, tiles?: any): any;
  sourceData(id?: any): any;
  getStyle(): any;
  setLight(l?: any): any;
  setSky(s?: any): any;
  getSky(): any;
  setTerrain(t?: any): any;
  getTerrain(): any;
  addImage(id?: any, img?: any, o?: any): any;
  hasImage(id?: any): any;
  removeImage(id?: any): any;
  setCenter(c?: any): any;
  panBy(off?: any, o?: any): any;
  setMaxBounds(b?: any): any;
  setRenderWorldCopies(v?: any): any;
  getRenderWorldCopies(): any;
  cameraFromTo(from?: any, fromAlt?: any, to?: any, toAlt?: any): any;
  worldSize(): any;
  getCanvasContainer(): any;
  setGesture(name?: any, on?: any): any;
  gestures(): any;
  setZoomRate(r?: any, wheel?: any): any;
  popup(o?: any): any;
  marker(o?: any): any;
  addMarker(o?: any, lngLat?: any): any;
  addPopup(o?: any, lngLat?: any, html?: any): any;
  attach(o?: any): any;
  lngLat(lng?: any, lat?: any): any;
  addProtocol(name?: any, fn?: any): any;
  demContourSource(o?: any): any;
  createView(o?: any): any;
  createSubView(o?: any): any;
  setImageConcurrency(n?: any): any;
  raw(): any;
}

/**
 * Members only the MapLibre adapter implements. The facade feature-tests every public one;
 * `_hoverHub` is the adapter's own helper, reached only through `this` by onLayer/offLayer/onceLayer.
 */
export interface MapLibreOnly {
  viewFrame(): any;
  setHorizonReach(on?: any): any;
  setCjkFontFamily(fam?: any): any;
  instrumentFrames(cb?: any): any;
  commandStats(): any;
  commandsReset(): any;
  commandConfig(patch?: any): any;
  sceneStats(): any;
  addLimb(id?: any, before?: any): any;
  limbDrawn(id?: any): any;
  setLimb(id?: any, o?: any): any;
  removeLimb(id?: any): any;
  hasLimb(id?: any): any;
  _hoverHub(): any;
  setSunDirection(o?: any): any;
}

/** Members only the Cesium adapter implements (the facade feature-tests every one). */
export interface CesiumOnly {
  setWorldBase(on?: any): any;
}

/** What the facade may call: the core, plus every engine-specific member as OPTIONAL. */
export type GeoEngineAdapter = GeoEngineAdapterCore & Partial<MapLibreOnly> & Partial<CesiumOnly>;

/** The canvas behind one dynamic image: the caller's draw(ctx,w,h), and the timer that pauses the source. */
export interface DynamicImageCanvas extends HTMLCanvasElement {
  _imDraw?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  _imStop?: ReturnType<typeof setTimeout>;
}

/**
 * State the MapLibre adapter keeps on ITSELF (`this._x`), created on first use by the method named.
 * Not part of the contract — the facade never reads it — but it lives on the adapter object, so the
 * type has to say it may be there.
 */
export interface MapLibreAdapterState {
  /** setHorizonReach: the unsubscribe for the far-plane override */
  _hzOff?: (() => void) | null;
  /** addDynamicImage: id → the canvas the caller draws into */
  _dynImg?: Map<string, DynamicImageCanvas>;
  /** _hoverHub: the one pointer-move hub every layer hover registers with */
  _hvh?: any;
}

/** What each implementation returns — its own members are REQUIRED there, so a member declared for an engine that does not have it is an error too. */
export type MapLibreAdapter = GeoEngineAdapterCore & MapLibreOnly & Partial<CesiumOnly> & MapLibreAdapterState;
export type CesiumAdapter = GeoEngineAdapterCore & CesiumOnly & Partial<MapLibreOnly>;

/* ── THE FACADE — the eight namespaces every other file sees through window.IntMapGeoEngine ── */

export interface GeoEngineCamera {
  flyTo(o?: any): any;
  easeTo(o?: any): any;
  jumpTo(o?: any): any;
  fitBounds(b?: any, o?: any): any;
  setPadding(p?: any): any;
  get(): CameraState | null;
  setProjection(mo?: any): any;
  getZoom(): any;
  getCenter(): any;
  getBearing(): any;
  getPitch(): any;
  getBounds(): any;
  zoomTo(z?: any, o?: any): any;
  zoomIn(o?: any): any;
  zoomOut(o?: any): any;
  stop(): any;
  forBounds(b?: any, o?: any): any;
  getPadding(): any;
  getProjection(): any;
  globeness(): any;
  viewFrame(): any;
  setBearing(b?: any): any;
  setPitch(p?: any): any;
  getRoll(): any;
  setRoll(r?: any): any;
  getMaxPitch(): any;
  setMaxPitch(v?: any): any;
  getMinPitch(): any;
  setMinZoom(v?: any): any;
  getMinZoom(): any;
  setMaxZoom(v?: any): any;
  getMaxZoom(): any;
  zoomRange(): any;
  tiltRange(): any;
  altitude(): any;
  eye(): any;
  setEye(o?: any): any;
  setCenterClamped(v?: any): any;
  setHorizonReach(v?: any): any;
  setTiltPivot(mo?: any): any;
  eyePivotDiag(): any;
  isAnimating(): any;
  setCenter(c?: any): any;
  panBy(o?: any, opt?: any): any;
  setMaxBounds(b?: any): any;
  setRenderWorldCopies(v?: any): any;
  getRenderWorldCopies(): any;
  fromTo(f?: any, fa?: any, t?: any, ta?: any): any;
}

export interface GeoEngineCoords {
  project(ll?: any): any;
  unproject(pt?: any): any;
  terrainElevation(ll?: any, o?: any): any;
  queryRenderedFeatures(g?: any, o?: any): any;
  projectAltitude(ll?: any, a?: any): any;
  querySourceFeatures(s?: any, p?: any): any;
  worldSize(): any;
  lngLat(lng?: any, lat?: any): any;
}

export interface GeoEngineLayerWitness {
  /** runs `fn`, recording every layer id it asks `has` / `get` about, and pairs each with the layer held after it returns */
  run<T>(fn: () => T): T;
  /** true when a pass has completed and every recorded id still names the same layer */
  unchanged(): boolean;
}

export interface GeoEngineLayers {
  hasSource(id?: any): any;
  addSource(id?: any, d?: any): any;
  setSourceData(id?: any, d?: any, o?: any): any;
  removeSource(id?: any): any;
  has(id?: any): any;
  add(d?: any, b?: any): any;
  remove(id?: any): any;
  setVisible(id?: any, v?: any): any;
  isVisible(id?: any): any;
  setPaint(id?: any, p?: any, v?: any): any;
  setLayout(id?: any, p?: any, v?: any, o?: any): any;
  setOpacity(id?: any, v?: any): any;
  addExtrusion(d?: any, b?: any): any;
  setExtrusionRange(id?: any, a?: any, b?: any): any;
  addSolid(id?: any, b?: any): any;
  setSolid(id?: any, o?: any): any;
  addLimb(id?: any, b?: any): any;
  setLimb(id?: any, o?: any): any;
  removeLimb(id?: any): any;
  hasLimb(id?: any): any;
  limbDrawn(id?: any): any;
  removeSolid(id?: any): any;
  addOrbit(id?: any, b?: any): any;
  setOrbit(id?: any, o?: any): any;
  removeOrbit(id?: any): any;
  addAircraftCloud(id?: any, b?: any): any;
  setAircraftCloud(id?: any, o?: any): any;
  removeAircraftCloud(id?: any): any;
  hasAircraftCloud(id?: any): any;
  projectMercAlt(a?: any): any;
  setFeatureState(f?: any, s?: any): any;
  removeFeatureState(f?: any, k?: any): any;
  getPaint(id?: any, p?: any): any;
  get(id?: any): any;
  getLayout(id?: any, p?: any): any;
  move(id?: any, before?: any): any;
  setFilter(id?: any, f?: any): any;
  getFilter(id?: any): any;
  getFeatureState(f?: any): any;
  /** «Is any layer this pass looked at not the one it last found?» — see `witness` in js/geo-engine.js. */
  witness(): GeoEngineLayerWitness;
  updateImage(id?: any, o?: any): any;
  addDynamicImage(id?: any, o?: any, b?: any): any;
  imageRowLatitudes(c?: any, h?: any): any;
  touchDynamicImage(id?: any): any;
  setDynamicImageOpacity(id?: any, v?: any): any;
  setDynamicImageCoords(id?: any, c?: any): any;
  hasDynamicImage(id?: any): any;
  removeDynamicImage(id?: any): any;
  sourceData(id?: any): any;
  setSourceTiles(id?: any, t?: any): any;
}

export interface GeoEngineScene {
  getStyle(): any;
  setLight(l?: any): any;
  setSunDirection(o?: any): any;
  setWorldBase(on?: any): any;
  setSky(s?: any): any;
  getSky(): any;
  setTerrain(t?: any): any;
  getTerrain(): any;
  addImage(id?: any, img?: any, o?: any): any;
  hasImage(id?: any): any;
  removeImage(id?: any): any;
  addProtocol(n?: any, fn?: any): any;
  setImageConcurrency(n?: any): any;
  setCjkFontFamily(f?: any): any;
  demContourSource(o?: any): any;
}

export interface GeoEngineUi {
  popup(o?: any): any;
  marker(o?: any): any;
  createView(o?: any): any;
  createSubView(o?: any): any;
  addMarker(o?: any, ll?: any): any;
  addPopup(o?: any, ll?: any, html?: any): any;
  attach(o?: any): any;
}

export interface GeoEngineRender {
  resize(): any;
  triggerRepaint(): any;
  canvas(): any;
  onNextFrame(ms?: any, fn?: any): any;
  ticking(ms?: any): any;
  /** a painter declares the sources it draws, under the effect keys its capabilities write */
  claim(ids?: any, owner?: any, o?: any): any;
  /** 「is it on the map」: per-source state of claimed (or named) surfaces, and whether the renderer could be asked */
  drawn(q?: any): SurfacesDrawn;
  /** runs the claimant's own remover for a claimed source; false when none was declared */
  clearSurface(id?: any): any;
  container(): any;
  size(): any;
  setCursor(c?: any): any;
  getRenderScale(): any;
  setRenderScale(r?: any): any;
  canvasContainer(): any;
  instrumentFrames(cb?: any): any;
  sceneStats(): any;
  commands(): any;
  commandsReset(): any;
  commandConfig(patch?: any): any;
}

export interface GeoEngineInput {
  setDragPan(on?: any): any;
  set(name?: any, on?: any): any;
  names(): any;
  setAll(on?: any): any;
  setZoomRate(r?: any, wheel?: any): any;
}

export interface GeoEngineEvents {
  on(e?: any, c?: any): any;
  off(e?: any, c?: any): any;
  once(e?: any, c?: any): any;
  onLayer(e?: any, l?: any, c?: any, options?: any): any;
  offLayer(e?: any, l?: any, c?: any): any;
  onceLayer(e?: any, l?: any, c?: any): any;
  clickLayers(options?: any): any;
  claimClick(e?: any): any;
  clickClaimed(e?: any): any;
}

/** What engineFacade(A) returns — for the primary view and for every ui.createSubView. */
export interface GeoEngineFacade {
  /** Only on a facade ui.createSubView returned: tears that view down (the primary view has none). */
  destroy?: () => boolean;
  id(): string;
  capabilities(): GeoEngineCapabilities;
  can(f: string): boolean;
  camera: GeoEngineCamera;
  coords: GeoEngineCoords;
  hasRenderer(): boolean;
  ready(): any;
  canDraw(): any;
  /** Resolves once this view has a renderer whose style can take addSource/addLayer — never before. */
  whenCanDraw(): Promise<void>;
  layers: GeoEngineLayers;
  scene: GeoEngineScene;
  ui: GeoEngineUi;
  render: GeoEngineRender;
  input: GeoEngineInput;
  events: GeoEngineEvents;
  raw(): any;
}

/** window.IntMapGeoEngine: the facade bound to the installed adapter, plus the engine-level members. */
export interface IntMapGeoEngine extends GeoEngineFacade {
  adapter(): GeoEngineAdapter;
  use(a: GeoEngineAdapter): GeoEngineAdapter;
  contracts(): { maplibre: GeoEngineCapabilities; cesium: DeclaredContract };
  makeFacade(adapterOrGetter: GeoEngineAdapter | (() => GeoEngineAdapter)): GeoEngineFacade;
}
