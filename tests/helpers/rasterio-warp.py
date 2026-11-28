# Independent nearest-neighbour reference, used only by the GIS regression checks.
import json
import sys

import numpy as np
from rasterio import Affine
from rasterio.warp import Resampling, reproject

case = json.load(sys.stdin)
target = case["target"]
destination = np.empty((target["height"], target["width"]), dtype=np.float64)
reproject(
    np.array(case["source"], dtype=np.float64).reshape(case["shape"]),
    destination,
    src_transform=Affine.from_gdal(*case["affine"]),
    src_crs="EPSG:4326",
    src_nodata=case["nodata"],
    dst_transform=Affine(target["pixelLng"], 0, target["west"], 0, -target["pixelLat"], target["north"]),
    dst_crs="EPSG:4326",
    dst_nodata=np.nan,
    resampling=Resampling.nearest,
)
json.dump([float(v) if np.isfinite(v) else None for v in destination.flat], sys.stdout)
