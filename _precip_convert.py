# -*- coding: utf-8 -*-
"""Build the annual-precipitation rasters from CHELSA V2.1 bio12 (#R266).

    input   CHELSA_bio12_1981-2010_V.2.1.tif   43200 x 20880, UInt16, scale 0.1 mm,
            one DEFLATE strip PER ROW, horizontal predictor, 84 N .. -90 S, 1/120 deg
    output  precip_mercator_1981-2010.png      8192 x 8192  Web-Mercator, 16 banded colours
            precip_mercator_1981-2010_4k.png   4096 x 4096  the same, for phones
            data/precip-mm.png                 3600 x 1800  equirectangular, 8-bit LOG mm
            data/precip-mm.json                the grid + the encoding, read at run time

「単に国別に塗るとかではないガチのやつ。ガチの細かいやつ。」 The World Bank already had a
country-average annual-precipitation choropleth (AG.LND.PRCP.MM); this is the 1 km field it
averages away.

⚠ THE STRIPS ARE READ DIRECTLY. PIL's TiffImageFile.load() decodes the WHOLE 1.8 GB image on first
access, which is both slow and out of proportion to what is needed: RowsPerStrip is 1, so a row is
one zlib blob of ~7.6 kB. Decompressing the rows this pass actually needs keeps the build to a few
hundred MB and a couple of minutes.

⚠ THE OCEAN IS NOT PAINTED. CHELSA is a LAND-surface climatology — its sea pixels are the
downscaling running where it has nothing to downscale — so the Mercator image is masked with the
app's own data/land-mask.png and the sea is left transparent for the basemap underneath.
"""
import io, json, math, os, struct, sys, zlib
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get('CHELSA_TIF') or os.path.join(HERE, 'CHELSA_bio12.tif')

MERC_PX = 8192            # the Köppen rasters' size, and the same 16384-safe ceiling
VAL_W, VAL_H = 3600, 1800  # 0.1 deg, the readout grid
SCALE = 0.1                # CHELSA's own DN -> mm
LAT_TOP = 83.99986041515
DEG = 1.0 / 120.0
MERC_LAT = 85.0511287798

# dry -> wet, 16 bands. Banded rather than continuous on purpose: a printed precipitation atlas is
# banded, a colour maps back to a range EXACTLY, and a flat band compresses like Köppen does.
BANDS = [50, 100, 200, 300, 400, 600, 800, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000]
COLS = [(0x7a, 0x4b, 0x12), (0xa2, 0x71, 0x2a), (0xc7, 0x9a, 0x49), (0xe0, 0xc0, 0x78),
        (0xf0, 0xdf, 0xa8), (0xdf, 0xea, 0xa0), (0xb6, 0xdf, 0x8f), (0x7f, 0xd0, 0x8a),
        (0x46, 0xbf, 0x95), (0x2a, 0xa9, 0xa8), (0x1f, 0x8f, 0xb8), (0x2a, 0x6f, 0xc0),
        (0x3f, 0x4f, 0xbd), (0x5b, 0x37, 0xad), (0x7a, 0x2a, 0x97), (0x94, 0x15, 0x7a)]
assert len(COLS) == len(BANDS) + 1

LOG_MAX = 12000.0          # the encoding's ceiling in mm; 2.8 % relative step at 8 bit


def strip_reader(path):
    """(rows, width, read(y)->uint16 row) straight off the TIFF's per-row DEFLATE strips."""
    f = open(path, 'rb')
    head = f.read(8)
    endian = '<' if head[:2] == b'II' else '>'
    (off,) = struct.unpack(endian + 'I', head[4:8])
    tags = {}
    f.seek(off)
    (n,) = struct.unpack(endian + 'H', f.read(2))
    TYPESZ = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}
    FMT = {1: 'B', 3: 'H', 4: 'I', 8: 'h', 9: 'i', 11: 'f', 12: 'd'}
    for _ in range(n):
        tag, typ, cnt, val = struct.unpack(endian + 'HHI4s', f.read(12))
        size = TYPESZ.get(typ, 1) * cnt
        if size > 4:
            (p,) = struct.unpack(endian + 'I', val)
            here = f.tell()
            f.seek(p)
            raw = f.read(size)
            f.seek(here)
        else:
            raw = val[:size]
        if typ in FMT:
            tags[tag] = struct.unpack(endian + FMT[typ] * cnt, raw)
        else:
            tags[tag] = raw
    W, H = tags[256][0], tags[257][0]
    offs, cnts = tags[273], tags[279]
    comp, pred = tags[259][0], tags.get(317, (1,))[0]
    assert tags[258][0] == 16 and comp == 8 and tags[278][0] == 1, (tags[258], comp, tags[278])

    def read(y):
        f.seek(offs[y])
        row = np.frombuffer(zlib.decompress(f.read(cnts[y])), dtype='<u2').astype(np.uint16)
        if pred == 2:
            row = np.cumsum(row, dtype=np.uint64).astype(np.uint16)
        return row
    return H, W, read


def main():
    if not os.path.exists(SRC):
        print('missing input:', SRC)
        return 2
    H, W, read = strip_reader(SRC)
    print('source', W, 'x', H)

    # ── the two outputs, filled row by row ─────────────────────────────────────────────────────
    merc = np.zeros((MERC_PX, MERC_PX, 4), dtype=np.uint8)
    val_acc = np.zeros((VAL_H, VAL_W), dtype=np.float64)
    val_n = np.zeros((VAL_H, VAL_W), dtype=np.int32)

    # source column -> output column, and -> value column (both are linear in longitude)
    src_x = np.arange(W)
    mx = np.clip(((src_x + 0.5) * DEG - 180.0 + 180.0) / 360.0 * MERC_PX, 0, MERC_PX - 1).astype(np.int32)
    vx = np.clip(((src_x + 0.5) * DEG) / 360.0 * VAL_W, 0, VAL_W - 1).astype(np.int32)

    # Mercator row -> latitude, so a source row can be told which output row it lands on
    def merc_row_of(lat):
        if lat >= MERC_LAT:
            return 0
        if lat <= -MERC_LAT:
            return MERC_PX - 1
        p = math.radians(lat)
        ymerc = math.log(math.tan(math.pi / 4 + p / 2))
        return int(min(MERC_PX - 1, max(0, (1 - ymerc / math.pi) / 2 * MERC_PX)))

    NB = len(COLS)
    acc_flat = np.zeros(MERC_PX * NB, dtype=np.int64)     # per-output-row band histogram, flat for bincount
    acc = acc_flat.reshape(MERC_PX, NB)
    vx_n = np.bincount(vx, minlength=VAL_W)               # the column tally is the same for every row
    cur = -1

    def flush(row_i):
        if row_i < 0:
            return
        tot = acc.sum(axis=1)
        hit = tot > 0
        if hit.any():
            best = acc.argmax(axis=1)
            cols = np.array(COLS, dtype=np.uint8)[best]
            merc[row_i, hit, 0:3] = cols[hit]
            merc[row_i, hit, 3] = 255
        acc_flat[:] = 0

    t_rows = 0
    for y in range(H):
        lat = LAT_TOP - (y + 0.5) * DEG
        if lat > MERC_LAT or lat < -MERC_LAT:
            continue
        row = read(y).astype(np.float32) * SCALE
        t_rows += 1

        # the readout grid: a plain mean over the cells the source row falls in
        vy = int(min(VAL_H - 1, max(0, (90.0 - lat) / 180.0 * VAL_H)))
        val_acc[vy] += np.bincount(vx, weights=row, minlength=VAL_W)
        val_n[vy] += vx_n

        # the picture: band index, tallied into the Mercator row it belongs to
        band = np.searchsorted(np.array(BANDS, dtype=np.float32), row, side='right')
        oy = merc_row_of(lat)
        if oy != cur:
            flush(cur)
            cur = oy
        acc_flat += np.bincount(mx * NB + band, minlength=MERC_PX * NB)
        if t_rows % 2000 == 0:
            print('  ...', t_rows, 'rows', flush=True)
    flush(cur)

    # rows of the Mercator image no source row landed on (high latitudes, where one output row is
    # finer than 1/120 deg): carry the nearest filled row rather than leaving a stripe
    filled = merc[:, :, 3].max(axis=1) > 0
    idx = np.arange(MERC_PX)
    if filled.any():
        good = idx[filled]
        nearest = good[np.clip(np.searchsorted(good, idx), 0, len(good) - 1)]
        for y in idx[~filled]:
            merc[y] = merc[nearest[y]]

    # ── mask the sea: CHELSA is a land climatology ─────────────────────────────────────────────
    # ⚠ THE MASK IS THE KÖPPEN RASTER'S OWN ALPHA. It is already 8192 × 8192 in this exact Mercator
    # frame with a hard 0/255 land alpha, so the two climate layers cannot disagree about where the
    # coast is — and it is 3× finer than data/land-mask.png (2048 wide = 0.18°, i.e. 20 km of colour
    # out to sea at this size). No reprojection, no second definition of «land».
    kp = os.path.join(HERE, 'koppen_mercator_1991-2020.png')
    if os.path.exists(kp):
        keep = np.asarray(Image.open(kp))[:, :, 3] > 0
        assert keep.shape == (MERC_PX, MERC_PX), keep.shape
    else:
        lm = Image.open(os.path.join(HERE, 'data', 'land-mask.png')).convert('L')
        lmw, lmh = lm.size
        lma = np.asarray(lm) > 127
        yy = np.arange(MERC_PX)
        ymerc = (1 - 2 * (yy + 0.5) / MERC_PX) * math.pi
        lat_of = np.degrees(np.arctan(np.sinh(ymerc)))
        ly = np.clip(((90.0 - lat_of) / 180.0 * lmh).astype(np.int32), 0, lmh - 1)
        lx = np.clip((np.arange(MERC_PX) / MERC_PX * lmw).astype(np.int32), 0, lmw - 1)
        keep = lma[np.ix_(ly, lx)]
    merc[:, :, 3] = np.where(keep, merc[:, :, 3], 0)

    out = os.path.join(HERE, 'precip_mercator_1981-2010.png')
    Image.fromarray(merc, 'RGBA').save(out, optimize=True)
    print('wrote', out, os.path.getsize(out))
    small = Image.fromarray(merc, 'RGBA').resize((4096, 4096), Image.NEAREST)
    out4 = os.path.join(HERE, 'precip_mercator_1981-2010_4k.png')
    small.save(out4, optimize=True)
    print('wrote', out4, os.path.getsize(out4))

    # ── the readout raster: 8-bit log(mm) ──────────────────────────────────────────────────────
    mm = np.zeros((VAL_H, VAL_W), dtype=np.float64)
    ok = val_n > 0
    mm[ok] = val_acc[ok] / val_n[ok]
    enc = np.zeros((VAL_H, VAL_W), dtype=np.uint8)
    lo = np.log1p(np.clip(mm, 0, LOG_MAX) / 10.0)
    enc[ok] = np.clip(np.round(lo[ok] / math.log1p(LOG_MAX / 10.0) * 254.0) + 1, 1, 255).astype(np.uint8)
    vout = os.path.join(HERE, 'data', 'precip-mm.png')
    Image.fromarray(enc, 'L').save(vout, optimize=True)
    print('wrote', vout, os.path.getsize(vout))
    json.dump({
        'source': 'CHELSA V2.1 bio12 — mean annual precipitation, 1981–2010 climatology',
        'url': 'https://chelsa-climate.org/',
        'file': 'CHELSA_bio12_1981-2010_V.2.1.tif',
        'width': VAL_W, 'height': VAL_H, 'degrees': 180.0 / VAL_H,
        'projection': 'equirectangular, -180..180 × 90..-90',
        'encoding': '0 = no source cell; 1..255 = round(log1p(mm/10)/log1p(%d/10)*254)+1' % int(LOG_MAX),
        'logMax': LOG_MAX,
        'bands': BANDS,
        'colors': ['#%02x%02x%02x' % c for c in COLS],
        'mercator': {'file': 'precip_mercator_1981-2010.png', 'phone': 'precip_mercator_1981-2010_4k.png',
                     'size': MERC_PX, 'latLimit': MERC_LAT, 'seaMasked': 'köppen alpha'},
        'bytes': os.path.getsize(vout),
    }, open(os.path.join(HERE, 'data', 'precip-mm.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print('rows used', t_rows)
    return 0


if __name__ == '__main__':
    sys.exit(main())
