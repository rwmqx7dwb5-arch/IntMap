# `data/` — bundled intelligence datasets

## `asher_languages.geojson` — World languages layer

The **World languages** overlay (Layers ▾ → *Intelligence (advanced)*) reads this file.

The committed file is a **tiny placeholder sample** (6 coarse language-family polygons) so the layer is
demonstrably wired — fill + outline + hover popup showing **Language** and **Family**.

### Use the real data
Replace it with the full digitised **Atlas of the World's Languages** (Asher & Moseley):

- Source: <https://github.com/jakejing/world-language-map-asher>
- Save the GeoJSON at **this exact path**: `data/asher_languages.geojson`

No code change is needed. The loader is tolerant of property names:

- **Language** ← `Language` · `language` · `name` · `NAME` · `Name`
- **Family**  ← `Family` · `family` · `FAMILY` · `fam` · `classification`

Fill colour is auto-assigned per **Family** (stable hash → HSL), so families are visually distinct.

### Performance / very large files
The GeoJSON source is created with `tolerance: 1.4`, `maxzoom: 8`, `buffer: 0` so MapLibre's worker
simplifies the polygons and never janks the UI. It is **lazy-loaded** (only fetched the first time the
layer is switched on) and cached in memory so a theme/basemap switch re-adds it without re-fetching.

### Even larger? Switch to vector tiles (MVT / PMTiles)
The layer is future-proofed. If you tile the dataset, set — before the map boots — e.g.:

```html
<script>window.LANGUAGES_TILES_URL = 'https://your-host/languages/{z}/{x}/{y}.pbf';</script>
```

and the layer transparently uses a `vector` source (`source-layer: "languages"`) instead of the local
GeoJSON. (For PMTiles, register the `pmtiles://` protocol with the pmtiles MapLibre plugin and point the
URL at your `.pmtiles` archive.)
