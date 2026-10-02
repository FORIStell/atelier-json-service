// General word-problem solver (Lithuanian and English).
// 1. read the numbers with their units (120 €, 15 %, 360 km, 4 valandas, 5 km/h, 12 cm, 250 g ...)
// 2. recognise concepts by word stems in both languages (price/kaina, decrease/sumažinta, radius/spindulys ...)
// 3. solve by family from what is given and what is asked.
// solveWords(text) -> { title, steps, answers: [[label, value]] } or null
import { Q, formatNumber } from './rational.js';

const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fmt = (x) => formatNumber(Math.abs(x - Math.round(x)) < 1e-9 ? Math.round(x) : x);
const r6 = (x) => Math.round(x * 1e6) / 1e6;
// probabilities as fractions: 0.151515 -> 5/33
const prob = (x) => { for (let d = 1; d <= 1000; d++) { const n = Math.round(x * d); if (Math.abs(n / d - x) < 1e-10) return d === 1 ? n : new Q(BigInt(n), BigInt(d)); } return r6(x); };

// Lithuanian / English number words
const NUMW = [
  [/\b(vienas|viena|vieno|vienos|viena|one|single)\b/, 1], [/\b(du|dvi|dviej\w*|dvieju|two|twice|both)\b/, 2], [/\b(trys|tris|triju|trij\w*|three)\b/, 3],
  [/\b(keturi|keturias|keturiu|four)\b/, 4], [/\b(penki|penkias|penkiu|five)\b/, 5], [/\b(sesi|sesias|sesiu|six)\b/, 6], [/\b(septyni|septyniu|seven)\b/, 7],
  [/\b(astuoni|astuoniu|eight)\b/, 8], [/\b(devyni|devyniu|nine)\b/, 9], [/\b(desimt|ten)\b/, 10],
];
const ORD = { pirm: 1, antr: 2, trec: 3, ketvirt: 4, penkt: 5, sest: 6, septint: 7, astunt: 8, devint: 9, desimt: 10, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };

const UNITS = [
  ['speed', /^(km\/h|km\/val|m\/s|km per hour|kmh|mph)/],
  ['money', /^(€|eur\w*|euro\w*|\$|dollars?|lt\b)/],
  ['percent', /^(%|proc\w*|percent)/],
  ['dist', /^(km|kilomet\w*)\b/], ['len', /^(mm|cm|dm|m|metr\w*|centimetr\w*)\b/],
  ['area', /^(cm²|m²|cm\^2|m\^2)/],
  ['time', /^(val\w*|h|hours?|min\w*|sek\w*|s|seconds?|dien\w*|days?|savait\w*|weeks?|met\w*|years?|men\w*|months?)\b/],
  ['mass', /^(kg|g|gram\w*|kilogram\w*|t)\b/], ['vol', /^(l|ml|litr\w*|liters?|litres?)\b/],
];
// numbers with the unit right after them: [{ v, unit, word, at }]
function quantities(raw) {
  const s = raw.replace(/(\d)\s(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d)/g, '$1.$2');
  const out = [];
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?/g)) {
    // skip parts of a ratio "3 : 4" handled elsewhere, and digits glued to letters (a₁)
    const v = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
    const rest = fold(s.slice(m.index + m[0].length).trimStart());
    let unit = null;
    for (const [u, re] of UNITS) if (re.test(rest)) { unit = u; break; }
    const word = (rest.match(/^[a-z]+/) || [''])[0];
    out.push({ v, unit, word, at: m.index });
  }
  return out;
}
const words = (f) => f.replace(/[^a-z0-9%€ ]/g, ' ').split(/\s+/).filter(Boolean);
const has = (f, re) => re.test(f);
const firstOf = (qs, unit) => qs.find((q) => q.unit === unit);
const allOf = (qs, unit) => qs.filter((q) => q.unit === unit);
const out = (title, steps, answers) => ({ title, steps, answers });
// the number written right after (or before) a keyword: "ilgis 12 cm", "spindulys yra 5", "12 cm ilgio"
function after(f, stem) {
  const re = new RegExp(`${stem}\\S*\\s+(?:yra\\s+|lygus\\s+|lygi\\s+|is\\s+|of\\s+|=\\s*)?(\\d+(?:\\.\\d+)?)`);
  const m = f.match(re);
  if (m) return Number(m[1]);
  const re2 = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:mm|cm|dm|m|km)?\\s+${stem}`);
  const m2 = f.match(re2);
  return m2 ? Number(m2[1]) : null;
}

export function solveWords(raw) {
  const s = raw.replace(/\s+/g, ' ').trim();
  const f = fold(s).replace(/(\d),(\d)/g, '$1.$2');
  const qs = quantities(s);
  const nums = qs.map((q) => q.v);
  for (const [re, v] of NUMW) if (re.test(f) && !nums.includes(v)) { /* number words are used by specific families below */ }
  const wordNum = (re0) => { for (const [re, v] of NUMW) { const m = f.match(new RegExp(`${re.source.slice(2, -2)}\\s+${re0}`)); if (m) return v; } return null; };
  const qpart = f.slice(Math.max(0, ...['raskite', 'apskaiciuokite', 'nustatykite', 'kiek', 'find', 'what', 'how many'].map((w) => f.lastIndexOf(w))));
  const ordinal = () => { const f = qpart; const m = f.match(/(\d+)\s*-?\s*(?:a|aj|oj|uj|ai|osios|ojo|asis|th|st|nd|rd)\w*\s+(?:nar|eil|term|row|day|dien)/) || f.match(/(\d+)\s*-\s*\w+/); if (m) return Number(m[1]); for (const [k, v] of Object.entries(ORD)) if (new RegExp(`\\b${k}\\w*\\s+(?:nar|eil|term|row|day|dien)`).test(f)) return v; return null; };
  const asks = (re) => re.test(f);
  let m;

  // ===================== geometry: shape + dimensions + what is asked =====================
  const shape = has(f, /staciakamp\w* gretasien|rectangular box|cuboid/) ? 'box' : has(f, /\bkub\w*|\bcube/) ? 'cube' : has(f, /ritin\w*|cylinder/) ? 'cyl' : has(f, /kug\w*|\bcone/) ? 'cone'
    : has(f, /rutul\w*|sphere|\bball/) ? 'sphere' : has(f, /apskritim\w*|skritul\w*|circle/) ? 'circle' : has(f, /staciakamp\w*|rectangle/) ? 'rect' : has(f, /kvadrat\w*|square\b/) ? 'square'
      : has(f, /staci\w* trikamp\w*|right triangle|right-angled/) ? 'rtri' : null;
  if (shape && !has(f, /tikimyb|probab|kartus|vidurk/)) {
    const L = after(f, '(?:ilg|length|long)'), W = after(f, '(?:plot(?!as|a\\b|ą)|width|wide)'), R = after(f, '(?:spindul|radius)'), D = after(f, '(?:skersmen|diameter)');
    const H = after(f, '(?:aukst|height|high)'), A = after(f, '(?:briaun|krastin|side|edge)');
    const legs = (f.match(/statin\w*\s+(?:yra\s+)?(\d+(?:\.\d+)?)\D+?(?:ir|and)\s+(\d+(?:\.\d+)?)/) || f.match(/legs?\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)/));
    const hyp = after(f, '(?:izambin|hypotenuse)'), leg1 = after(f, '(?:vienas statinis|statinis|one leg|a leg)');
    const r = R ?? (D ? D / 2 : null);
    const ans = [], steps = [];
    const want = { area: asks(/plot(a|ą|o)\b|plota|\barea/), per: asks(/perimetr|perimeter/), diag: asks(/istrizain|diagonal/), vol: asks(/tur(i|į)\b|turi\b|volume/), surf: asks(/pavirsiaus plot|surface/), circ: asks(/\bilg(i|į)\b|ilgi\b|circumference/), hyp: asks(/izambin|hypotenuse/), leg: asks(/kit\w* statin|other leg/) };
    const push = (label, v, title, math) => { ans.push([label, r6(v)]); steps.push({ title, math }); };
    if (shape === 'rect' && L && W) {
      if (want.area || !(want.per || want.diag)) push('S', L * W, 'Area $S = a \\cdot b$', `${L} \\cdot ${W} = ${fmt(L * W)}`);
      if (want.per) push('P', 2 * (L + W), 'Perimeter $P = 2(a + b)$', `2(${L} + ${W}) = ${fmt(2 * (L + W))}`);
      if (want.diag) push('d', Math.hypot(L, W), 'Diagonal $d = \\sqrt{a^2 + b^2}$', `\\sqrt{${L}^2 + ${W}^2} = ${fmt(Math.hypot(L, W))}`);
      return out('Rectangle', steps, ans);
    }
    if (shape === 'rect' && want.per === false && (m = f.match(/perimetr\w*\s+(?:yra\s+)?(\d+(?:\.\d+)?)/))) { /* handled below for unknown side */ }
    if ((shape === 'rect') && (m = f.match(/(?:perimetr\w*|perimeter)\s+(?:yra\s+|is\s+|of\s+)?(\d+(?:\.\d+)?)/)) && (L || W)) {
      const P = Number(m[1]), known = L ?? W, other = P / 2 - known;
      return out('Rectangle', [{ title: '$P = 2(a + b)$, so the other side is $\\frac{P}{2} - a$', math: `\\frac{${P}}{2} - ${known} = ${fmt(other)}` }], [[L ? 'width' : 'length', r6(other)]]);
    }
    if (shape === 'square' && A) {
      if (want.area || !want.per) push('S', A * A, 'Area $S = a^2$', `${A}^2 = ${fmt(A * A)}`);
      if (want.per) push('P', 4 * A, 'Perimeter $P = 4a$', `4 \\cdot ${A} = ${fmt(4 * A)}`);
      if (want.diag) push('d', A * Math.SQRT2, 'Diagonal $d = a\\sqrt{2}$', `${A}\\sqrt{2}`);
      return out('Square', steps, ans);
    }
    if (shape === 'circle' && r) {
      if (want.circ || asks(/ilg/)) push('C', 2 * Math.PI * r, 'Circumference $C = 2\\pi r$', `2\\pi \\cdot ${r} = ${fmt(2 * r)}\\pi`);
      if (want.area || !want.circ) push('S', Math.PI * r * r, 'Area $S = \\pi r^2$', `\\pi \\cdot ${r}^2 = ${fmt(r * r)}\\pi`);
      return out('Circle', steps, ans);
    }
    if (shape === 'cube' && A) {
      if (want.vol || !want.surf) push('V', A ** 3, 'Volume $V = a^3$', `${A}^3 = ${fmt(A ** 3)}`);
      if (want.surf || asks(/pavirsi/)) push('S', 6 * A * A, 'Surface $S = 6a^2$', `6 \\cdot ${A}^2 = ${fmt(6 * A * A)}`);
      if (want.diag) push('d', A * Math.sqrt(3), 'Space diagonal $d = a\\sqrt{3}$', `${A}\\sqrt{3}`);
      return out('Cube', steps, ans);
    }
    if (shape === 'cyl' && r && H) {
      if (want.vol || !want.surf) push('V', Math.PI * r * r * H, 'Volume $V = \\pi r^2 h$', `\\pi \\cdot ${r}^2 \\cdot ${H} = ${fmt(r * r * H)}\\pi`);
      if (want.surf) push('S', 2 * Math.PI * r * (r + H), 'Surface $S = 2\\pi r(r + h)$', `${fmt(2 * r * (r + H))}\\pi`);
      return out('Cylinder', steps, ans);
    }
    if (shape === 'cone' && r && H) {
      const l = Math.hypot(r, H);
      if (want.vol || !want.surf) push('V', (Math.PI * r * r * H) / 3, 'Volume $V = \\frac{1}{3}\\pi r^2 h$', `\\frac{1}{3}\\pi \\cdot ${r}^2 \\cdot ${H} = ${fmt((r * r * H) / 3)}\\pi`);
      if (want.surf) push('S', Math.PI * r * (r + l), 'Surface $S = \\pi r(r + l)$, $l = \\sqrt{r^2 + h^2}$', `l = ${fmt(l)},\\ S = ${fmt(r * (r + l))}\\pi`);
      return out('Cone', steps, ans);
    }
    if (shape === 'sphere' && r) {
      if (want.vol || !want.surf) push('V', (4 / 3) * Math.PI * r ** 3, 'Volume $V = \\frac{4}{3}\\pi r^3$', `\\frac{4}{3}\\pi \\cdot ${r}^3 = ${fmt((4 / 3) * r ** 3)}\\pi`);
      if (want.surf) push('S', 4 * Math.PI * r * r, 'Surface $S = 4\\pi r^2$', `${fmt(4 * r * r)}\\pi`);
      return out('Sphere', steps, ans);
    }
    if (shape === 'box' && L && W && H) {
      if (want.vol || !want.surf) push('V', L * W * H, 'Volume $V = abc$', `${L} \\cdot ${W} \\cdot ${H} = ${fmt(L * W * H)}`);
      if (want.surf) push('S', 2 * (L * W + L * H + W * H), 'Surface $S = 2(ab + ac + bc)$', fmt(2 * (L * W + L * H + W * H)));
      if (want.diag) push('d', Math.sqrt(L * L + W * W + H * H), 'Diagonal $d = \\sqrt{a^2 + b^2 + c^2}$', fmt(Math.sqrt(L * L + W * W + H * H)));
      return out('Box', steps, ans);
    }
    if (shape === 'rtri') {
      if (hyp && leg1 && (want.leg || !legs)) { const b = Math.sqrt(hyp * hyp - leg1 * leg1); return out('Right triangle', [{ title: 'Pythagoras: $b = \\sqrt{c^2 - a^2}$', math: `\\sqrt{${hyp}^2 - ${leg1}^2} = ${fmt(b)}` }], [['b', r6(b)]]); }
      if (legs) {
        const a = Number(legs[1]), b = Number(legs[2]), c = Math.hypot(a, b);
        push('c', c, 'Hypotenuse $c = \\sqrt{a^2 + b^2}$', `\\sqrt{${a}^2 + ${b}^2} = ${fmt(c)}`);
        if (want.area) push('S', (a * b) / 2, 'Area $S = \\frac{ab}{2}$', fmt((a * b) / 2));
        return out('Right triangle', steps, ans);
      }
    }
  }

  // ===================== percentages =====================
  const pct = allOf(qs, 'percent'), money = allOf(qs, 'money');
  if (pct.length || has(f, /procent|percent/)) {
    // X % nuo Y / X % of Y
    if ((m = f.match(/(\d+(?:\.\d+)?)\s*(?:%|proc\w*|percent)\s*(?:nuo|of)\s+(\d+(?:\.\d+)?)/))) {
      const p = Number(m[1]), base = Number(m[2]), v = (p * base) / 100;
      return out('Percentage of a number', [{ title: 'Multiply by the percentage as a fraction', math: `${base} \\cdot \\frac{${p}}{100} = ${fmt(v)}` }], [['value', r6(v)]]);
    }
    // solute in a solution: "250 g 12 % tirpalo"
    if (has(f, /tirpal|solution|lydin|alloy|misin|mixture/) && !has(f, /ipil|ipyl|pril|pripyl|pridet|add/) && pct.length === 1 && (firstOf(qs, 'mass') || firstOf(qs, 'vol'))) {
      const tot = (firstOf(qs, 'mass') || firstOf(qs, 'vol')).v, p = pct[0].v, v = (tot * p) / 100;
      return out('Concentration', [{ title: 'Part = whole · percentage', math: `${tot} \\cdot ${p / 100} = ${fmt(v)}` }], [['amount', r6(v)]]);
    }
    // add water to a solution, ask for the new concentration
    if (has(f, /tirpal|solution/) && has(f, /ipyl|ipil|pripyl|added|add/) && has(f, /koncentracij|procent|percent|concentration/) && pct.length === 1) {
      const vols = qs.filter((q) => q.unit === 'vol' || q.unit === 'mass');
      if (vols.length >= 2) { const [V, w] = vols.map((q) => q.v), c = (V * pct[0].v) / (V + w); return out('Concentration', [{ title: 'The dissolved amount stays the same, the total grows', math: `\\frac{${V} \\cdot ${pct[0].v / 100}}{${V} + ${w}} = ${fmt(c / 100)} = ${fmt(c)}\\%` }], [['%', r6(c)]]); }
    }
    // from A to B: by how many percent
    if (pct.length === 0 && !has(f, /vienod\w* (?:nuolaid|pabrang|kart)|equal (?:discounts|reductions|increases)/) && (m = f.match(/(?:nuo|from)\s+(\d+(?:\.\d+)?)\D{0,12}?(?:iki|to)\s+(\d+(?:\.\d+)?)/))) {
      const a = Number(m[1]), b = Number(m[2]), p = ((b - a) / a) * 100;
      return out('Percent change', [{ title: 'Change ÷ original × 100', math: `\\frac{${b} - ${a}}{${a}} \\cdot 100 = ${fmt(p)}\\%` }], [['%', r6(Math.abs(p))]]);
    }
    // a price and a new price ("kainavo 900 €. Po nuolaidos kainuoja 765 €")
    if (pct.length === 0 && money.length >= 2 && has(f, /nuolaid|discount|atpig|pabrang|procent|percent/)) {
      const [a, b] = money.map((q) => q.v);
      const kEq = has(f, /vienod\w* (?:nuolaid|pabrang|kart)|equal (?:discounts|reductions|increases)/) ? (has(f, /trij|three/) ? 3 : 2) : 1;
      if (kEq > 1) { const p = (1 - (b / a) ** (1 / kEq)) * 100; return out('Equal percent changes', [{ title: `${kEq} equal changes: $${a}(1 - p)^{${kEq}} = ${b}$`, math: `1 - p = \\sqrt[${kEq}]{${b}/${a}} \\Rightarrow p = ${fmt(p)}\\%` }], [['%', r6(Math.abs(p))]]); }
      const p = ((a - b) / a) * 100;
      return out('Percent change', [{ title: 'Change ÷ original × 100', math: `\\frac{${a} - ${b}}{${a}} \\cdot 100 = ${fmt(Math.abs(p))}\\%` }], [['%', r6(Math.abs(p))]]);
    }
    // successive changes: "pabrango 10 %, o vėliau dar 10 %"
    const up = /padidin|padidej|pabrang|daugiau|increas|rais|grew|rose/, down = /sumazin|sumazej|atpig|nuolaid|maziau|decreas|discount|reduc|cheaper|fell/;
    if (pct.length >= 2 && !money.length && has(f, /keliais procentais|kiek procent|by how many percent|what percent|percentage/)) {
      const signs = pct.map((q, i) => { const before = fold(s.slice(i ? pct[i - 1].at : 0, q.at)); const lu = Math.max(...[...before.matchAll(new RegExp(up.source, 'g'))].map((x) => x.index), -1), ld = Math.max(...[...before.matchAll(new RegExp(down.source, 'g'))].map((x) => x.index), -1); return ld > lu ? -1 : lu > ld ? 1 : 0; });
      for (let i = 1; i < signs.length; i++) if (signs[i] === 0) signs[i] = signs[i - 1];
      if (signs[0] === 0) signs[0] = up.test(f) ? 1 : -1;
      const k = pct.reduce((acc, q, i) => acc * (1 + (signs[i] * q.v) / 100), 1);
      return out('Successive percent changes', [{ title: 'Multiply the factors', math: `${pct.map((q, i) => `(1 ${signs[i] > 0 ? '+' : '-'} ${q.v / 100})`).join('')} = ${fmt(k)}` }], [[k < 1 ? 'decreased by %' : 'increased by %', r6(Math.abs(k - 1) * 100)]]);
    }
    // a price changed by p %: new price
    if (pct.length === 1 && (money.length >= 1 || nums.length === 2) && !has(f, /palukan|interest/)) {
      const base = (money[0] || qs.find((q) => q.unit !== 'percent')).v, p = pct[0].v, sgn = down.test(f) ? -1 : 1, v = base * (1 + (sgn * p) / 100);
      return out(sgn > 0 ? 'Percent increase' : 'Percent decrease', [{ title: `New value = old · (1 ${sgn > 0 ? '+' : '-'} p)`, math: `${base} \\cdot ${fmt(1 + (sgn * p) / 100)} = ${fmt(v)}` }], [['new', r6(v)]]);
    }
    // compound interest with any word order
    if (has(f, /palukan|interest/) && pct.length === 1 && money.length >= 1) {
      const P0 = money[0].v, p = pct[0].v, yrs = (qs.find((q) => q.unit === 'time') || {}).v;
      if (yrs) { const A = P0 * (1 + p / 100) ** yrs; return out('Compound interest', [{ title: 'Multiply by $1 + r$ every year', math: `${P0} \\cdot ${1 + p / 100}^{${yrs}} = ${fmt(Math.round(A * 100) / 100)}` }], [['amount', Math.round(A * 100) / 100]]); }
    }
  }

  // ===================== motion =====================
  const speeds = allOf(qs, 'speed'), dists = allOf(qs, 'dist').concat(qs.filter((q) => q.unit === 'len' && has(f, /bego|nubego|ejo|runs?|walk/))), times = allOf(qs, 'time');
  const isMotion = speeds.length || has(f, /greit|speed|nuvaziav|travel|drives?|kelion/);
  if (isMotion) {
    // boat: downstream and upstream speeds
    if (has(f, /pasrov|downstream/) && has(f, /pries srov|upstream/) && speeds.length >= 2 && has(f, /tekmes|sroves|current|stream speed/)) {
      const [d, u] = speeds.map((q) => q.v), c = Math.abs(d - u) / 2;
      return out('River current', [{ title: 'Current = (downstream − upstream) / 2', math: `\\frac{${d} - ${u}}{2} = ${fmt(c)}` }], [['current', r6(c)]]);
    }
    if (has(f, /pasrov|downstream/) && has(f, /pries srov|upstream/) && speeds.length >= 2 && has(f, /stovincia|nuosav|still water|own speed/)) {
      const [d, u] = speeds.map((q) => q.v), v = (d + u) / 2;
      return out('Speed in still water', [{ title: 'Own speed = (downstream + upstream) / 2', math: `\\frac{${d} + ${u}}{2} = ${fmt(v)}` }], [['v', r6(v)]]);
    }
    // two vehicles towards each other: time to meet
    if (has(f, /priespriesiais|vienas priesais kita|toward each other|towards each other/) && speeds.length >= 2 && dists.length >= 1 && has(f, /po kiek|kada|when|how long|after how/)) {
      const D = dists[0].v, v = speeds[0].v + speeds[1].v, t = D / v;
      return out('Meeting time', [{ title: 'They close the gap at the sum of their speeds', math: `t = \\frac{${D}}{${speeds[0].v} + ${speeds[1].v}} = ${fmt(t)}` }], [['t', r6(t)]]);
    }
    // two legs of a trip: average speed = total distance / total time
    if (has(f, /vidutin|average/) && speeds.length >= 2 && times.length >= 2) {
      const pairs = [];
      // pair each time with the next speed after it
      for (const t of times) { const sp = speeds.find((q) => q.at > t.at && !pairs.some((p) => p[1] === q)); if (sp) pairs.push([t, sp]); }
      if (pairs.length >= 2) {
        const D = pairs.reduce((a, [t, v]) => a + t.v * v.v, 0), T = pairs.reduce((a, [t]) => a + t.v, 0);
        return out('Average speed', [{ title: 'Average speed = total distance / total time', math: `\\frac{${pairs.map(([t, v]) => `${t.v} \\cdot ${v.v}`).join(' + ')}}{${pairs.map(([t]) => t.v).join(' + ')}} = ${fmt(D / T)}` }], [['v', r6(D / T)]]);
      }
    }
    // one object: any two of distance, speed, time
    const D = dists[0]?.v, V = speeds[0]?.v, T = times[0]?.v;
    if (asks(/greit|speed|how fast/) && D !== undefined && T !== undefined && V === undefined) return out('Speed', [{ title: 'Speed = distance / time', math: `\\frac{${D}}{${T}} = ${fmt(D / T)}` }], [['v', r6(D / T)]]);
    if (asks(/kiek laiko|per kiek|how long|how much time|kiek valand/) && D !== undefined && V !== undefined) return out('Time', [{ title: 'Time = distance / speed', math: `\\frac{${D}}{${V}} = ${fmt(D / V)}` }], [['t', r6(D / V)]]);
    if (asks(/kiek kilometr|koki atstum|how far|distance|kiek km/) && V !== undefined && T !== undefined) return out('Distance', [{ title: 'Distance = speed · time', math: `${V} \\cdot ${T} = ${fmt(V * T)}` }], [['s', r6(V * T)]]);
  }

  // ===================== work and pipes =====================
  if (has(f, /darbinink|meistr|workers?|vamzd|pipes?|siurbl|pumps?|baseina|tank|darba|job/)) {
    // N workers do it in D days; how long for M workers (inverse proportion)
    const wkr = f.match(/(\d+)\s+\w*\s*(?:darbinink|meistr|workers?|siurbl|pumps?)\w*\D+?(\d+(?:\.\d+)?)\s*(?:dien|val|h|days?|hours?)\w*\D+?(\d+)\s+(?:darbinink|meistr|workers?|siurbl|pumps?)/);
    const wn = wkr ? null : (() => { const a = wordNum('(?:darbinink|meistr|workers?|siurbl|pumps?)'); const tm = f.match(/(\d+(?:\.\d+)?)\s*(?:dien|val|h|days?|hours?)/); const b = f.match(/(\d+)\s+(?:darbinink|meistr|workers?|siurbl|pumps?)/); return a && tm && b ? [null, a, tm[1], b[1]] : null; })();
    const w = wkr || wn;
    if (w) { const [n1, d, n2] = [Number(w[1]), Number(w[2]), Number(w[3])], t = (n1 * d) / n2; return out('Inverse proportion', [{ title: 'Workers × time stays the same', math: `\\frac{${n1} \\cdot ${d}}{${n2}} = ${fmt(t)}` }], [['t', r6(t)]]); }
    if (has(f, /istustin|isleid|empties|drains/) && times.length >= 2) {
      const [a, b] = times.map((q) => q.v), t = 1 / (1 / a - 1 / b);
      return out('Filling and emptying', [{ title: 'Emptying works against filling: subtract the rates', math: `\\frac{1}{${a}} - \\frac{1}{${b}} = \\frac{1}{t} \\Rightarrow t = ${fmt(t)}` }], [['t', r6(t)]]);
    }
    if (has(f, /greiciau|leciau|faster|slower/) && has(f, /kartu|together/) && times.length >= 2) {
      const [T, d] = times.map((q) => q.v); // together T, one is d faster: 1/x + 1/(x + d) = 1/T
      const x = ((2 * T - d) + Math.sqrt((2 * T - d) ** 2 + 4 * T * d)) / 2;
      return out('Working together', [{ title: '$\\frac{1}{x} + \\frac{1}{x + d} = \\frac{1}{T}$', math: `x = ${fmt(x)},\\ x + ${d} = ${fmt(x + d)}` }], [['first', r6(x)], ['second', r6(x + d)]]);
    }
    if (has(f, /kartu|abu|together|both/) && times.length >= 2) {
      const [a, b] = times.map((q) => q.v), t = (a * b) / (a + b);
      return out('Working together', [{ title: 'Add the parts done per unit of time', math: `\\frac{1}{${a}} + \\frac{1}{${b}} = \\frac{1}{t} \\Rightarrow t = ${fmt(t)}` }], [['t', r6(t)]]);
    }
  }

  // ===================== progressions =====================
  if (has(f, /progresij|progression|sequence|seka\b/) || has(f, /kiekvien\w* kit\w*|each next|each following|every next/)) {
    const geo = has(f, /geometrin|geometric/);
    const a1 = after(f, '(?:pirmasis narys|pirmas narys|first term|a1)') ?? after(f, '(?:pirmoje eileje|pirmoje|first row|first)');
    const dm = f.match(/(\d+(?:\.\d+)?)\s*\w*\s*(?:daugiau|more)/);
    const d = after(f, '(?:skirtumas|difference|common difference)') ?? (dm ? Number(dm[1]) : null);
    const q = after(f, '(?:vardiklis|ratio|common ratio)');
    const n = ordinal();
    const sumN = (m = f.match(/(?:pirmuju|first)\s+(\d+)\s+(?:nariu|terms)/)) ? Number(m[1]) : null;
    const ans = [], steps = [];
    if (a1 !== null && geo && q) {
      if (n) { const bn = a1 * q ** (n - 1); ans.push([`b${n}`, r6(bn)]); steps.push({ title: '$b_n = b_1 q^{n-1}$', math: `${a1} \\cdot ${q}^{${n - 1}} = ${fmt(bn)}` }); }
      if (sumN) { const Sn = q === 1 ? a1 * sumN : (a1 * (q ** sumN - 1)) / (q - 1); ans.push([`S${sumN}`, r6(Sn)]); steps.push({ title: '$S_n = b_1\\frac{q^n - 1}{q - 1}$', math: fmt(Sn) }); }
      if (ans.length) return out('Geometric progression', steps, ans);
    }
    if (a1 !== null && !geo && d) {
      if (n && (!sumN || n !== sumN || /nari\w*\s+ir|term and/.test(f))) { const an = a1 + (n - 1) * d; ans.push([`a${n}`, r6(an)]); steps.push({ title: '$a_n = a_1 + (n-1)d$', math: `${a1} + ${n - 1} \\cdot ${d} = ${fmt(an)}` }); }
      if (sumN) { const Sn = (sumN * (2 * a1 + (sumN - 1) * d)) / 2; ans.push([`S${sumN}`, r6(Sn)]); steps.push({ title: '$S_n = \\frac{n}{2}(2a_1 + (n-1)d)$', math: fmt(Sn) }); }
      if (ans.length) return out('Arithmetic progression', steps, ans);
    }
  }
  // growth by a factor each period: "kas valandą patrigubėja ... iš pradžių 100 ... po 5 valandų"
  if ((m = f.match(/(padvigub|patrigub|doubles|triples|padidej\w* (\d+) kart)/)) && (has(f, /is pradziu|pradzioje|initially|at first|start/))) {
    const k = /patrigub|triples/.test(m[1]) ? 3 : /padvigub|doubles/.test(m[1]) ? 2 : Number(m[2]);
    const start = after(f, '(?:is pradziu buvo|is pradziu|pradzioje buvo|pradzioje|initially there were|initially|at first)');
    const tm = f.match(/po\s+(\d+)\s*(?:val|h|dien|met|min)|after\s+(\d+)\s*(?:hours?|days?|years?|minutes?)/);
    if (start && tm && !has(f, /daugiau nei|more than/)) { const t = Number(tm[1] ?? tm[2]), v = start * k ** t; return out('Exponential growth', [{ title: `Multiply by ${k} every period`, math: `${start} \\cdot ${k}^{${t}} = ${fmt(v)}` }], [['count', r6(v)]]); }
  }

  // ===================== probability and counting =====================
  if (has(f, /kauliuk|\bdie\b|\bdice\b/) && has(f, /tikimyb|probab/) && has(f, /suma|sum/) && (m = f.match(/(?:suma|sum)\D{0,25}?(\d+)/))) {
    const target = Number(m[1]), dice = has(f, /trys|tris|three/) ? 3 : 2;
    let cnt = 0; const rec = (k, sm) => { if (k === 0) { if (sm === target) cnt++; return; } for (let i = 1; i <= 6; i++) rec(k - 1, sm + i); }; rec(dice, 0);
    return out('Probability', [{ title: `Outcomes with sum ${target} / all ${6 ** dice}`, math: `\\frac{${cnt}}{${6 ** dice}}` }], [['P', prob(cnt / 6 ** dice)]]);
  }
  if (has(f, /kauliuk|\bdie\b|\bdice\b/) && has(f, /tikimyb|probab/) && !has(f, /suma|sum/)) {
    const cond = has(f, /nelygin|\bodd/) ? [1, 3, 5] : has(f, /lygin|\beven/) ? [2, 4, 6] : has(f, /pirmin|prime/) ? [2, 3, 5] : (m = f.match(/(?:daugiau uz|didesn\w* uz|more than|greater than)\s+(\d)/)) ? [1, 2, 3, 4, 5, 6].filter((x) => x > Number(m[1])) : (m = f.match(/(?:maziau uz|mazesn\w* uz|less than)\s+(\d)/)) ? [1, 2, 3, 4, 5, 6].filter((x) => x < Number(m[1])) : null;
    if (cond) return out('Probability', [{ title: 'Favourable outcomes / all outcomes', math: `\\frac{${cond.length}}{6}` }], [['P', prob(cond.length / 6)]]);
  }
  if (has(f, /tikimyb|probab/)) {
    // groups "6 obuoliai ir 4 kriaušės", "3 balti ir 5 juodi"
    const drawAt = f.search(/atsitiktinai|traukiam|paimam|istrauk|at random|drawn|picked|chosen/);
    const grp = [...f.slice(0, drawAt > 0 ? drawAt : f.length).matchAll(/(\d+)\s+([a-z]+)/g)].filter((g) => !/^(kart\w*|cm|mm|m|km|kg|g|l|ml|proc\w*|val\w*|h|min\w*|eur\w*)$/.test(g[2]));
    if (grp.length >= 2) {
      const total = grp.reduce((a, g) => a + Number(g[1]), 0);
      const tail = f.slice(Math.max(f.lastIndexOf('kad'), f.lastIndexOf('that'), 0));
      const target = grp.find((g) => tail.includes(g[2].slice(0, Math.max(4, g[2].length - 2))));
      const k = (m = f.match(/(?:traukiam|paimam|istraukt|draw\w*|take\w*|pick\w*)\w*\s+(\d+)/)) ? Number(m[1]) : (has(f, /\b(du|dvi|two)\s+/) && has(f, /abu|abi|both/) ? 2 : 1);
      if (target) {
        const C = (n0, kk) => { let r = 1; for (let i = 0; i < kk; i++) r = (r * (n0 - i)) / (i + 1); return r; };
        const a = Number(target[1]);
        const p = k === 1 ? a / total : C(a, k) / C(total, k);
        return out('Probability', [{ title: k === 1 ? 'Favourable / all' : 'Ways to pick only these / all ways', math: k === 1 ? `\\frac{${a}}{${total}}` : `\\frac{C_{${a}}^{${k}}}{C_{${total}}^{${k}}} = \\frac{${C(a, k)}}{${C(total, k)}}` }], [['P', prob(p)]]);
      }
    }
  }
  if (has(f, /isrikiuoti|isdestyti|sustatyti|susodinti|arrange|line up|sit in a row|in a row|orders?/) && (m = f.match(/(\d+)\s+\w+/))) {
    const n0 = Number(m[1]); let v = 1; for (let i = 2; i <= n0; i++) v *= i;
    return out('Arrangements', [{ title: `$${n0}!$ ways to order ${n0} things`, math: `${n0}! = ${v}` }], [['count', v]]);
  }
  if (has(f, /kod\w*|codes?|passwords?|slaptazod/) && has(f, /skaitmen|digits?/) && has(f, /kartot|repeat/)) {
    const len = (m = f.match(/(\d+)\s*(?:-?\s*(?:skaitmen|digit))/)) ? Number(m[1]) : wordNum('(?:skaitmen|digit)');
    if (len) { const rep = !has(f, /nesikartoj|don't repeat|do not repeat|without repet|different/); let v = 1; for (let i = 0; i < len; i++) v *= rep ? 10 : 10 - i; return out('Counting', [{ title: rep ? '10 choices for every digit' : 'Digits do not repeat', math: `${v}` }], [['count', v]]); }
  }

  // ===================== statistics =====================
  if (has(f, /vidurk|mean|average|median|mod[aą]?\b|mode/) && (m = s.match(/:\s*(-?[\d.,\s;]+\d)/))) {
    const xs = m[1].replace(/(\d),(\d)/g, '$1.$2').split(/[;,]\s*|\s+/).map(Number).filter((x) => !Number.isNaN(x));
    if (xs.length >= 2) {
      const ans = [], steps = [];
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length, so = [...xs].sort((a, b) => a - b);
      const med = so.length % 2 ? so[(so.length - 1) / 2] : (so[so.length / 2 - 1] + so[so.length / 2]) / 2;
      if (has(f, /vidurk|mean|average/)) { ans.push(['mean', r6(mean)]); steps.push({ title: 'Mean = sum / count', math: `${fmt(xs.reduce((a, b) => a + b, 0))} / ${xs.length} = ${fmt(mean)}` }); }
      if (has(f, /median/)) { ans.push(['median', med]); steps.push({ title: 'Median: middle value after sorting', math: so.join(',\\ ') }); }
      if (ans.length) return out('Statistics', steps, ans);
    }
  }
  if (has(f, /vidurk|average|mean/) && has(f, /pridej|added|another number/)) {
    const cw = f.match(/(\w+)\s+(?:skaiciu|numbers)\s+(?:vidurk|average|mean)/) || f.match(/(?:average|mean) of (\w+) numbers/);
    const cnt = cw ? (/^\d+$/.test(cw[1]) ? Number(cw[1]) : (NUMW.find(([re]) => re.test(cw[1])) || [])[1]) : null;
    const ms = nums.filter((x) => x !== cnt);
    if (cnt && ms.length >= 2) { const v = (cnt + 1) * ms[1] - cnt * ms[0]; return out('Mean', [{ title: 'New sum − old sum', math: `${cnt + 1} \\cdot ${ms[1]} - ${cnt} \\cdot ${ms[0]} = ${fmt(v)}` }], [['number', v]]); }
  }

  // ===================== number stories =====================
  if ((m = f.match(/(?:suma|sum)(?:\s+of\s+(?:the\s+)?\w+\s+\w+)?\s+(?:yra\s+|lygi\s+|is\s+)?(\d+(?:\.\d+)?)\D+?(?:skirtumas|difference)\s+(?:yra\s+|is\s+)?(\d+(?:\.\d+)?)/))) {
    const S0 = Number(m[1]), d = Number(m[2]);
    return out('Sum and difference', [{ title: '$x + y = S$, $x - y = d$', math: `x = \\frac{${S0} + ${d}}{2} = ${fmt((S0 + d) / 2)},\\ y = ${fmt((S0 - d) / 2)}` }], [['x', (S0 + d) / 2], ['y', (S0 - d) / 2]]);
  }
  if (has(f, /is eiles|einanci|consecutive/) && (m = f.match(/(?:suma|sum)\D+?(\d+)/))) {
    const k = wordNum('(?:is eiles|einanci|consecutive)') || (f.match(/(\d+)\s+(?:is eiles|consecutive)/) || [])[1] || 2, S0 = Number(m[1]), K = Number(k);
    const x = (S0 - (K * (K - 1)) / 2) / K;
    return out('Consecutive numbers', [{ title: `$x + (x + 1) + \\dots$ (${K} numbers) $= ${S0}$`, math: `${K}x + ${(K * (K - 1)) / 2} = ${S0} \\Rightarrow x = ${fmt(x)}` }], [['smallest', x]]);
  }
  if ((m = f.match(/(\d+)\s*kartus?\s*(?:vyresn|didesn|daugiau|older|bigger|more)\w*/)) && (m2(f) !== null)) {
    const k = Number(m[1]), S0 = m2(f), small = S0 / (k + 1);
    return out('Ratio story', [{ title: `One part is $x$, the other $${k}x$: $x + ${k}x = ${S0}$`, math: `x = ${fmt(small)},\\ ${k}x = ${fmt(k * small)}` }], [['x', r6(small)], ['big', r6(k * small)]]);
  }
  if ((m = f.match(/(\d+(?:\.\d+)?)\s*(?:padalyk|padalinkite|daly|divide|split)\w*\s+(?:santykiu|in the ratio|in ratio)\s+(\d+)\s*:\s*(\d+)/)) || (m = f.match(/(?:skaiciu|divide|split)\s+(\d+(?:\.\d+)?)\s+\w*\s*(?:santykiu|in the ratio|in ratio)\s+(\d+)\s*:\s*(\d+)/))) {
    const T = Number(m[1]), a = Number(m[2]), b = Number(m[3]), u = T / (a + b);
    return out('Dividing in a ratio', [{ title: 'One part = total / (a + b)', math: `\\frac{${T}}{${a} + ${b}} = ${fmt(u)}:\\quad ${fmt(a * u)},\\ ${fmt(b * u)}` }], [['first', r6(a * u)], ['second', r6(b * u)]]);
  }
  if (has(f, /consecutive integers|consecutive numbers/) && (m = f.match(/sum of two consecutive \w+ is (\d+)/))) {
    const x = (Number(m[1]) - 1) / 2;
    return out('Consecutive numbers', [{ title: '$x + (x + 1) = S$', math: `x = ${fmt(x)}` }], [['smaller', x]]);
  }
  return null;
}
// sum of the two: "abiejų amžių suma 50"
function m2(f) { const m = f.match(/(?:suma|sum|together)\s+(?:yra\s+|lygi\s+|is\s+)?(\d+(?:\.\d+)?)/) || f.match(/(\d+(?:\.\d+)?)\s+(?:metu|years)\s*$/); return m ? Number(m[1]) : null; }
