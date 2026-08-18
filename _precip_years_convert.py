# -*- coding: utf-8 -*-
"""Build the PER-YEAR annual-precipitation raster from GPCC Full Data Monthly V2022 (#R266).

    input   full_data_monthly_v2022_<decade>_05.nc.gz   (DWD open data, NetCDF-3 classic,
            720 × 360 = 0.5°, 120 monthly records per decade, mm/month, global LAND)
    output  data/precip-year.png    720 × (360 × N years), 8-bit log(mm), years stacked as bands
            data/precip-year.json   the years, the grid and the encoding

⚠ WHY GPCC AND NOT IMERG. The plan was GPM IMERG, and IMERG's *annual accumulations* live behind an
Earthdata login — NASA GIBS publishes only the instantaneous RATE, which cannot be summed into a
year in a browser. GPCC is the gauge-based analysis the WMO uses for exactly this question, it is
open (opendata.dwd.de, no key), it is global LAND like the CHELSA climatology beside it, and 0.5°
is a real 55 km grid rather than a country average. What it is NOT is satellite coverage of the
ocean — and the layer says so.

⚠ ONE FILE, NOT FORTY. Each year is a 720 × 360 band inside a single PNG. Forty separate files is
forty requests and forty cache entries for a control the reader flicks through; stacked, the whole
1981–2020 set is one image, the year switch costs no network at all, and PNG's row filters make the
stack compress better than the sum of its parts.
"""
import gzip, json, math, os, struct, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get('GPCC_DIR') or os.path.join(HERE, 'gpcc')
DECADES = ['1981_1990', '1991_2000', '2001_2010', '2011_2020']
W, H = 720, 360
LOG_MAX = 12000.0      # the same encoding the CHELSA climatology uses, so one decoder serves both
FILL = -9e4


def read_header(f):
    """the fields of a NetCDF-3 classic header this build needs, read sequentially"""
    def u4():
        return struct.unpack('>I', f.read(4))[0]

    def nm():
        n = u4()
        s = f.read(n)
        pad = (4 - n % 4) % 4
        if pad:
            f.read(pad)
        return s.decode('utf-8', 'replace')

    def skip_attrs():
        tag = u4()
        if tag == 0:
            u4()
            return
        assert tag == 12, tag
        for _ in range(u4()):
            nm()
            t = u4()
            c = u4()
            sz = {1: 1, 2: 1, 3: 2, 4: 4, 5: 4, 6: 8}[t] * c
            f.read(sz + ((4 - sz % 4) % 4))

    magic = f.read(4)
    assert magic[:3] == b'CDF' and magic[3] == 1, magic
    numrecs = u4()
    tag = u4()
    dims = []
    if tag == 0:
        u4()
    else:
        for _ in range(u4()):
            dims.append([nm(), u4()])
    skip_attrs()
    tag = u4()
    variables = []
    if tag == 0:
        u4()
    else:
        for _ in range(u4()):
            name = nm()
            nd = u4()
            dimids = [u4() for _ in range(nd)]
            skip_attrs()
            t = u4()
            vsize = u4()
            begin = u4()
            variables.append(dict(name=name, dims=dimids, type=t, vsize=vsize, begin=begin))
    return numrecs, dims, variables


def decade(path):
    """yield the 120 monthly precip grids of one decade file, in order"""
    with gzip.open(path, 'rb') as f:
        numrecs, dims, variables = read_header(f)
        rec_dim = [i for i, d in enumerate(dims) if d[1] == 0]
        assert rec_dim, dims
        rid = rec_dim[0]
        recs = [v for v in variables if v['dims'] and v['dims'][0] == rid]
        assert recs[0]['name'] == 'time' and recs[1]['name'] == 'precip', [v['name'] for v in recs]
        pre = recs[0]['vsize']                                  # the time value ahead of precip
        post = sum(v['vsize'] for v in recs[2:])                # everything after it in the record
        pn = recs[1]['vsize']
        # the header ended where the first record begins
        f.read(recs[0]['begin'] - f.tell()) if recs[0]['begin'] > f.tell() else None
        for _ in range(numrecs):
            f.read(pre)
            raw = f.read(pn)
            if len(raw) != pn:
                raise EOFError('short record')
            g = np.frombuffer(raw, dtype='>f4').reshape(H, W).astype(np.float32)
            # skip the five companion fields of this record
            left = post
            while left > 0:
                n = f.read(min(left, 1 << 22))
                if not n:
                    raise EOFError('short skip')
                left -= len(n)
            yield g


def main():
    years, grids = [], []
    for d in DECADES:
        p = os.path.join(SRC, d + '.nc.gz')
        if not os.path.exists(p):
            print('missing', p)
            return 2
        y0 = int(d.split('_')[0])
        acc, n = None, 0
        for i, g in enumerate(decade(p)):
            g = np.where(g < FILL, np.nan, g)
            acc = g if acc is None else acc + g
            n += 1
            if n == 12:
                years.append(y0 + i // 12)
                grids.append(acc)
                acc, n = None, 0
        print(d, '->', years[-1], flush=True)
    assert len(years) == len(grids) and years == sorted(years), years

    stack = np.zeros((H * len(years), W), dtype=np.uint8)
    lo = math.log1p(LOG_MAX / 10.0)
    for i, g in enumerate(grids):
        ok = np.isfinite(g)
        enc = np.zeros((H, W), dtype=np.uint8)
        v = np.clip(np.nan_to_num(g, nan=0.0), 0, LOG_MAX)
        enc[ok] = np.clip(np.round(np.log1p(v[ok] / 10.0) / lo * 254.0) + 1, 1, 255).astype(np.uint8)
        stack[i * H:(i + 1) * H] = enc
    out = os.path.join(HERE, 'data', 'precip-year.png')
    Image.fromarray(stack, 'L').save(out, optimize=True)
    print('wrote', out, os.path.getsize(out))

    json.dump({
        'source': 'GPCC Full Data Monthly Product Version 2022 (Deutscher Wetterdienst) — gauge analysis, 0.5°, land only',
        'url': 'https://opendata.dwd.de/climate_environment/GPCC/full_data_monthly_v2022/05/',
        'doi': '10.5676/DWD_GPCC/FD_M_V2022_050',
        'method': 'the twelve monthly totals of each year summed into an annual total, per 0.5° cell',
        'years': years, 'width': W, 'height': H, 'degrees': 0.5,
        'projection': 'equirectangular, -180..180 × 90..-90; each year is a band of `height` rows, in `years` order',
        'encoding': '0 = no gauge analysis for this cell (sea, and the poles); 1..255 = round(log1p(mm/10)/log1p(%d/10)*254)+1' % int(LOG_MAX),
        'logMax': LOG_MAX,
        'bytes': os.path.getsize(out),
    }, open(os.path.join(HERE, 'data', 'precip-year.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print('years', years[0], '..', years[-1], len(years))
    return 0


if __name__ == '__main__':
    sys.exit(main())
