// Word problems in Lithuanian (VBE style): percentages and money, motion, work, progressions,
// probability and counting, statistics, geometry and optimisation.
// wordProblem(text) returns { title, steps, answers: [[label, value]] } or null when no pattern fits.
import { Q, formatNumber } from './rational.js';
import { parse, unicodeMath } from './parser.js';
import { fromRaw, simplify, evalNum } from './cas.js';
import { tex } from './print.js';
import { solveEquation } from './solve.js';

const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// all numbers in the text: "19,5 %" -> 19.5, "100 000" -> 100000, "0–9" -> 0, 9
function numbers(s) {
  const t = s.replace(/(\d)\s(\d{3})(?!\d)/g, '$1$2').replace(/(\d),(\d)/g, '$1.$2').replace(/[₀-₉]/g, (c) => '₀₁₂₃₄₅₆₇₈₉'.indexOf(c));
  return [...t.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}
const N = (x) => simplify(fromRaw(parse(String(x))));
const show = (x) => (typeof x === 'number' ? formatNumber(x) : tex(x));
const nice = (v) => { for (let d = 1; d <= 1000; d++) { const n = Math.round(v * d); if (Math.abs(n / d - v) < 1e-9 * Math.max(1, Math.abs(v))) return d === 1 ? n : new Q(BigInt(n), BigInt(d)); } return v; };
const val = (x) => (x instanceof Q ? x.toNumber() : x);
const fmt = (x) => (x instanceof Q ? (x.isInt() ? x.n.toString() : `${x.n}/${x.d}`) : formatNumber(x));
const C = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return Math.round(r); };
const Pn = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r *= n - i; return r; };
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
// positive real solutions of an equation in x
function solvePos(eq, v = 'x') {
  const [l, r] = eq.split('=');
  const res = solveEquation(N(l), N(r), v, []);
  return (res.solutions || []).map((q) => evalNum(q)).filter((q) => q > 1e-12).sort((a, b) => a - b);
}
const out = (title, steps, answers) => ({ title, steps, answers });

export function wordProblem(raw) {
  const s = raw.replace(/\s+/g, ' ').trim(), f = fold(s), n = numbers(s);
  let m;
  // ================= percentages and money =================
  if (/padidint|pabrang/.test(f) && /sumazint|atpig/.test(f) && /keliais procentais|kiek procent/.test(f) && n.length >= 2) {
    const ups = /padidint|pabrang/.exec(f).index < /sumazint|atpig/.exec(f).index;
    const [p, q] = n;
    const k = ups ? (1 + p / 100) * (1 - q / 100) : (1 - p / 100) * (1 + q / 100);
    const ch = nice(Math.abs(k - 1) * 100);
    return out('Percent change', [{ title: 'Multiply the factors of the two changes', math: `${ups ? `(1 + ${p / 100})(1 - ${q / 100})` : `(1 - ${p / 100})(1 + ${q / 100})`} = ${formatNumber(k)}` },
      { title: k < 1 ? 'Below 1: the price went down' : 'Above 1: the price went up', math: `${formatNumber(k)} - 1 = ${formatNumber(k - 1)} \\Rightarrow ${fmt(ch)}\\%` }], [[k < 1 ? 'decreased by %' : 'increased by %', ch]]);
  }
  if (/sudetin\S* palukan/.test(f) && n.length >= 3) {
    const P0 = n[0], r = n[1], yrs = n[2];
    const A = P0 * (1 + r / 100) ** yrs;
    return out('Compound interest', [{ title: 'Each year the amount is multiplied by $1 + r$', math: `${P0} \\cdot ${1 + r / 100}^{${yrs}} = ${formatNumber(Math.round(A * 100) / 100)}` }], [['amount', Math.round(A * 100) / 100]]);
  }
  if (/vienod\S* nuolaid/.test(f) && (m = s.match(/nuo\s+([\d\s,.]+)\D+iki\s+([\d\s,.]+)/))) {
    const k = /trij/.test(f) ? 3 : 2, a = numbers(m[1])[0], b = numbers(m[2])[0];
    const q = 1 - (b / a) ** (1 / k);
    return out('Equal discounts', [{ title: `After ${k} equal discounts of $p$: $${a}(1 - p)^{${k}} = ${b}$`, math: `1 - p = \\sqrt[${k}]{${b}/${a}} = ${formatNumber(1 - q)}` }], [['discount %', nice(q * 100)]]);
  }
  if (/lydin|misin|tirpal/.test(f) && /gryn/.test(f) && /pridet/.test(f) && n.length >= 3) {
    const [M, p, q] = n;
    const x = (M * (q - p)) / (100 - q);
    return out('Mixture', [{ title: `Pure part before: ${p}% of ${M}; after adding $x$ kg it must be ${q}%`, math: `${p / 100}\\cdot ${M} + x = ${q / 100}(${M} + x) \\Rightarrow x = ${formatNumber(x)}` }], [['kg', nice(x)]]);
  }
  if (/vanden/.test(f) && /tirpal/.test(f) && /ipilti|pripilti|pilti/.test(f) && n.length >= 3) {
    const [V, p, q] = n;
    const x = (V * (p - q)) / q;
    return out('Dilution', [{ title: 'The amount of the dissolved substance stays the same', math: `${p / 100}\\cdot ${V} = ${q / 100}(${V} + x) \\Rightarrow x = ${formatNumber(x)}` }], [['liters', nice(x)]]);
  }
  if (/bruto/.test(f) && /i rankas|i rank/.test(f) && n.length >= 3) {
    const base = n[0], cuts = n.slice(1).reduce((a, b) => a + b, 0);
    const net = base * (1 - cuts / 100);
    return out('Net salary', [{ title: 'Subtract all the percentages from the gross salary', math: `${base}\\left(1 - \\frac{${n.slice(1).join(' + ')}}{100}\\right) = ${formatNumber(net)}` }], [['net', nice(net)]]);
  }
  // ================= motion =================
  if (/priespriesiais/.test(f) && /susitiko/.test(f) && n.length >= 3) {
    const [D, d, t] = n;
    const v = (D / t - d) / 2;
    return out('Motion towards each other', [{ title: 'Together they cover the distance: $(v + v + d)\\,t = D$', math: `(2v + ${d}) \\cdot ${t} = ${D} \\Rightarrow v = ${formatNumber(v)}` }], [['v1', nice(v)], ['v2', nice(v + d)]]);
  }
  if (/pasrov/.test(f) && /tekmes greitis|srovės greitis|sroves greitis/.test(f) && n.length >= 3) {
    const [D, T, c] = n;
    const sol = solvePos(`${D}/(x+${c}) + ${D}/(x-${c}) = ${T}`).filter((q) => q > c);
    if (sol.length) return out('Boat on a river', [{ title: 'Time downstream + time upstream = total time', math: `\\frac{${D}}{v + ${c}} + \\frac{${D}}{v - ${c}} = ${T} \\Rightarrow v = ${formatNumber(sol[0])}` }], [['v', nice(sol[0])]]);
  }
  if (/puse kelio/.test(f) && /likusia puse/.test(f) && n.length >= 2) {
    const [a, b] = n, v = (2 * a * b) / (a + b);
    return out('Average speed', [{ title: 'Average speed = total distance / total time (equal halves)', math: `\\frac{2 \\cdot ${a} \\cdot ${b}}{${a} + ${b}} = ${formatNumber(v)}` }], [['v', nice(v)]]);
  }
  if (/traukin/.test(f) && /stulp/.test(f) && /til/.test(f) && n.length >= 3) {
    const [L, t1, t2] = n, v = L / t1, B = v * t2 - L;
    return out('Train and bridge', [{ title: 'Speed from passing the pole', math: `v = \\frac{${L}}{${t1}} = ${formatNumber(v)}` }, { title: 'On the bridge the train covers the bridge plus its own length', math: `${formatNumber(v)} \\cdot ${t2} - ${L} = ${formatNumber(B)}` }], [['bridge', nice(B)]]);
  }
  if (/greiciau nei planuot/.test(f) && /anksciau/.test(f) && n.length >= 3) {
    const [D, d, h] = n;
    const sol = solvePos(`${D}/x - ${D}/(x+${d}) = ${h}`);
    if (sol.length) return out('Planned speed', [{ title: 'Planned time − real time = time saved', math: `\\frac{${D}}{v} - \\frac{${D}}{v + ${d}} = ${h} \\Rightarrow v = ${formatNumber(sol[0])}` }], [['v', nice(sol[0])]]);
  }
  if (/ratu/.test(f) && /aplenk/.test(f) && n.length >= 3) {
    const [R, a, b] = n, t = R / Math.abs(a - b);
    return out('Laps', [{ title: 'The faster runner gains one whole lap', math: `t = \\frac{${R}}{${a} - ${b}} = ${formatNumber(t)}` }], [['t', nice(t)]]);
  }
  if (/vidutin\S* greit|koks .*greitis|kokiu greiciu/.test(f) && /nuvaziav|nuejo|nubego|nuskrido|nuplauk/.test(f) && (m = s.match(/(\d+(?:[.,]\d+)?)\s*km/)) && (/(\d+(?:[.,]\d+)?)\s*(?:val\S*|h\b)/.test(s))) {
    const D = Number(m[1].replace(',', '.')), T = Number(s.match(/(\d+(?:[.,]\d+)?)\s*(?:val\S*|h\b)/)[1].replace(',', '.'));
    return out('Speed', [{ title: 'Speed = distance / time', math: `v = \\frac{${D}}{${T}} = ${formatNumber(D / T)}` }], [['v', nice(D / T)]]);
  }
  // ================= work =================
  if (/istustin/.test(f) && n.length >= 2) {
    const [a, b] = n, t = 1 / (1 / a - 1 / b);
    return out('Filling and emptying', [{ title: 'Add the rates (emptying counts as negative)', math: `\\frac{1}{${a}} - \\frac{1}{${b}} = \\frac{1}{t} \\Rightarrow t = ${formatNumber(t)}` }], [['t', nice(t)]]);
  }
  if (/kartu/.test(f) && /greiciau nei antras/.test(f) && n.length >= 2) {
    const [T, d] = n;
    const sol = solvePos(`1/x + 1/(x+${d}) = 1/${T}`);
    if (sol.length) return out('Working together', [{ title: 'Rates add up: $\\frac{1}{x} + \\frac{1}{x + d} = \\frac{1}{T}$', math: `x = ${formatNumber(sol[0])},\\ x + ${d} = ${formatNumber(sol[0] + d)}` }], [['first', nice(sol[0])], ['second', nice(sol[0] + d)]]);
  }
  if (/(darba|baseina|atlieka|pripildo)/.test(f) && /kartu/.test(f) && n.length >= 2) {
    const [a, b] = n, t = (a * b) / (a + b);
    return out('Working together', [{ title: 'Add the parts done per hour', math: `\\frac{1}{${a}} + \\frac{1}{${b}} = \\frac{1}{t} \\Rightarrow t = ${formatNumber(t)}` }], [['t', nice(t)]]);
  }
  // ================= progressions =================
  const su = unicodeMath(s);
  const terms = [...su.matchAll(/([a-zA-Z])_?\(?(\d+)\)?\s*=\s*(-?[\d.,]+)/g)].map((q) => [q[1], Number(q[2]), Number(q[3].replace(',', '.'))]);
  if (/aritmetin/.test(f) && terms.length >= 2) {
    const [[, i, ai], [, j, aj]] = terms, d = (aj - ai) / (j - i), a1 = ai - (i - 1) * d;
    const k = Number((su.match(/S_?\(?(\d+)\)?/) || [])[1] || 0);
    const steps = [{ title: '$a_n = a_1 + (n-1)d$: subtract the two given terms', math: `d = \\frac{${aj} - ${ai}}{${j} - ${i}} = ${formatNumber(d)},\\quad a_1 = ${formatNumber(a1)}` }];
    const ans = [['a1', nice(a1)], ['d', nice(d)]];
    if (k) { const Sk = (k * (2 * a1 + (k - 1) * d)) / 2; steps.push({ title: '$S_n = \\frac{n}{2}(2a_1 + (n-1)d)$', math: `S_{${k}} = ${formatNumber(Sk)}` }); ans.push([`S${k}`, nice(Sk)]); }
    return out('Arithmetic progression', steps, ans);
  }
  if (/geometrin/.test(f) && terms.length >= 2 && !/nykstam/.test(f)) {
    const [[, i, bi], [, j, bj]] = terms, q = Math.sign(bj / bi) * Math.abs(bj / bi) ** (1 / (j - i)), b1 = bi / q ** (i - 1);
    const k = Number((su.match(/S_?\(?(\d+)\)?/) || [])[1] || 0);
    const steps = [{ title: '$b_n = b_1 q^{n-1}$: divide the two given terms', math: `q^{${j - i}} = \\frac{${bj}}{${bi}} \\Rightarrow q = ${formatNumber(q)},\\quad b_1 = ${formatNumber(b1)}` }];
    const ans = [['b1', nice(b1)], ['q', nice(q)]];
    if (k) { const Sk = (b1 * (q ** k - 1)) / (q - 1); steps.push({ title: '$S_n = b_1 \\frac{q^n - 1}{q - 1}$', math: `S_{${k}} = ${formatNumber(Sk)}` }); ans.push([`S${k}`, nice(Sk)]); }
    return out('Geometric progression', steps, ans);
  }
  if (/nykstam/.test(f) && /suma/.test(f) && n.length >= 2) {
    const Ssum = n[0], a = n[1], q = 1 - a / Ssum;
    return out('Infinite geometric progression', [{ title: '$S = \\frac{b_1}{1 - q}$', math: `${Ssum} = \\frac{${a}}{1 - q} \\Rightarrow q = ${fmt(nice(q))}` }], [['q', nice(q)]]);
  }
  if (/kiekvien\S* kit\S*/.test(f) && /daugiau/.test(f) && /is viso/.test(f) && n.length >= 3) {
    const [a, d, total] = n;
    const sol = solvePos(`x*(2*${a} + (x-1)*${d})/2 = ${total}`);
    if (sol.length) return out('Arithmetic progression', [{ title: '$S_n = \\frac{n}{2}(2a_1 + (n-1)d)$', math: `\\frac{n}{2}(2 \\cdot ${a} + (n-1) \\cdot ${d}) = ${total} \\Rightarrow n = ${formatNumber(sol[0])}` }], [['n', nice(sol[0])]]);
  }
  if (/padvigub|patrigub|padideja \d+ kart/.test(f) && /daugiau nei/.test(f) && n.length >= 2) {
    const k = /patrigub/.test(f) ? 3 : 2, a = n[0], M = n[n.length - 1];
    let t = 0; while (a * k ** t <= M && t < 1000) t++;
    return out('Exponential growth', [{ title: `After $t$ steps: $${a} \\cdot ${k}^t > ${M}$`, math: `${k}^t > ${formatNumber(M / a)} \\Rightarrow t = ${t}` }], [['t', t]]);
  }
  if (/tarp skaiciu/.test(f) && /geometrin/.test(f) && n.length >= 2) {
    const a = n[0], b = n[1], k = /tris|trys/.test(f) ? 3 : /du|dvi/.test(f) ? 2 : /keturi/.test(f) ? 4 : 1;
    const q = (b / a) ** (1 / (k + 1)), mids = Array.from({ length: k }, (_, i) => a * q ** (i + 1));
    return out('Geometric progression', [{ title: `$${b} = ${a} \\cdot q^{${k + 1}}$`, math: `q = ${formatNumber(q)}:\\quad ${mids.map((x) => formatNumber(x)).join(';\\ ')}` }], mids.map((x, i) => [`term ${i + 2}`, nice(x)]));
  }
  // ================= probability and counting =================
  if (/kauliuk/.test(f) && /suma/.test(f) && n.length) {
    const target = n[n.length - 1], dice = /trys|tris/.test(f) ? 3 : 2;
    let cnt = 0, tot = 6 ** dice;
    const rec = (k, sum) => { if (k === 0) { if (sum === target) cnt++; return; } for (let i = 1; i <= 6; i++) rec(k - 1, sum + i); };
    rec(dice, 0);
    return out('Probability', [{ title: `Count the outcomes with sum ${target} out of all ${tot}`, math: `P = \\frac{${cnt}}{${tot}}` }], [['P', nice(cnt / tot)]]);
  }
  if (/tikimyb/.test(f) && /traukiam|istraukt|paimam/.test(f) && (m = s.match(/(\d+)\s+(\S+)\s+ir\s+(\d+)\s+(\S+)/))) {
    const a = Number(m[1]), b = Number(m[3]), k = numbers(s.slice(s.indexOf(m[0]) + m[0].length))[0] || 2;
    const both = /abu|visi|abi/.test(f);
    if (both) { const p = C(a, k) / C(a + b, k); return out('Probability', [{ title: 'Favourable choices / all choices', math: `\\frac{C_{${a}}^{${k}}}{C_{${a + b}}^{${k}}} = \\frac{${C(a, k)}}{${C(a + b, k)}}` }], [['P', nice(p)]]); }
  }
  if (/pin|kod/.test(f) && /skaitmen/.test(f) && n.length) {
    const k = n[0], rep = !/nesikartoj/.test(f);
    const v = rep ? 10 ** k : Pn(10, k);
    return out('Counting', [{ title: rep ? 'Each place: 10 choices' : 'Digits do not repeat: 10 · 9 · 8 · …', math: `${v}` }], [['count', v]]);
  }
  if (/keliais budais|kiek budu/.test(f) && /isrinkti/.test(f) && n.length) {
    // roles listed after "išrinkti": "seniūną, jo pavaduotoją ir iždininką" -> 3 different roles
    const after = (s.match(/išrinkti\s+(.+?)[?.]/i) || [])[1] || '';
    const roles = /komand|grup|asmen/.test(fold(after)) ? 0 : after.split(/,|\s+ir\s+/).filter((q) => q.trim()).length;
    if (roles >= 2) { const N0 = n[0], v = Pn(N0, roles); return out('Counting (order matters)', [{ title: `Different roles: ${N0} · ${N0 - 1} · …`, math: `A_{${N0}}^{${roles}} = ${v}` }], [['count', v]]); }
    if (/komand|grup|asmen/.test(f) && n.length >= 2) { const [N0, k] = n; const v = C(N0, k); return out('Counting (order does not matter)', [{ title: 'Choose a group: combinations', math: `C_{${N0}}^{${k}} = ${v}` }], [['count', v]]); }
  }
  if (/moneta/.test(f) && /lygiai/.test(f) && n.length >= 2) {
    const [tries, k] = n, p = C(tries, k) / 2 ** tries;
    return out('Probability', [{ title: 'Binomial: $C_n^k / 2^n$', math: `\\frac{${C(tries, k)}}{${2 ** tries}}` }], [['P', nice(p)]]);
  }
  if (/tikimyb/.test(f) && /bent/.test(f) && /kartus|kartu/.test(f) && n.length >= 2) {
    const p = n.find((q) => q < 1), k = n.find((q) => q >= 1);
    if (p !== undefined && k) { const v = 1 - (1 - p) ** k; return out('Probability', [{ title: '“At least once” = 1 − “never”', math: `1 - (1 - ${p})^{${k}} = ${formatNumber(v)}` }], [['P', nice(v)]]); }
  }
  if (/raidziu sek|raidziu kombinacij|perstat/.test(f) && (m = s.match(/žodžio\s+([A-ZĄČĘĖĮŠŲŪŽ]+)|zodzio\s+([A-Z]+)/i))) {
    const w = (m[1] || m[2]).toUpperCase(), cnt = {};
    for (const ch of w) cnt[ch] = (cnt[ch] || 0) + 1;
    const v = Object.values(cnt).reduce((a, k) => a / fact(k), fact(w.length));
    return out('Counting', [{ title: 'Permutations with repeated letters', math: `\\frac{${w.length}!}{${Object.values(cnt).filter((k) => k > 1).map((k) => `${k}!`).join(' \\cdot ') || '1'}} = ${v}` }], [['count', v]]);
  }
  if (/tikimyb/.test(f) && /abu/.test(f) && /bent vien/.test(f) && n.length >= 3) {
    const [a, b, ab] = n, v = a + b - ab, indep = Math.abs(a * b - ab) < 1e-12;
    return out('Probability', [{ title: '$P(A \\cup B) = P(A) + P(B) - P(A \\cap B)$', math: `${a} + ${b} - ${ab} = ${formatNumber(v)}` }, { title: indep ? 'Independent: $P(A)P(B) = P(A \\cap B)$' : 'Not independent: $P(A)P(B) \\ne P(A \\cap B)$', math: `${a} \\cdot ${b} = ${formatNumber(a * b)}` }], [['P', nice(v)]]);
  }
  // ================= statistics =================
  if (/vidurk/.test(f) && /median/.test(f) && (m = s.match(/:\s*([\d\s,;.]+?)\./))) {
    const xs = m[1].split(/[,;]\s*/).map((q) => Number(q.trim())).filter((q) => !Number.isNaN(q));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length, so = [...xs].sort((a, b) => a - b);
    const med = so.length % 2 ? so[(so.length - 1) / 2] : (so[so.length / 2 - 1] + so[so.length / 2]) / 2;
    const freq = {}; xs.forEach((q) => { freq[q] = (freq[q] || 0) + 1; });
    const mx = Math.max(...Object.values(freq)), mode = Object.keys(freq).filter((k) => freq[k] === mx).map(Number);
    return out('Statistics', [{ title: 'Mean = sum / count', math: `\\frac{${xs.reduce((a, b) => a + b, 0)}}{${xs.length}} = ${formatNumber(mean, 4)}` }, { title: 'Median: the middle value after sorting', math: `${so.join(', ')} \\Rightarrow ${med}` }, { title: 'Mode: the most frequent value', math: mode.join(', ') }], [['mean', nice(mean)], ['median', med], ['mode', mode[0]]]);
  }
  if (/vidurk/.test(f) && /pridejus|pridejo/.test(f) && n.length >= 2) {
    const cnt = /penki/.test(f) ? 5 : /keturi/.test(f) ? 4 : /trij|trys/.test(f) ? 3 : /sesi/.test(f) ? 6 : n.length >= 3 ? n[0] : 5;
    const [m1, m2] = n.length >= 3 ? [n[1], n[2]] : n, v = (cnt + 1) * m2 - cnt * m1;
    return out('Mean', [{ title: 'New sum − old sum', math: `${cnt + 1} \\cdot ${m2} - ${cnt} \\cdot ${m1} = ${v}` }], [['number', v]]);
  }
  // ================= geometry =================
  if (/staci\S* trikamp/.test(f) && /statin/.test(f) && n.length >= 2) {
    const [a, b] = n, c = Math.hypot(a, b), S = (a * b) / 2, r = (a + b - c) / 2;
    return out('Right triangle', [{ title: 'Pythagoras', math: `c = \\sqrt{${a}^2 + ${b}^2} = ${formatNumber(c)}` }, { title: 'Area', math: `S = \\frac{${a} \\cdot ${b}}{2} = ${formatNumber(S)}` }, { title: 'Inscribed circle: $r = \\frac{a + b - c}{2}$', math: `r = ${formatNumber(r)}` }], [['c', nice(c)], ['S', nice(S)], ['r', nice(r)]]);
  }
  if (/trikamp/.test(f) && /krastines/.test(f) && /didziausi\S* .*kamp/.test(f) && n.length >= 3) {
    const [a, b, c] = [...n.slice(0, 3)].sort((x, y) => x - y), cosC = (a * a + b * b - c * c) / (2 * a * b), ang = (Math.acos(cosC) * 180) / Math.PI;
    return out('Cosine rule', [{ title: 'The largest angle is opposite the longest side', math: `\\cos\\gamma = \\frac{${a}^2 + ${b}^2 - ${c}^2}{2 \\cdot ${a} \\cdot ${b}} = ${formatNumber(cosC)} \\Rightarrow \\gamma = ${formatNumber(ang)}°` }], [['angle', nice(ang)]]);
  }
  if (/trikamp/.test(f) && /kampas tarp/.test(f) && /plot/.test(f) && n.length >= 3) {
    const [a, b, g] = n, S = 0.5 * a * b * Math.sin((g * Math.PI) / 180);
    return out('Triangle area', [{ title: '$S = \\frac{1}{2} ab \\sin\\gamma$', math: `\\frac{1}{2} \\cdot ${a} \\cdot ${b} \\cdot \\sin ${g}° = ${formatNumber(S)}` }], [['S', nice(S)]]);
  }
  if (/ritin/.test(f) && /aukstin/.test(f) && /spindul/.test(f) && n.length >= 2) {
    const h = n[0], r = n[1];
    return out('Cylinder', [{ title: '$V = \\pi r^2 h$', math: `\\pi \\cdot ${r}^2 \\cdot ${h} = ${r * r * h}\\pi` }, { title: 'Total surface $S = 2\\pi r^2 + 2\\pi r h$', math: `${2 * r * r + 2 * r * h}\\pi` }], [['V', r * r * h * Math.PI], ['S', (2 * r * r + 2 * r * h) * Math.PI]]);
  }
  if (/rutul/.test(f) && /pavirsiaus plot/.test(f) && /tur/.test(f) && n.length) {
    const Sx = n[0], r = Math.sqrt(Sx / 4), V = (4 / 3) * r ** 3;
    return out('Sphere', [{ title: '$S = 4\\pi r^2$', math: `4\\pi r^2 = ${Sx}\\pi \\Rightarrow r = ${formatNumber(r)}` }, { title: '$V = \\frac{4}{3}\\pi r^3$', math: `${formatNumber(V)}\\pi` }], [['V', V * Math.PI]]);
  }
  if (/vektor/.test(f) && /statmen/.test(f)) {
    const vs = [...s.matchAll(/\(\s*([^()]+?)\s*\)/g)].map((q) => q[1].split(';').map((t) => t.trim().replace(/−/g, '-')));
    if (vs.length >= 2 && vs[0].length === vs[1].length) {
      const dot = vs[0].map((x, i) => `(${x})*(${vs[1][i]})`).join(' + ');
      const k = (s.match(/(?:su kuria|kokia)\s+([a-z])\b/i) || [])[1] || 'k';
      const r = solveEquation(N(dot), N(0), k, []);
      const sols = (r.solutions || []).map((q) => evalNum(q));
      if (sols.length) return out('Perpendicular vectors', [{ title: 'Perpendicular: the dot product is 0', math: `${tex(N(dot))} = 0 \\Rightarrow ${k} = ${fmt(nice(sols[0]))}` }], [[k, nice(sols[0])]]);
    }
  }
  // ================= optimisation =================
  if (/tvor/.test(f) && /upe/.test(f) && /didziausi/.test(f) && n.length) {
    const L = n[0], x = L / 4;
    return out('Largest area', [{ title: 'Two sides $x$ and one side $L - 2x$: $S(x) = x(L - 2x)$', math: `S'(x) = ${L} - 4x = 0 \\Rightarrow x = ${formatNumber(x)}` }, { title: 'Sides and area', math: `${formatNumber(x)} \\times ${formatNumber(L - 2 * x)},\\ S = ${formatNumber(x * (L - 2 * x))}` }], [['x', nice(x)], ['y', nice(L - 2 * x)], ['S', nice(x * (L - 2 * x))]]);
  }
  if (/dezut/.test(f) && /ispjau/.test(f) && n.length) {
    const a = n[0], x = a / 6, V = x * (a - 2 * x) ** 2;
    return out('Largest volume', [{ title: '$V(x) = x(a - 2x)^2$', math: `V'(x) = (a - 2x)(a - 6x) = 0 \\Rightarrow x = \\frac{a}{6} = ${formatNumber(x)}` }, { title: 'Volume', math: `V = ${formatNumber(V)}` }], [['x', nice(x)], ['V', nice(V)]]);
  }
  return null;
}
export { val, fmt, show };
