/* Linework is extracted in the same top-left viewport as the source preview.
 * Filled or clipped artwork can be traced as rendered pixels instead. */
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

export function pdfLinework(list, ops, viewport, legend) {
  const shapes = [];
  const stack = [];
  const stroke = new Set([ops.stroke, ops.closeStroke, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
  const closes = new Set([ops.closeStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
  const colors = new Map();
  legend.forEach((v, i) => { if (!colors.has(v.color.toLowerCase())) colors.set(v.color.toLowerCase(), i); });
  let state = { matrix: viewport.transform, color: '#000000', unsupported: false };
  let skipped = 0;
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
    else if (op === ops.setGState && args[0]?.some(([k, v]) => (k === 'CA' && v !== 1) || (k === 'SMask' && v))) state.unsupported = true;
    else if (op === ops.constructPath && stroke.has(args[0]) && colors.has(state.color)) {
      const lines = !state.unsupported && args[1]?.[0] && pdfLines(args[1][0], state.matrix, closes.has(args[0]));
      if (!lines || lines.some((line) => line.some(([x, y]) => !Number.isFinite(x+y) || x < 0 || y < 0 || x > Math.ceil(viewport.width) || y > Math.ceil(viewport.height)))) {
        skipped++;
      } else {
        for (const coordinates of lines) if (coordinates.length >= 2) shapes.push({ classIndex: colors.get(state.color), type: 'LineString', coordinates });
      }
    }
  }
  return { shapes, skipped };
}

const TOKEN = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi;
const LINE_COMMAND = /^[mlhvz]$/i;
function linearPath(d) {
  if (d.replace(TOKEN, '').replace(/[,\s]/g, '')) return null;
  const tokens = d.match(TOKEN) || [];
  const lines = [];
  let command, x = 0, y = 0, line;
  for (let i = 0; i < tokens.length;) {
    if (LINE_COMMAND.test(tokens[i])) command = tokens[i++];
    if (!command || /^[a-z]$/i.test(tokens[i] || '') && !/^z$/i.test(command)) return null;
    const c = command.toLowerCase();
    const rel = command === c;
    if (c === 'z') {
      if (!line?.length) return null;
      [x, y] = line[0];
      if (!same(line.at(-1), line[0])) line.push([x, y]);
      command = null; continue;
    }
    const first = Number(tokens[i++]), second = c === 'h' || c === 'v' ? 0 : Number(tokens[i++]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
    if (c === 'h') x = first + (rel ? x : 0);
    else if (c === 'v') y = first + (rel ? y : 0);
    else { x = first + (rel ? x : 0); y = second + (rel ? y : 0); }
    if (c === 'm') { line = []; lines.push(line); command = rel ? 'l' : 'L'; }
    if (!line) return null;
    line.push([x, y]);
  }
  return lines;
}

function svgLine(node) {
  const a = (name) => node.getAttribute(name);
  if (node.localName === 'path') return linearPath(a('d') || '');
  if (node.localName === 'line') return [[[+(a('x1') || 0), +(a('y1') || 0)], [+(a('x2') || 0), +(a('y2') || 0)]]];
  if (!['polygon', 'polyline'].includes(node.localName)) return null;
  const points = (a('points') || '').match(TOKEN) || [];
  if (points.length < 4 || points.length % 2 || points.some((p) => !Number.isFinite(+p))) return null;
  const line = [];
  for (let i = 0; i < points.length; i += 2) line.push([+points[i], +points[i+1]]);
  if (node.localName === 'polygon') line.push(line[0]);
  return [line];
}

function matrixOfSvg(node, root) {
  let matrix = IDENTITY;
  for (let el = node; el; el = el.parentElement) {
    if (['clip-path', 'mask', 'style', 'filter', 'display', 'visibility'].some((a) => el.hasAttribute(a))) return null;
    if (el !== root && el.localName === 'svg') return null;
    const transforms = el.transform?.baseVal;
    for (let i = (transforms?.numberOfItems || 0) - 1; i >= 0; i--) {
      const { a, b, c, d, e, f } = transforms.getItem(i).matrix;
      matrix = mul([a, b, c, d, e, f], matrix);
    }
    if (el === root) return matrix;
  }
  return null;
}

export function svgLinework(root, size, legend) {
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
  const viewport = [x, 0, 0, y, tx - x*(box?.x || 0), ty - y*(box?.y || 0)];
  const shapes = [];
  let skipped = 0;
  legend.forEach(({ elementIds }, classIndex) => {
    for (const id of elementIds || []) {
      const node = root.ownerDocument.getElementById(id);
      const matrix = node?.namespaceURI === root.namespaceURI ? matrixOfSvg(node, root) : null;
      const raw = matrix && svgLine(node);
      const lines = raw && raw.map((line) => line.map((p) => move(mul(viewport, matrix), p)));
      if (!lines?.length || lines.some((line) => line.length < 2 || line.some(([a, b]) =>
        !Number.isFinite(a+b) || a < 0 || b < 0 || a > width || b > height))) { skipped++; continue; }
      for (const coordinates of lines) shapes.push({ classIndex, type: 'LineString', coordinates });
    }
  });
  return { shapes, skipped };
}
