/* ============================================================================
 *  IntMap · admin.html's starter-dataset reader — A PARSER, NOT AN EVALUATOR
 * ----------------------------------------------------------------------------
 *  WHAT THIS REPLACES, AND WHY IT IS NOT THE SAME THING WITH BETTER MANNERS
 *
 *  The admin console's one-click "import the original dataset" button read the two hard-coded arrays
 *  out of the historical `intmap.html` like this:
 *
 *      const geoRaw = eval('(' + sliceBalanced(txt, …, '{', '}') + ')');
 *      const dash   = eval('(' + sliceBalanced(txt, …, '[', ']') + ')');
 *
 *  `txt` comes from a fetch of a same-origin file OR — the branch that actually runs, because
 *  `intmap.html` has not been in this repo for many rounds — from a FILE THE OPERATOR PICKS OFF DISK.
 *  `eval` does not read that text, it RUNS it: an object literal is only an object literal until one
 *  of its values is `[].constructor.constructor('…')()`, and then the admin console has executed a
 *  chosen file's code with the admin's live Supabase session in scope. The re-authentication prompt in
 *  front of the button proves who is at the keyboard; it says nothing about what is in the file.
 *
 *  So the text is PARSED instead. This reads exactly one JavaScript *data* literal — objects, arrays,
 *  strings, numbers, true/false/null/undefined, comments and trailing commas — and every construct
 *  outside that grammar (an identifier, a call, an operator, a template substitution, a getter) is a
 *  SyntaxError rather than a behaviour. Nothing here can invoke anything: the only operations the
 *  parser performs on the input are `charCodeAt`, `slice` and pushing values into arrays and objects.
 *
 *  ⚠ THE GRAMMAR IS DELIBERATELY WIDER THAN JSON, because the input is a JS source file and never was
 *  JSON: `{ name:{en:'…'} }` has bare identifier keys and single quotes, and `JSON.parse` would refuse
 *  the very files this button exists to read. Wider than JSON, narrower than JS, and it stops at
 *  "data".
 *
 *  Exposed as a global by a classic <script> (admin.html is a no-build page); importing this file in
 *  Node sets the same global, which is how tests/security-logic.mjs exercises it.
 * ==========================================================================*/
(function (root) {
  'use strict';

  /* Bounds. A hostile (or simply broken) file must fail fast rather than wedge the console. */
  var MAX_INPUT = 8 * 1024 * 1024;   /* the historical intmap.html datasets are ~200 kB together */
  var MAX_DEPTH = 32;                /* geoRaw is 3 deep; extendedDashDB is 3 deep */
  var MAX_NODES = 500000;            /* values produced, of any kind */

  function parse(text) {
    var src = String(text == null ? '' : text);
    if (src.length > MAX_INPUT) throw new SyntaxError('literal too large (' + src.length + ' bytes)');
    var i = 0, nodes = 0;

    function fail(msg) {
      var near = src.slice(Math.max(0, i - 24), i + 24).replace(/\s+/g, ' ');
      throw new SyntaxError(msg + ' at offset ' + i + ' near "' + near + '"');
    }
    function count() { if (++nodes > MAX_NODES) fail('literal has too many values'); }

    /* Whitespace and BOTH comment forms. A data file written by hand has comments in it. */
    function ws() {
      for (;;) {
        var c = src.charCodeAt(i);
        if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0b || c === 0x0c ||
            c === 0xa0 || c === 0xfeff) { i++; continue; }
        if (c === 0x2f /* slash */) {
          var d = src.charCodeAt(i + 1);
          if (d === 0x2f) { i += 2; while (i < src.length && src.charCodeAt(i) !== 0x0a && src.charCodeAt(i) !== 0x0d) i++; continue; }
          if (d === 0x2a /* star */) {
            var end = src.indexOf('*' + '/', i + 2);
            if (end < 0) fail('unterminated comment');
            i = end + 2; continue;
          }
        }
        return;
      }
    }

    function hex(n) {
      var v = 0;
      for (var k = 0; k < n; k++) {
        var c = src.charCodeAt(i);
        var d = (c >= 0x30 && c <= 0x39) ? c - 0x30
              : (c >= 0x61 && c <= 0x66) ? c - 0x61 + 10
              : (c >= 0x41 && c <= 0x46) ? c - 0x41 + 10 : -1;
        if (d < 0) fail('bad hex escape');
        v = v * 16 + d; i++;
      }
      return v;
    }

    /* ⚠ ESCAPES ARE THE ONE PLACE A PARSER CAN QUIETLY CHANGE THE DATA. The set below is exactly what
       a JS string literal means; anything unlisted (\d, \!) means the character itself, which is also
       what JS does. `\u{…}`, `\xNN` and a backslash-newline continuation are all real in the sources
       this reads, so all three are handled rather than approximated. */
    function readString(quote) {
      var out = '', start = i;
      i++;                                   /* the opening quote */
      for (;;) {
        if (i >= src.length) { i = start; fail('unterminated string'); }
        var c = src.charCodeAt(i);
        if (c === quote) { i++; return out; }
        if (quote === 0x60 && c === 0x24 && src.charCodeAt(i + 1) === 0x7b) {
          fail('template substitution is not data');
        }
        if (c !== 0x5c) {
          /* A raw newline is legal inside a template literal and illegal in '' / "". */
          if ((c === 0x0a || c === 0x0d) && quote !== 0x60) fail('unterminated string');
          out += src[i++]; continue;
        }
        i++;                                 /* the backslash */
        var e = src[i];
        if (e === undefined) fail('unterminated escape');
        switch (e) {
          case 'n': out += '\n'; i++; break;
          case 't': out += '\t'; i++; break;
          case 'r': out += '\r'; i++; break;
          case 'b': out += '\b'; i++; break;
          case 'f': out += '\f'; i++; break;
          case 'v': out += '\v'; i++; break;
          case '0':
            /* \0 is NUL only when no digit follows it (a legacy octal escape is not data). */
            if (/[0-9]/.test(src[i + 1] || '')) fail('octal escape is not allowed');
            out += '\0'; i++; break;
          case 'x': i++; out += String.fromCharCode(hex(2)); break;
          case 'u':
            i++;
            if (src[i] === '{') {
              i++;
              var v = 0, digits = 0;
              while (src[i] !== '}') {
                if (i >= src.length || digits > 6) fail('bad unicode escape');
                v = v * 16 + hex(1); digits++;
              }
              i++;                            /* the closing brace */
              if (v > 0x10ffff) fail('bad unicode escape');
              out += String.fromCodePoint(v);
            } else {
              out += String.fromCharCode(hex(4));
            }
            break;
          case '\r': i++; if (src[i] === '\n') i++; break;   /* line continuation */
          case '\n': i++; break;
          default:
            if (e >= '1' && e <= '9') fail('octal escape is not allowed');
            out += e; i++; break;
        }
      }
    }

    var NUM = /^[+-]?(?:0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/;
    function readNumber() {
      var m = NUM.exec(src.slice(i, i + 64));
      if (!m) fail('bad number');
      var raw = m[0];
      /* No `_` separators, no BigInt `n` suffix, and no identifier glued to the end (`1foo`). */
      var after = src[i + raw.length];
      if (after !== undefined && /[0-9a-zA-Z_$]/.test(after)) fail('bad number');
      i += raw.length;
      return Number(raw);
    }

    var IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*/;
    function readIdent() {
      var m = IDENT.exec(src.slice(i, i + 256));
      if (!m) fail('expected a property name');
      i += m[0].length;
      return m[0];
    }

    function readKey() {
      var c = src[i];
      if (c === '"' || c === "'" || c === '`') return readString(src.charCodeAt(i));
      if (/[0-9+.\-]/.test(c || '')) return String(readNumber());
      if (c === '[') fail('computed property names are not data');
      return readIdent();
    }

    function readValue(depth) {
      if (depth > MAX_DEPTH) fail('literal nested too deeply');
      ws();
      count();
      var c = src[i];
      if (c === undefined) fail('unexpected end of input');
      if (c === '{') {
        i++;
        var obj = {};
        ws();
        if (src[i] === '}') { i++; return obj; }
        for (;;) {
          ws();
          if (src[i] === '}') { i++; return obj; }          /* trailing comma */
          if (src.charCodeAt(i) === 0x2e && src.charCodeAt(i + 1) === 0x2e) fail('spread is not data');
          var key = readKey();
          ws();
          if (src[i] !== ':') fail('expected ":" after a property name');
          i++;
          var val = readValue(depth + 1);
          /* ⚠ `__proto__:` in an object literal REASSIGNS THE PROTOTYPE rather than adding a key — the
             one place where "just data" silently becomes a change to every object in the page. Refuse
             it; nothing in the datasets this reads has ever had such a key. */
          if (key === '__proto__') fail('"__proto__" is not an allowed key');
          obj[key] = val;
          ws();
          if (src[i] === ',') { i++; continue; }
          if (src[i] === '}') { i++; return obj; }
          fail('expected "," or "}"');
        }
      }
      if (c === '[') {
        i++;
        var arr = [];
        ws();
        if (src[i] === ']') { i++; return arr; }
        for (;;) {
          ws();
          if (src[i] === ']') { i++; return arr; }          /* trailing comma */
          if (src[i] === ',') fail('array holes are not data');
          /* ⚠ ONE dot starts a number (`.5`); THREE are a spread. The first draft rejected `[.5]`. */
          if (src.charCodeAt(i) === 0x2e && src.charCodeAt(i + 1) === 0x2e) fail('spread is not data');
          arr.push(readValue(depth + 1));
          ws();
          if (src[i] === ',') { i++; continue; }
          if (src[i] === ']') { i++; return arr; }
          fail('expected "," or "]"');
        }
      }
      if (c === '"' || c === "'" || c === '`') return readString(src.charCodeAt(i));
      if (/[0-9+.\-]/.test(c)) return readNumber();
      var word = IDENT.test(src.slice(i, i + 16)) ? readIdent() : null;
      if (word === 'true') return true;
      if (word === 'false') return false;
      if (word === 'null') return null;
      if (word === 'undefined') return undefined;
      if (word === 'NaN') return NaN;
      if (word === 'Infinity') return Infinity;
      if (word) { i -= word.length; fail('"' + word + '" is not data'); }
      fail('unexpected character');
    }

    var value = readValue(0);
    ws();
    if (i < src.length) fail('unexpected trailing characters');
    return value;
  }

  root.IntMapAdminLiteral = { parse: parse, MAX_DEPTH: MAX_DEPTH, MAX_INPUT: MAX_INPUT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
