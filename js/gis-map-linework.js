/* Linework is extracted in the same top-left viewport as the source preview.
 * Filled or clipped artwork can be traced as rendered pixels instead. */

export const KERNEL_VERSION = 'map-linework-3';
const IDENTITY = [1, 0, 0, 1, 0, 0];
const mul = ([a, b, c, d, x, y], [e, f, g, h, u, v]) =>
  [a*e+c*f, b*e+d*f, a*g+c*h, b*g+d*h, a*u+c*v+x, b*u+d*v+y];
const move = ([a, b, c, d, x, y], [u, v]) => [a*u+c*v+x, b*u+d*v+y];
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const mid = (a, b) => [(a[0]+b[0])/2, (a[1]+b[1])/2];

function bezier(out, a, b, c, d, depth = 0) {
  const delta = (p, q) => Math.hypot(p[0]-q[0], p[1]-q[1]);
  const excess = delta(a, b) + delta(b, c) + delta(c, d) - delta(a, d);
  const x = d[0]-a[0], y = d[1]-a[1], length = Math.hypot(x, y);
  const offset = (p) => length ? Math.abs(x*(p[1]-a[1]) - y*(p[0]-a[0]))/length : delta(p, a);
  if (depth === 12 || (excess <= 0.25 && Math.max(offset(b), offset(c)) <= 0.25)) {
    out.push(d);
    return;
  }
  const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d);
  const abc = mid(ab, bc), bcd = mid(bc, cd), m = mid(abc, bcd);
  bezier(out, a, ab, abc, m, depth + 1);
  bezier(out, m, bcd, cd, d, depth + 1);
}

function pdfLines(data, transform, close) {
  const lines = [];
  let line;
  const point = (i) => move(transform, [data[i], data[i+1]]);
  // PDF.js 6 constructPath embeds the DrawOPS stream used by its renderer.
  // Unknown opcodes refuse this path instead of consuming the wrong arity.
  for (let i = 0; i < data.length;) {
    const op = data[i++];
    if (op === 0 || op === 1) {
      if (op === 0) { line = []; lines.push(line); }
      if (!line || i+1 >= data.length) return null;
      line.push(point(i)); i += 2;
    } else if (op === 2 || op === 3) {
      const start = line?.at(-1);
      const count = op === 2 ? 6 : 4;
      if (!start || i+count > data.length) return null;
      const c1 = point(i), end = point(i+count-2);
      const mix = (p) => [(p[0]+2*c1[0])/3, (p[1]+2*c1[1])/3];
      bezier(line, start, op === 2 ? c1 : mix(start), op === 2 ? point(i+2) : mix(end), end);
      i += count;
    } else if (op === 4 && line?.length) {
      if (!same(line.at(-1), line[0])) line.push(line[0]);
    } else return null;
  }
  if (close && line?.length && !same(line.at(-1), line[0])) line.push(line[0]);
  return lines;
}

const sameValues = (expected, actual) => Array.isArray(expected) && expected.length === actual.length
  && expected.every((value, index) => Math.abs(value - actual[index]) < 1e-6);
function within(lines, width, height) {
  const epsilon = 32*Number.EPSILON*Math.max(width, height);
  return lines?.length && lines.every(line => line.length >= 2 && line.every(([x, y]) =>
    Number.isFinite(x+y) && x >= -epsilon && y >= -epsilon && x <= width + epsilon && y <= height + epsilon));
}

export function pdfLinework(list, ops, viewport, legend) {
  const shapes = [], stack = [];
  const strokes = new Set([ops.stroke, ops.closeStroke, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
  const closes = new Set([ops.closeStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
  const fills = new Set([ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
  const styleCounts = new Map();
  const byColor = new Map();
  legend?.forEach((rule, index) => {
    const key = (rule.stroke || rule.color).toLowerCase();
    if (!byColor.has(key)) byColor.set(key, []);
    byColor.get(key).push({ rule, index });
  });
  let state = { matrix: viewport.transform, color: '#000000', dashArray: [], dashOffset: 0, strokeWidth: 1, unsupported: false };
  const visible = { unmatched: 0, ambiguous: 0, unsupported: 0 };
  const changed = (entries) => {
    for (const [key, value] of entries || []) {
      if (key === 'LW') state.strokeWidth = value;
      else if (key === 'D') {
        state.dashArray = Array.from(value?.[0] || []);
        state.dashOffset = value?.[1] || 0;
      } else if ((key === 'CA' && value !== 1) || (key === 'SMask' && value)) state.unsupported = true;
    }
  };
  for (let i = 0; i < list.fnArray.length; i++) {
    const op = list.fnArray[i], args = list.argsArray[i] || [];
    if (op === ops.save) stack.push({ ...state });
    else if (op === ops.restore) state = stack.pop() || state;
    else if (op === ops.transform) state.matrix = mul(state.matrix, args);
    else if (op === ops.clip || op === ops.eoClip) state.unsupported = true;
    else if (op === ops.paintFormXObjectBegin || op === ops.beginGroup) {
      stack.push({ ...state }); state.unsupported = true;
    } else if (op === ops.paintFormXObjectEnd || op === ops.endGroup) state = stack.pop() || state;
    else if (op === ops.setStrokeRGBColor) state.color = typeof args[0] === 'string' ? args[0].toLowerCase() : null;
    else if ([ops.setStrokeColor, ops.setStrokeColorN, ops.setStrokeGray, ops.setStrokeCMYKColor, ops.setStrokeTransparent].includes(op)) state.color = null;
    else if (op === ops.setLineWidth) state.strokeWidth = args[0];
    else if (op === ops.setDash) changed([['D', args]]);
    else if (op === ops.setGState) changed(args[0]);
    else if (op === ops.constructPath && strokes.has(args[0])) {
      const { color, dashArray, dashOffset, strokeWidth } = state;
      const dash = dashArray.length ? 'dashed' : 'solid';
      const paintedFill = fills.has(args[0]);
      if (!legend) {
        const style = { color, dash, dashArray, dashOffset, strokeWidth, paintedFill, supported: !state.unsupported };
        const key = JSON.stringify(style);
        if (!styleCounts.has(key)) styleCounts.set(key, { ...style, elements: 0 });
        styleCounts.get(key).elements++;
        continue;
      }
      const candidates = (byColor.get(color) || []).filter(({ rule }) =>
        (rule.dash == null || rule.dash === dash)
        && (rule.dashArray == null || sameValues(rule.dashArray, dashArray))
        && (rule.strokeWidth == null || Math.abs(rule.strokeWidth - strokeWidth) < 1e-6)
        && (rule.paintedFill == null || rule.paintedFill === paintedFill));
      if (!candidates.length) { visible.unmatched++; continue; }
      if (candidates.length > 1) { visible.ambiguous++; continue; }
      const lines = !state.unsupported && args[1]?.[0]
        && pdfLines(args[1][0], state.matrix, closes.has(args[0]))?.filter(line => line.length >= 2);
      if (!within(lines, Math.ceil(viewport.width), Math.ceil(viewport.height))) { visible.unsupported++; continue; }
      for (const coordinates of lines) shapes.push({ classIndex: candidates[0].index, type: 'LineString', coordinates });
    }
  }
  if (!legend) {
    const styles = [...styleCounts.values()];
    const strokeColors = [...new Set(styles.map(style => style.color).filter(Boolean))];
    const limit = 32; // Model-facing inspection preview. Extraction still evaluates every operator.
    return { strokeColors: strokeColors.slice(0, limit), strokeStyles: styles.slice(0, limit),
      omitted: Math.max(0, styles.length - limit) };
  }
  return { shapes, skipped: visible.unsupported, unclassified: visible };
}

const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/iy;
const SVG_COMMAND = /^[MLHVCSQTAZ]$/i;
const ARITY = { m:2, l:2, h:1, v:1, c:6, s:4, q:4, t:2, a:7 };
const SVG_NS = 'http://www.w3.org/2000/svg';
const ELEMENTS = 'path,line,polygon,polyline,rect';
const NON_PAINTED = 'defs,clipPath,mask,symbol,pattern,marker';
const INHERITED = ['fill', 'stroke', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'color', 'visibility'];

function svgArc(node, start, values, end, transform, out) {
  const arc = node.ownerDocument.createElementNS(SVG_NS, 'path');
  arc.setAttribute('d', 'M' + start.join(' ') + ' A' + values.slice(0, 5).join(' ') + ' ' + end.join(' '));
  const length = arc.getTotalLength();
  const at = distance => {
    const p = arc.getPointAtLength(distance);
    return move(transform, [p.x, p.y]);
  };
  const sample = (left, right, a, b, depth) => {
    const center = (left + right)/2;
    const c = at(center);
    const middle = mid(a, b);
    if (depth === 12 || Math.hypot(c[0]-middle[0], c[1]-middle[1]) <= 0.25) out.push(b);
    else {
      sample(left, center, a, c, depth+1);
      sample(center, right, c, b, depth+1);
    }
  };
  for (let i = 0; i < 4; i++) {
    const left = i*length/4, right = (i+1)*length/4;
    sample(left, right, i === 0 ? move(transform, start) : out.at(-1),
      i === 3 ? move(transform, end) : at(right), 0);
  }
}

function svgPath(node, transform) {
  const d = node.getAttribute('d') || '';
  const lines = [];
  let i = 0, command, previous, handle, xy = [0, 0], start, line;
  const whitespace = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const point = ([x, y], relative) => relative ? [x+xy[0], y+xy[1]] : [x, y];
  const mapped = p => move(transform, p);
  const mirror = p => [2*xy[0]-p[0], 2*xy[1]-p[1]];
  while (true) {
    whitespace();
    if (i === d.length) break;
    if (SVG_COMMAND.test(d[i])) command = d[i++];
    if (!command) return null;
    const c = command.toLowerCase(), relative = command === c;
    if (c !== 'm' && !line) return null;
    if (c === 'z') {
      if (!same(line.at(-1), line[0])) line.push(line[0]);
      xy = start;
      command = null;
    } else {
      const values = [];
      for (let j = 0; j < ARITY[c]; j++) {
        whitespace();
        NUMBER.lastIndex = i;
        const token = c === 'a' && (j === 3 || j === 4) ? (/^[01]$/.test(d[i]) ? d[i] : null) : NUMBER.exec(d)?.[0];
        if (!token || !Number.isFinite(+token)) return null;
        i += token.length;
        values.push(+token);
      }
      const end = c === 'h' ? [values[0] + (relative ? xy[0] : 0), xy[1]]
        : c === 'v' ? [xy[0], values[0] + (relative ? xy[1] : 0)] : point(values.slice(-2), relative);
      if (c === 'm') {
        line = [mapped(end)];
        lines.push(line);
        start = end;
        command = relative ? 'l' : 'L';
      } else if (c === 'a') {
        if (values[0] < 0 || values[1] < 0) return null;
        if (values[0] === 0 || values[1] === 0) line.push(mapped(end));
        else if (!same(xy, end)) svgArc(node, xy, values, end, transform, line);
      } else if (c === 'c' || c === 's') {
        const first = c === 'c' ? point(values.slice(0, 2), relative) : /[cs]/.test(previous) ? mirror(handle) : xy;
        handle = point(values.slice(-4, -2), relative);
        bezier(line, mapped(xy), mapped(first), mapped(handle), mapped(end));
      } else if (c === 'q' || c === 't') {
        handle = c === 'q' ? point(values.slice(0, 2), relative) : /[qt]/.test(previous) ? mirror(handle) : xy;
        const toCubic = p => [(p[0]+2*handle[0])/3, (p[1]+2*handle[1])/3];
        bezier(line, mapped(xy), mapped(toCubic(xy)), mapped(toCubic(end)), mapped(end));
      } else line.push(mapped(end));
      xy = end;
    }
    previous = c;
  }
  return lines;
}

function svgLines(node, transform) {
  const a = (name) => node.getAttribute(name);
  if (node.localName === 'path') return svgPath(node, transform);
  if (node.localName === 'line') return [[['x1','y1'], ['x2','y2']].map(keys => move(transform, keys.map(key => +(a(key) || 0))))];
  if (node.localName === 'rect') {
    const [x,y,w,h] = ['x','y','width','height'].map(key => +(a(key) || 0));
    if (!(w > 0 && h > 0) || +(a('rx') || 0) !== 0 || +(a('ry') || 0) !== 0) return null;
    return [[[x,y], [x+w,y], [x+w,y+h], [x,y+h], [x,y]].map(p => move(transform,p))];
  }
  const points = (a('points') || '').trim().match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || [];
  if (points.length < 4 || points.length % 2 || points.some(p => !Number.isFinite(+p))) return null;
  const line = [];
  for (let i = 0; i < points.length; i += 2) line.push(move(transform, [+points[i], +points[i+1]]));
  if (node.localName === 'polygon' && !same(line.at(-1), line[0])) line.push(line[0]);
  return [line];
}

function svgProperties(node, root, palette) {
  let matrix = IDENTITY, unsupported = false;
  const ids = [], paint = {};
  for (let el = node; el; el = el.parentElement) {
    if (el.id) ids.push(el.id);
    const style = name => el.style?.getPropertyValue(name)?.trim() || el.getAttribute(name);
    for (const name of INHERITED) {
      const value = style(name);
      if (value && value !== 'inherit') paint[name] ??= value;
    }
    if (style('display') === 'none' || Number(style('opacity') ?? 1) === 0) return null;
    if (['clip-path', 'mask', 'filter'].some(name => style(name) && style(name) !== 'none')
      || el.style?.getPropertyValue('transform') || el.style?.getPropertyValue('d')
      || el !== root && el.localName === 'svg') unsupported = true;
    const transforms = el.transform?.baseVal;
    for (let i = (transforms?.numberOfItems || 0) - 1; i >= 0; i--) {
      const { a, b, c, d, e, f } = transforms.getItem(i).matrix;
      matrix = mul([a, b, c, d, e, f], matrix);
    }
    if (el === root) {
      if (['hidden','collapse'].includes(paint.visibility)) return null;
      const color = (value, fallback) => palette?.(value?.toLowerCase() === 'currentcolor' ? paint.color || '#000000' : value || fallback);
      return { ids, matrix, unsupported, fill: Number(paint['fill-opacity'] ?? 1) === 0 ? null : color(paint.fill, '#000000'),
        stroke: Number(paint['stroke-opacity'] ?? 1) === 0 ? null : color(paint.stroke, 'none'),
        fillRule: paint['fill-rule'] || 'nonzero' };
    }
  }
  return null;
}

function paintReader() {
  // CSS parses named colours, short hex and rgb() without attaching the untrusted SVG to the document.
  const c = document.createElement('canvas').getContext('2d');
  const resolved = new Map();
  return value => {
    if (!resolved.has(value)) {
      c.fillStyle = '#000001'; c.fillStyle = value;
      const first = c.fillStyle;
      c.fillStyle = '#000002'; c.fillStyle = value;
      resolved.set(value, c.fillStyle === first && /^#[a-f0-9]{6}$/i.test(first) ? first.toLowerCase() : null);
    }
    return resolved.get(value);
  };
}

function svgViewport(root, size) {
  const width = size.width, height = size.height;
  const box = root.viewBox?.baseVal;
  const ar = root.preserveAspectRatio?.baseVal;
  const sx = box?.width > 0 ? width/box.width : width/size.nativeWidth;
  const sy = box?.height > 0 ? height/box.height : height/size.nativeHeight;
  const s = (ar?.meetOrSlice === 2 ? Math.max : Math.min)(sx, sy);
  const none = ar?.align === 1 || !(box?.width > 0);
  const x = none ? sx : s, y = none ? sy : s;
  const align = Math.max(0, (ar?.align || 6) - 2);
  const tx = none ? 0 : (width - x*box.width) * (align % 3) / 2;
  const ty = none ? 0 : (height - y*box.height) * Math.floor(align/3) / 2;
  return [x, 0, 0, y, tx - x*(box?.x || 0), ty - y*(box?.y || 0)];
}

export function svgLandmarks(root, size) {
  const viewport = svgViewport(root, size);
  const marks = [];
  for (const node of root.querySelectorAll('circle,ellipse')) {
    if (node.namespaceURI !== root.namespaceURI || node.closest('defs,clipPath,mask,symbol,pattern,marker')) continue;
    const name = node.querySelector(':scope > title')?.textContent?.trim() || node.getAttribute('aria-label') || node.id;
    const center = ['cx','cy'].map(key => Number(node.getAttribute(key) || 0));
    const shape = name && center.every(Number.isFinite) && svgProperties(node, root);
    if (shape && !shape.unsupported) marks.push({ name, pixel: move(mul(viewport, shape.matrix), center) });
  }
  return marks;
}

const signedArea = path => path.slice(1).reduce((area, [x,y], i) => area + path[i][0]*y - path[i][1]*x, 0);
function contains(ring, [x, y]) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [a,b] = ring[i-1], [c,d] = ring[i];
    if ((b > y) !== (d > y) && x < a + (c-a)*(y-b)/(d-b)) inside = !inside;
  }
  return inside;
}

function ringBounds(ring) {
  return ring.reduce(([l,t,r,b], [x,y]) => [Math.min(l,x), Math.min(t,y), Math.max(r,x), Math.max(b,y)],
    [Infinity, Infinity, -Infinity, -Infinity]);
}

function boundsOverlap([l,t,r,b], [x,y,u,v]) {
  return l <= u && x <= r && t <= v && y <= b;
}

const angleSide = (a,b,p) => Math.sign((b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0]));
function intersectRings(left, right) {
  for (let i = 1; i < left.length; i++) {
    const a = left[i-1], b = left[i], bounds = ringBounds([a,b]);
    for (let j = 1; j < right.length; j++) {
      const c = right[j-1], d = right[j];
      if (!boundsOverlap(bounds, ringBounds([c,d]))) continue;
      if (angleSide(a,b,c)*angleSide(a,b,d) <= 0 && angleSide(c,d,a)*angleSide(c,d,b) <= 0) return true;
    }
  }
  return false;
}

function filledRings(lines, fillRule) {
  const rings = [];
  for (const points of lines) {
    const ring = points.filter((point, i) => i === 0 || !same(point, points[i-1]));
    if (ring.length < 2) return null;
    if (!same(ring.at(-1), ring[0])) ring.push(ring[0]);
    const area = signedArea(ring);
    if (ring.length < 4 || !area) return null;
    const bounds = ringBounds(ring);
    // Intersecting subpaths need a planar overlay to preserve SVG winding.
    // Hold back those elements until they can be recovered without guessing.
    if (rings.some(other => boundsOverlap(bounds, other.bounds) && intersectRings(ring, other.ring))) return null;
    rings.push({ ring, bounds, area, winding: 0, polygon: null });
  }
  rings.sort((a,b) => Math.abs(b.area) - Math.abs(a.area));
  const polygons = [];
  for (const [i, item] of rings.entries()) {
    const parent = rings.slice(0,i).findLast(r => contains(r.ring, item.ring[0]));
    const outside = parent?.winding ?? 0;
    item.winding = fillRule === 'evenodd' ? 1-outside : outside+Math.sign(item.area);
    if (!outside && item.winding) {
      item.polygon = [item.ring];
      polygons.push(item.polygon);
    } else if (outside && !item.winding) {
      parent.polygon.push(item.ring);
    } else item.polygon = parent?.polygon;
  }
  return polygons;
}

export function svgLinework(root, size, legend) {
  const { width, height } = size;
  const viewport = svgViewport(root, size);
  const shapes = [];
  const summaries = new Map(), elementIds = new Set(), foundIds = new Set();
  const unclassified = { unmatched: 0, ambiguous: 0, unsupported: 0, missingSelectors: 0 };
  const palette = paintReader();
  const rules = legend?.map((rule, classIndex) => ({ rule, classIndex }));
  const stylesheet = root.querySelector('style') || [...root.ownerDocument.childNodes]
    .some(node => node.nodeType === 7 && node.target === 'xml-stylesheet');
  for (const node of root.querySelectorAll(ELEMENTS + ',use,circle,ellipse')) {
    if (node.namespaceURI !== SVG_NS || node.closest(NON_PAINTED)) continue;
    const attributes = svgProperties(node, root, palette);
    if (!attributes) continue;
    const { ids, matrix, fill, stroke, fillRule, unsupported } = attributes;
    if (!legend) {
      for (const id of ids) elementIds.add(id);
      const key = JSON.stringify([ids, fill, stroke, fillRule]);
      if (!summaries.has(key)) summaries.set(key, { elementIds: ids, fill, stroke, fillRule, elements: 0 });
      summaries.get(key).elements++;
      continue;
    }
    for (const id of ids) foundIds.add(id);
    const matching = rules.filter(({ rule }) =>
      (!rule.elementIds?.length || rule.elementIds.some(id => ids.includes(id)))
      && (rule.fill == null || stylesheet || rule.fill.toLowerCase() === fill)
      && (rule.stroke == null || stylesheet || rule.stroke.toLowerCase() === stroke));
    if (!matching.length) { unclassified.unmatched++; continue; }
    if (stylesheet && matching.some(({rule}) => rule.fill != null || rule.stroke != null || rule.geometry === 'Polygon')) {
      unclassified.unsupported++; continue;
    }
    if (matching.length > 1) { unclassified.ambiguous++; continue; }
    const { rule, classIndex } = matching[0];
    const type = rule.geometry || 'LineString';
    const lines = !unsupported && node.matches(ELEMENTS) && svgLines(node, mul(viewport, matrix));
    if (!within(lines, width, height)) { unclassified.unsupported++; continue; }
    const paths = type === 'Polygon' ? fill && filledRings(lines, fillRule) : lines;
    if (!paths?.length) { unclassified.unsupported++; continue; }
    for (const coordinates of paths) shapes.push({ classIndex, type, coordinates,
      ...(ids.length && { sourceElementId: ids[0] }), sourcePaint: type === 'Polygon' ? fill : stroke });
  }
  if (!legend) {
    const ids = [...elementIds], groups = [...summaries.values()];
    const limit = 32; // Model-facing preview only.
    return { elementIds: ids.slice(0, limit), groups: groups.slice(0, limit), stylesheet: !!stylesheet,
      omitted: Math.max(0, ids.length - limit), groupsOmitted: Math.max(0, groups.length - limit) };
  }
  unclassified.missingSelectors = new Set(legend.flatMap(rule => rule.elementIds || []).filter(id => !foundIds.has(id))).size;
  return { shapes, skipped: unclassified.unsupported + unclassified.missingSelectors, unclassified };
}
