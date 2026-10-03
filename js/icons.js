/* ============================================================================
 *  IntMap · THE ICON SET — one line-drawn glyph per name, and the only way an icon reaches the screen
 *  (icon-system)
 * ----------------------------------------------------------------------------
 *  WHAT IT REPLACED. The interface drew its icons with emoji: the Tools tiles (globe, ruler, pencil, ice
 *  cube, ring, camera), the toolbar, the menus, every Atlas confirmation line, the weather codes, the
 *  players (play, pause, skip), and the locale strings themselves (a globe in front of «Grid»). MEASURED
 *  on the production DOM before this change: a clock 10 times, a globe 6, a camera 5, a warning sign 4,
 *  a card index 3, a padlock 3, and some thirty others. An emoji is a picture the READER'S font draws —
 *  a different picture on Windows, macOS, Android and Linux, in colour, at its own baseline and weight,
 *  and none of it follows the text colour or the dark theme. A line drawing in currentColor is the same
 *  glyph everywhere and takes the colour, size and weight of the text beside it.
 *
 *  THE SHAPE. Every glyph is ONE path on a 24-unit grid, drawn with a 1.75 stroke, round caps and
 *  round joins, in currentColor (a dot is a zero-length segment `Mx yh.01`, which a round cap draws as a
 *  disc of the stroke's width). FILLED holds the one glyph that is a solid shape (the status dot). The
 *  drawings are our own — nothing is copied from a vendor's symbol set — and the ones the widget board
 *  also needs are the same drawings js/widget-core.js's PATHS carries, so the two read as one family.
 *  ⚠ THAT IS STILL A SECOND COPY of those paths: folding WC.icon onto this file is the next step
 *  (tests/shell-widgets-checks ⑯ reads the set's spelling in widget-core.js and moves with it).
 *
 *  THE WAYS IN, and which to use:
 *    icon(name, opts)      → a markup object (js/safe-html.js) for a template or a string that goes
 *                            to innerHTML. In an IntMapSafe.markup template it is inserted as markup;
 *                            concatenated with `+` it becomes its string, which is markup we wrote.
 *    iconNode(name, opts)  → an <svg> element, for code that builds with the DOM (`textContent` cannot
 *                            carry a picture; `el.replaceChildren(iconNode('pause'))` can).
 *    <span data-icon="name"></span> in static markup → filled by hydrateIcons(), which this module runs
 *                            over the document once the markup is parsed (index.html's toolbar and
 *                            Tools sheet, admin.html). The span keeps its own text siblings, so a
 *                            data-i18n label beside it is rewritten without touching the icon.
 *    withIcons(text)       → a translation that names a control by its picture carries `{icon:play}`
 *                            in every language; this draws it. The words stay in the locale, the
 *                            picture on the UI side.
 *    iconImageData(name)   → the same glyph as pixels, for a map symbol layer (GE().scene.addImage).
 *    opts: size (CSS length or px number; default 1.2em — the text's own size), label (the icon
 *          carries the meaning → role="img" + aria-label; otherwise it is aria-hidden, because the
 *          words beside it are what a screen reader should read), cls (extra class names).
 *
 *  ⚠ AN UNKNOWN NAME THROWS. Names are written by our code, not received; a misspelt one is a defect
 *  in the caller, and tests/icon-system-checks.test.mjs evaluates every name written at a call site
 *  against ICON_NAMES so the throw is met in a test, not on a reader's screen.
 *  ⚠ THE LOOK IS ONE RULE: `.im-icon` in css/intmap.css (alignment and shrink). The size and stroke
 *  are attributes on the element itself, so a page that does not load intmap.css (sources.html,
 *  privacy.html …) still draws the glyph at the right size.
 *  ⚠ An emoji written as an icon is refused by `npm run check:static` (rule `icon-glyphs`,
 *  scripts/icon-glyphs.mjs) — this file is where the picture goes instead.
 * ==========================================================================*/
import './safe-html.js';   /* the one encoder (icon() builds with IntMapSafe.markup) — an ES module that reads IntMapSafe imports it (tests/safe-output-single-module-checks ④) */

const WEIGHT = 1.75;
const DEFAULT_SIZE = '1.2em';

/* the outlined glyphs — one path each */
const PATHS = {
  warning: 'M12 3.75 21.5 20.25h-19ZM12 10v4.25M12 17.25h.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 11v5.5M12 7.75h.01',
  question: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  check: 'm5 12.5 4.6 4.5L19 7.5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M8 12.25l2.75 2.75L16.25 9.5',
  close: 'M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5',
  reset: 'M4.75 12a7.25 7.25 0 1 0 2.1-5.1M4.75 4.25v4.5h4.5',
  play: 'M7.5 4.75v14.5L19 12Z',
  pause: 'M8.5 5v14M15.5 5v14',
  stop: 'M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2',
  'skip-forward': 'M5 5.5v13l9-6.5ZM18.5 5.5v13',
  'skip-back': 'M19 5.5v13l-9-6.5ZM5.5 5.5v13',
  'fast-forward': 'M3.5 6v12l8-6ZM12.5 6v12l8-6Z',
  rewind: 'M20.5 6v12l-8-6ZM11.5 6v12l-8-6Z',
  chevronL: 'M14.5 5.5 8 12l6.5 6.5',
  chevronR: 'm9.5 5.5 6.5 6.5-6.5 6.5',
  pin: 'M12 21s6.5-6.1 6.5-10.4a6.5 6.5 0 1 0-13 0C5.5 14.9 12 21 12 21M12 8.4a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4',
  world: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3.2 12h17.6M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  waves: 'M3 7.5c1.5-1.33 3-1.33 4.5 0s3 1.33 4.5 0 3-1.33 4.5 0 3 1.33 4.5 0M3 12c1.5-1.33 3-1.33 4.5 0s3 1.33 4.5 0 3-1.33 4.5 0 3 1.33 4.5 0M3 16.5c1.5-1.33 3-1.33 4.5 0s3 1.33 4.5 0 3-1.33 4.5 0 3 1.33 4.5 0',
  mountain: 'M2.75 19.25 9.25 8l4.5 7.25 2.25-3 5.25 7Z',
  volcano: 'M2.75 20.25 8.5 10h7l5.75 10.25ZM9.5 10l1.25-1.5 1.25 1.5 1.25-1.5 1.25 1.5M10.5 6c0-1.4 1.6-1.4 1.6-2.75M13.5 6.5c0-1.4 1.6-1.4 1.6-2.75',
  lock: 'M7.5 10.5h9a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5h-9a2.5 2.5 0 0 1-2.5-2.5v-5a2.5 2.5 0 0 1 2.5-2.5M8.25 10.5V7.75a3.75 3.75 0 0 1 7.5 0v2.75',
  book: 'M4.5 5.2c2.6-.8 5-.8 7.5.9 2.5-1.7 4.9-1.7 7.5-.9v13c-2.6-.8-5-.8-7.5.9-2.5-1.7-4.9-1.7-7.5-.9zM12 6.1v13',
  walk: 'M13 2.75a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5M12.75 8 10.75 13l2.75 2.5L15 21M10.75 13 9 21M12.75 8 8.5 10v3.25M12.75 8l2 3.5 3 1',
  car: 'M4 16.5v-4l2-5.25A1.5 1.5 0 0 1 7.4 6.25h9.2a1.5 1.5 0 0 1 1.4 1L20 12.5v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1ZM4 12.5h16M6.5 17.5v2M17.5 17.5v2M7.75 14.75h.01M16.25 14.75h.01',
  bicycle: 'M6 12.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7M18 12.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7M6 16 9.5 9h5.5L18 16M12.25 16 9.5 9M6 16h6.25M14 6.5h2.5',
  train: 'M8.5 3.5h7a3 3 0 0 1 3 3v7.5a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3v-7.5a3 3 0 0 1 3-3M5.5 10.5h13M8.5 20.5l1.5-3.5M15.5 20.5 14 17M9 13.75h.01M15 13.75h.01',
  bus: 'M7 3.5h10a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5h-10a2.5 2.5 0 0 1-2.5-2.5v-9a2.5 2.5 0 0 1 2.5-2.5M4.5 11h15M7.5 17.5V20M16.5 17.5V20M8 14.25h.01M16 14.25h.01',
  ship: 'M3.5 14.5h17l-2.25 4.75H5.75ZM6 14.5V10h12v4.5M10 10V6.5h4V10M12 4v2.5',
  person: 'M12 4.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5M5 20.5c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5',
  'person-standing': 'M12 2.75a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5M12 8.5v6.5M12 15l-2 6M12 15l2 6M8 11l4-2.5 4 2.5',
  users: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M2.8 19.5a6.2 6.2 0 0 1 12.4 0M16 5a3.5 3.5 0 0 1 0 6.6M17 14.2a6.2 6.2 0 0 1 4.2 5.3',
  bolt: 'M13.5 2.75 5 13.25h6l-1 8 8.5-10.5h-6Z',
  network: 'M6 3.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5M18 5.25a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5M11 15.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5M8.2 6.4l7.6.8M7 8.1l3 7.8M16.7 9.5l-4.6 6.6',
  ruler: 'M3.6 14.9 9.1 20.4a1.4 1.4 0 0 0 2 0l9.3-9.3a1.4 1.4 0 0 0 0-2L14.9 3.6a1.4 1.4 0 0 0-2 0l-9.3 9.3a1.4 1.4 0 0 0 0 2M8 10.5l2 2M11 7.5l2 2M14 4.5l2 2M5 13.5l2 2',
  pencil: 'M15.5 4.5l4 4L8.75 19.25 3.75 20.25l1-5ZM13.5 6.5l4 4',
  target: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 11.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2',
  'set-square': 'M4.5 4.5v15h15ZM8.5 12.5v3h3Z',
  radius: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M12 12h8.5M12 12h.01',
  bug: 'M8 9.5a4 4 0 0 1 8 0V15a4 4 0 0 1-8 0ZM12 11v8M9.75 6.25 8.25 4.5M14.25 6.25l1.5-1.75M8 12H4.5M19.5 12H16M8 16l-3 1.5M16 16l3 1.5M8 9.25 5 7.75M16 9.25l3-1.5',
  star: 'M12 3.5l2.6 5.3 5.85.85-4.23 4.12 1 5.83L12 16.85 6.78 19.6l1-5.83L3.55 9.65l5.85-.85Z',
  keyboard: 'M5 6h14a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-14a2.5 2.5 0 0 1-2.5-2.5v-7a2.5 2.5 0 0 1 2.5-2.5M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14.5h8',
  map: 'M3.5 6.5 9 4.25l6 2.25 5.5-2.25v13.25L15 19.75l-6-2.25-5.5 2.25ZM9 4.25v13.25M15 6.5v13.25',
  cloud: 'M7.5 18.5h9.2a3.8 3.8 0 0 0 .3-7.6 5.6 5.6 0 0 0-10.8 1.2 3.2 3.2 0 0 0 1.3 6.4',
  'cloud-rain': 'M7 15a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 5.75 4.6 4.6 0 0 1 17.25 15ZM8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5',
  'cloud-snow': 'M7 15a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 5.75 4.6 4.6 0 0 1 17.25 15ZM8.5 18.5h.01M12 18.5h.01M15.5 18.5h.01M10.25 21h.01M13.75 21h.01',
  'cloud-bolt': 'M7 15a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 5.75 4.6 4.6 0 0 1 17.25 15ZM12.75 15.5 10.75 18.75h3l-2 3',
  'cloud-sun': 'M8.5 5.5a3 3 0 0 0-2.4 4.8M8.5 2v1.25M3 8h1.25M4.6 4.1l.9.9M12.4 4.1l-.9.9M9 20a3.5 3.5 0 0 1-.4-6.98A4.75 4.75 0 0 1 17.6 12a3.9 3.9 0 0 1 .15 8Z',
  sun: 'M12 8.2A3.8 3.8 0 1 0 12 15.8 3.8 3.8 0 0 0 12 8.2M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
  moon: 'M20 14.2A8.4 8.4 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2',
  fog: 'M5 7.5h14M3 11.5h18M5 15.5h14M8 19.5h8',
  snowflake: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.75 4.5 12 6.25l2.25-1.75M9.75 19.5 12 17.75l2.25 1.75',
  thermo: 'M12 4.5a2 2 0 0 1 2 2v7.1a4 4 0 1 1-4 0V6.5a2 2 0 0 1 2-2M12 9.5v6',
  drop: 'M12 3.25s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  wind: 'M4 9h9a2.6 2.6 0 1 0-2.6-2.6M4 14h13a2.6 2.6 0 1 1-2.6 2.6M4 11.5h6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3.5 2',
  calendar: 'M4.5 7.5h15v12h-15zM4.5 11h15M8.5 4v3M15.5 4v3',
  cube: 'M12 3 20 7.5v9L12 21l-8-4.5v-9ZM4 7.5 12 12l8-4.5M12 12v9',
  flag: 'M6 21V4.5M6 5.2h11.5l-2.2 4 2.2 4H6',
  antenna: 'M5.2 8.2a7.5 7.5 0 0 0 10.6 10.6ZM10.5 13.5l3-3M15 3.5a5.5 5.5 0 0 1 5.5 5.5M15 6.75A2.25 2.25 0 0 1 17.25 9M7.5 16.5 5 21h7',
  signal: 'M5 19.5v-3M9.67 19.5v-6.5M14.33 19.5V9.5M19 19.5V6',
  folder: 'M3.5 7a2 2 0 0 1 2-2h3.75l2 2.25h7.25a2 2 0 0 1 2 2V17.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z',
  camera: 'M4.5 7.5h3l1.75-2.5h5.5L16.5 7.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V9a1.5 1.5 0 0 1 1.5-1.5ZM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7',
  sparkle: 'm12 3.5 1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9zM18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  plane: 'M12 3a1.5 1.5 0 0 1 1.5 1.5V9.5l7 4v2l-7-2v4.25l2.25 1.75v1.75L12 20l-3.75 1.25V19.5l2.25-1.75V13.5l-7 2v-2l7-4V4.5A1.5 1.5 0 0 1 12 3Z',
  clipboard: 'M7.5 5h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2M9 3.5h6v3H9ZM9 11.5h6M9 15h4',
  drone: 'M9.5 10.5h5v3h-5ZM9.5 10.5 7 8M14.5 10.5 17 8M9.5 13.5 7 16M14.5 13.5 17 16M5.5 4.25a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5M18.5 4.25a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5M5.5 15.25a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5M18.5 15.25a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5',
  chat: 'M5.5 4.5h13a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2H11l-5 4v-4h-.5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  landmark: 'M3.5 9.5 12 4.5l8.5 5ZM5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5M3.5 20h17',
  city: 'M4.5 20.5V9l5-2.5v14M9.5 20.5V4l7 3v13.5M16.5 10.5h3v10M3 20.5h18',
  news: 'M4.5 5.5h12v13h-12zM16.5 9.5h3v7a2 2 0 0 1-4 0M7 9h6M7 12.5h6M7 16h4',
  satellite: 'm7.5 10.5-3 3 3 3 3-3zM13.5 4.5l-3 3 3 3 3-3zM10.5 10.5l3 3M15 15.5a4.5 4.5 0 0 0-4.5-4.5M18.5 16a8 8 0 0 0-8-8',
  sunset: 'M3 18.5h18M7 18.5a5 5 0 0 1 10 0M12 7.5v2M5.6 11.6l1.3 1.3M18.4 11.6l-1.3 1.3M3.5 15H5M19 15h1.5M8 21.5h8',
  gamepad: 'M7 7.5h10a4.5 4.5 0 0 1 4.4 5.4l-.9 4.2a2.2 2.2 0 0 1-3.8 1L14.5 15.5h-5L7.3 18.1a2.2 2.2 0 0 1-3.8-1l-.9-4.2A4.5 4.5 0 0 1 7 7.5ZM8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M15.75 8.25 13.5 13.5l-5.25 2.25L10.5 10.5Z',
  radiation: 'M10.75 9.83 8.25 5.5A7.5 7.5 0 0 1 15.75 5.5L13.25 9.83A2.5 2.5 0 0 0 10.75 9.83ZM14.5 12h5A7.5 7.5 0 0 1 15.75 18.5L13.25 14.17A2.5 2.5 0 0 0 14.5 12ZM10.75 14.17 8.25 18.5A7.5 7.5 0 0 1 4.5 12h5A2.5 2.5 0 0 0 10.75 14.17ZM12 12h.01',
  planet: 'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11M17.4 7.6c2.5-1.3 4.2-1.6 4.6-.9.8 1.4-3.3 5.1-9.1 8.4S2.8 19.9 2 18.5c-.4-.7.8-2.1 3-3.7',
  rocket: 'M12 3.2c3 2 4.6 5.2 4.6 8.6L14 15.2h-4L7.4 11.8c0-3.4 1.6-6.6 4.6-8.6M10 15.2 8 20l3-1.6M14 15.2 16 20l-3-1.6M12 8.6v.1',
  chart: 'M4 4v16h16M7.5 15l3.5-4 3 2.5 5-6',
  graduation: 'M2.5 9.5 12 5l9.5 4.5L12 14ZM6.5 11.5v4c1.5 1.5 3.5 2.25 5.5 2.25s4-.75 5.5-2.25v-4M21.5 9.5v5',
  palette: 'M12 3a9 9 0 0 0 0 18c1.1 0 1.75-.75 1.75-1.6 0-1.15-1.25-1.6-1.25-2.65 0-.95.75-1.5 1.75-1.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3ZM7.5 11h.01M10 7h.01M14.5 7h.01M17 10.75h.01',
  heart: 'M12 20s-7.5-4.6-7.5-10.25A4.25 4.25 0 0 1 12 7a4.25 4.25 0 0 1 7.5 2.75C19.5 15.4 12 20 12 20Z',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M10.4 3.7h3.2l.4 2.2 1.9 1.1 2.1-.8 1.6 2.8-1.7 1.4v2.2l1.7 1.4-1.6 2.8-2.1-.8-1.9 1.1-.4 2.2h-3.2l-.4-2.2-1.9-1.1-2.1.8-1.6-2.8L6.2 13v-2.2L4.5 9.4l1.6-2.8 2.1.8 1.9-1.1z',
  save: 'M5.5 3.75h10.25l4.5 4.5v10.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.75V5.25a1.5 1.5 0 0 1 1.5-1.5ZM8 3.75v4.5h7v-4.5M7.5 20.25V14h9v6.25',
  speaker: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4ZM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  'speaker-off': 'M4 9.5h3.5L12 5.5v13l-4.5-4H4ZM16 9.5l5 5M21 9.5l-5 5',
  phone: 'M9.5 3h5a2.5 2.5 0 0 1 2.5 2.5v13a2.5 2.5 0 0 1-2.5 2.5h-5a2.5 2.5 0 0 1-2.5-2.5v-13a2.5 2.5 0 0 1 2.5-2.5M11 18h2',
  eye: 'M2.8 12S6.6 5.8 12 5.8 21.2 12 21.2 12 17.4 18.2 12 18.2 2.8 12 2.8 12M12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2',
  'eye-off': 'M2.8 12S6.6 5.8 12 5.8 21.2 12 21.2 12 17.4 18.2 12 18.2 2.8 12 2.8 12M12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2M4 4l16 16',
  trash: 'M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l.9 12.6a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.6M10 10.5v6M14 10.5v6',
  image: 'M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5h-12a2.5 2.5 0 0 1-2.5-2.5v-10a2.5 2.5 0 0 1 2.5-2.5M9 7.75a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5M3.5 17l5-4.5 4 3.5 3-2.5 5 4',
  square: 'M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2',
  polygon: 'M12 3.5l8.5 6.2-3.25 10h-10.5L3.5 9.7Z',
  grid: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
  sliders: 'M5 4v16M12 4v16M19 4v16M3 14h4M10 8h4M17 16h4',
  calculator: 'M7.5 3h9a2.5 2.5 0 0 1 2.5 2.5v13a2.5 2.5 0 0 1-2.5 2.5h-9a2.5 2.5 0 0 1-2.5-2.5v-13a2.5 2.5 0 0 1 2.5-2.5M8 7h8v3H8ZM8.5 14h.01M12 14h.01M15.5 14h.01M8.5 17.5h.01M12 17.5h.01M15.5 17.5h.01',
  burst: 'M12 2.5l1.9 5.1 5.1-2-2 5.1 5.1 1.9-5.1 1.9 2 5.1-5.1-2L12 21.5l-1.9-5.1-5.1 2 2-5.1L1.9 12 7 10.1l-2-5.1 5.1 2Z',
  gauge: 'M4.5 17a8.5 8.5 0 1 1 15 0M12 13.5l4-4M12 13.5h.01',
  telescope: 'M3.5 13.5l13-6.5 2 4-13 6.5ZM10 14l-2.5 7M12 13l2.5 8',
  search: 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M15.8 15.8 20 20',
  columns: 'M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5h-12a2.5 2.5 0 0 1-2.5-2.5v-10a2.5 2.5 0 0 1 2.5-2.5M12 4.5v15',
  coin: 'M12 3.5c4.7 0 8.5 1.6 8.5 3.6S16.7 10.7 12 10.7 3.5 9.1 3.5 7.1 7.3 3.5 12 3.5M3.5 7.1v9.8c0 2 3.8 3.6 8.5 3.6s8.5-1.6 8.5-3.6V7.1M3.5 12c0 2 3.8 3.6 8.5 3.6s8.5-1.6 8.5-3.6',
  hand: 'M8 12.5V5.75a1.25 1.25 0 0 1 2.5 0V11M10.5 11V4.25a1.25 1.25 0 0 1 2.5 0V11M13 11V5.25a1.25 1.25 0 0 1 2.5 0V12M15.5 12V8.25a1.25 1.25 0 0 1 2.5 0v6.25a6.5 6.5 0 0 1-6.5 6.5h-.6a6 6 0 0 1-4.8-2.4L3.6 15.4a1.3 1.3 0 0 1 2-1.6L8 16',
  tree: 'M12 3 6 12h3.5L6 17h12l-3.5-5H18ZM12 17v4',
  shield: 'M12 3.25 19 6v5.5c0 4.5-3 7.75-7 9.25-4-1.5-7-4.75-7-9.25V6Z',
  note: 'M7.5 3.5h9a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1-2.5 2.5h-9a2.5 2.5 0 0 1-2.5-2.5v-12a2.5 2.5 0 0 1 2.5-2.5M8.5 8h7M8.5 12h7M8.5 16h4',
  share: 'M12 14.5V3.75M8.25 7.25 12 3.5l3.75 3.75M7.5 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1.5',
  swords: 'M5 4.5l10.5 10.5M19 4.5 8.5 15M5 4.5H4.5V4M19 4.5h.5V4M13 17.5l4.5-4.5M6.5 13l4.5 4.5M16 16l3.5 3.5M8 16l-3.5 3.5',
  anchor: 'M12 3.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4M12 7.5V21M4.5 13a7.5 7.5 0 0 0 15 0M8.5 11h7M3 14.5 4.5 13 6 14.5M18 14.5l1.5-1.5 1.5 1.5',
  pickaxe: 'M4 10c4.5-5 10.5-6.5 16-4.5M11.5 6.25 20 18.5',
  wall: 'M3.5 6h17v12h-17ZM3.5 10h17M3.5 14h17M9 6v4M15 6v4M6.5 10v4M12 10v4M17.5 10v4M9 14v4M15 14v4',
  layers: 'm12 3.5 8.5 4.4-8.5 4.4-8.5-4.4zM3.5 12.3 12 16.7l8.5-4.4M3.5 16.4 12 20.8l8.5-4.4',
  /* (sales-next) the classroom worksheet's Print — a printer with its sheet */
  printer: 'M7 8.5V3.5h10v5M7 17H5.5A2 2 0 0 1 3.5 15v-4.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2H17M7 13.5h10v7H7ZM17 11.25h.01',
};
/* the solid glyphs — drawn with fill, not stroke */
const FILLED = {
  dot: 'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z',
};

/** Every name icon() / iconNode() / data-icon accepts. */
export const ICON_NAMES = Object.freeze(Object.keys(PATHS).concat(Object.keys(FILLED)));

function shape(name) {
  const filled = Object.prototype.hasOwnProperty.call(FILLED, name);
  const d = filled ? FILLED[name] : (Object.prototype.hasOwnProperty.call(PATHS, name) ? PATHS[name] : null);
  if (d == null) throw new TypeError('IntMapIcons: there is no icon named «' + name + '»');
  return { d, filled };
}
const sizeOf = (o) => (o && o.size != null && o.size !== '') ? String(o.size) : DEFAULT_SIZE;
const classOf = (o) => 'im-icon' + (o && o.cls ? ' ' + String(o.cls) : '');

/** The icon as markup (a js/safe-html.js markup object). */
export function icon(name, opts) {
  const o = opts || {};
  const s = shape(name), w = sizeOf(o), c = classOf(o);
  const fill = s.filled ? 'currentColor' : 'none', stroke = s.filled ? 'none' : 'currentColor';
  const markup = globalThis.IntMapSafe.markup;
  return o.label
    ? markup`<svg class="${c}" viewBox="0 0 24 24" width="${w}" height="${w}" fill="${fill}" stroke="${stroke}" stroke-width="${WEIGHT}" stroke-linecap="round" stroke-linejoin="round" focusable="false" role="img" aria-label="${o.label}"><path d="${s.d}"/></svg>`
    : markup`<svg class="${c}" viewBox="0 0 24 24" width="${w}" height="${w}" fill="${fill}" stroke="${stroke}" stroke-width="${WEIGHT}" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true"><path d="${s.d}"/></svg>`;
}

/** The icon as an <svg> element of `doc` (default: the current document). */
export function iconNode(name, opts) {
  const o = opts || {};
  const s = shape(name), w = sizeOf(o);
  const doc = o.doc || globalThis.document;
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const set = (k, v) => svg.setAttribute(k, v);
  set('class', classOf(o)); set('viewBox', '0 0 24 24'); set('width', w); set('height', w);
  set('fill', s.filled ? 'currentColor' : 'none'); set('stroke', s.filled ? 'none' : 'currentColor');
  set('stroke-width', String(WEIGHT)); set('stroke-linecap', 'round'); set('stroke-linejoin', 'round');
  set('focusable', 'false');
  if (o.label) { set('role', 'img'); set('aria-label', String(o.label)); } else set('aria-hidden', 'true');
  const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', s.d);
  svg.appendChild(p);
  return svg;
}

/** The icon as pixels, for a map style (`GE().scene.addImage(id, iconImageData(name), { pixelRatio })`):
 *  a map symbol layer draws images, not markup. `size` is the bitmap's side in pixels (default 48);
 *  `color` the stroke (default white) and `halo` a wider stroke drawn under it so the glyph reads on any
 *  ground (default a translucent black; '' for none). Same path, same grid, same weight as icon(). */
export function iconImageData(name, size, opts) {
  const o = opts || {};
  const s = shape(name), S = Math.max(8, Math.round(size || 48));
  const doc = o.doc || globalThis.document;
  const cv = doc.createElement('canvas'); cv.width = S; cv.height = S;
  const c = cv.getContext('2d');
  c.scale(S / 24, S / 24);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const P2 = globalThis.Path2D;   /* a canvas global, read off globalThis so the module also evaluates where there is none (Node) */
  const p = new P2(s.d);
  const halo = o.halo == null ? 'rgba(0,0,0,0.55)' : o.halo;
  if (halo) { c.strokeStyle = halo; c.fillStyle = halo; c.lineWidth = WEIGHT + 2.5; c.stroke(p); if (s.filled) c.fill(p); }
  c.strokeStyle = c.fillStyle = o.color || '#ffffff'; c.lineWidth = WEIGHT;
  if (s.filled) c.fill(p); else c.stroke(p);
  const d = c.getImageData(0, 0, S, S);   /* raw bitmap pixels — the scale above does not apply to the read */
  return { width: S, height: S, data: new Uint8Array(d.data.buffer) };
}

/** A sentence that names a control by its glyph («press {icon:play} to run it»), with each `{icon:name}`
 *  drawn. The token is how a translation refers to a picture without containing one: every language
 *  carries the same token, and the picture is drawn here, on the UI side. `text` is authored markup (a
 *  translation the caller would have written into innerHTML anyway); a token naming no icon is left as
 *  written so the defect is visible rather than silently dropped. Returns a string. */
export function withIcons(text) {
  return String(text == null ? '' : text).replace(/\{icon:([a-zA-Z-]+)\}/g, (m, name) => (ICON_NAMES.indexOf(name) >= 0 ? String(icon(name)) : m));
}

/** Fill every empty `[data-icon]` under `root` with its glyph (static markup). Returns how many it drew. */
export function hydrateIcons(root) {
  const r = root || globalThis.document;
  if (!r || typeof r.querySelectorAll !== 'function') return 0;
  let n = 0;
  r.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.firstElementChild) return;                       /* already drawn (or a clone of a drawn one) */
    el.replaceChildren(iconNode(el.getAttribute('data-icon'), { size: el.getAttribute('data-icon-size'), doc: el.ownerDocument }));
    n++;
  });
  return n;
}

const API = { icon, iconNode, iconImageData, withIcons, hydrateIcons, names: ICON_NAMES };
globalThis.IntMapIcons = API;

/* static markup is drawn as soon as it exists: a module is evaluated after the document is parsed, so
   this normally draws at once; a page that imports this from a script in <head> draws at DOMContentLoaded */
if (typeof document !== 'undefined' && document.querySelectorAll) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrateIcons(document), { once: true });
  else hydrateIcons(document);
}

export default API;
