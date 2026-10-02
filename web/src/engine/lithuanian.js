// Lithuanian exam wording (VBE / PUPP) -> the commands the solver understands.
// "Išspręskite lygtį log_2(2x - 6) = log_2 8."  ->  "log_2(2x - 6) = log_2 8"
// "Raskite funkcijos f(x) = 10x - 2x^2 išvestinę."  ->  "d/dx 10x - 2x^2"
// Returns null when the text is not Lithuanian.

const LT_LETTERS = /[ąčęėįšųūž]/i;
const LT_WORDS = /\b(išspręskite|isspreskite|apskaičiuokite|apskaiciuokite|suprastinkite|raskite|nustatykite|parašykite|panaikinkite|duotos?|lygtį|lygtis|nelygybę|nelygybes|reiškinio|reiškinį|funkcijos|išvestinę|kai|ir|jei|jeigu|tai|reikšmę|aibių)\b/i;
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); // išvestinę -> isvestine

export function isLithuanian(s) { return LT_LETTERS.test(s) || LT_WORDS.test(s); }

// Plain-text clean-up used for every Lithuanian problem
function clean(s) {
  return s
    .replace(/(\d),(\d)/g, '$1.$2')            // 0,2 -> 0.2 (decimal comma)
    .replace(/[·∙⋅]/g, '*')
    .replace(/−|–/g, '-')
    .replace(/\btg\b/g, 'tan').replace(/\bctg\b/g, 'cot')
    .replace(/\barcctg\b/g, 'acot').replace(/\barctg\b/g, 'atan')
    .replace(/α/g, 'a').replace(/β/g, 'b')
    .replace(/([\w)\]}])\s+:\s+(?=[\w(√-])/g, '$1 / ')                       // m^2 : m  (":" means divide)
    .replace(/\(\s*[a-z]\s*[<>≠≤≥][^()]*\)/g, '')                             // conditions such as (a > 0, a ≠ 1)
    .replace(/\s+/g, ' ').trim();
}

// the longest run of "math-looking" words: numbers, operators, single letters, function names, brackets
const FN = /^(sin|cos|tan|cot|asin|acos|atan|arcsin|arccos|arctan|log|lg|ln|sqrt|root|abs|pi|nCr|nPr|e)(?=$|[_(^\d])/;
function isMathToken(w) {
  if (!w) return false;
  const c = w.replace(/^[([{]+|[)\]},.;:?!]+$/g, '');
  if (!c) return /[()[\]{}]/.test(w);
  if (/^[a-zA-Z]$/.test(c)) return true;                                   // x, a, m
  if (/^[-+*/^=<>≤≥≠|√π°∞!∈∪∩\\]+$/.test(c)) return true;                // operators
  if (FN.test(c)) return true;                                              // log_2(2x, sqrt(5)
  if (/[ąčęėįšųūž]/i.test(c)) return false;                                // Lithuanian words
  if (/\d/.test(c)) return true;                                           // 2x, 10^100, 36π^2
  if (/^[a-zA-Z]{1,2}[_^(]/.test(c)) return true;                           // x^2, f(x)
  if (/[=<>^|√()]/.test(c)) return true;
  return /^(xy|ab|abc|mn|xyz)$/.test(c);                                    // products such as xy
}
export function mathRun(s) {
  const words = s.split(' ');
  let best = [0, 0], bestScore = 0, i = 0;
  while (i < words.length) {
    if (!isMathToken(words[i])) { i++; continue; }
    let j = i;
    while (j < words.length && isMathToken(words[j])) j++;
    const run = words.slice(i, j).join(' ');
    // prefer runs with an equation / relation, then longer ones
    const score = run.replace(/[^\d=<>^+\-*/()|a-z]/gi, '').length + (/[=<>≤≥]/.test(run) && !/∈/.test(run) ? 100 : 0);
    if (score > bestScore) { best = [i, j]; bestScore = score; }
    i = j;
  }
  let out = words.slice(best[0], best[1]).join(' ');
  out = out.replace(/^[,.;:]+|[,.;:?!]+$/g, '').replace(/\s*=\s*\??$/, '').trim();   // sentence punctuation, a trailing "="
  const opens = (out.match(/\(/g) || []).length, closes = (out.match(/\)/g) || []).length;
  if (closes > opens && out.endsWith(')')) out = out.slice(0, -1).trim();
  if (opens > closes && out.startsWith('(')) out = out.slice(1).trim();
  if (/^\(.*=.*\)$/.test(out)) { let d = 0, wraps = true; for (let i = 0; i < out.length - 1; i++) { d += out[i] === '(' ? 1 : out[i] === ')' ? -1 : 0; if (d === 0) { wraps = false; break; } } if (wraps) out = out.slice(1, -1).trim(); }
  out = out.replace(/^(?:[a-zA-Z]\([a-z]\)|y)\s*=\s*/, (m) => m);  // keep f(x) = for the caller
  return out;
}
// the formula after "f(x) =" (or after "y =")
const body = (m) => m.replace(/^\s*(?:[a-zA-Z]\s*\(\s*[a-zα-ω]\s*\)|y)\s*=\s*/, '');

export function fromLithuanian(raw) {
  if (!isLithuanian(raw)) return null;
  const s = clean(raw), f = fold(s);
  const after = s.match(/\btai\s+(.+)$/);           // "Kai x ≠ 3, tai <expression> ="
  const M = mathRun(after ? after[1] : s);
  let m;
  const num0 = (re) => { const q = s.match(re); return q ? q[1] : null; };
  // ---- a function defined in the text: "f(x) = 10x - 2x^2", "V(α) = 72π·sin^2(α)·cos(α)"
  const def = s.match(/\b[A-Za-z]\s*\(\s*([a-z])\s*\)\s*=\s*(.+?)(?=\s+(?:yra|bus|grafik\S*|išvestin\S*|isvestin\S*|apibrėž\S*|apibrez\S*|reikšm\S*|reiksm\S*|pirmykšt\S*|būtų|butu|turi|turėtų|lygus|lygi|kai|ir|kurios|kurio)(?=[\s,.;]|$)|[;?]|\.\s|\.$|$)/);
  const defBody = def ? def[2].trim().replace(/[,.]$/, '') : null, defVar = def ? def[1] : null;
  // ---- the sum of the first N terms of a listed sequence: "per pirmus 8 ... (12, 15, 18, ...)"
  if ((m = s.match(/(-?[\d.]+)\s*[,;]\s*(-?[\d.]+)\s*[,;]\s*(-?[\d.]+)\s*[,;]\s*(?:\.\.\.|…)/)) && /per\s+pirm\S*\s+(\d+)/i.test(s)) {
    const N = num0(/per\s+pirm\S*\s+(\d+)/i), d = Number(m[2]) - Number(m[1]);
    if (Number(m[3]) - Number(m[2]) === d) return `sum k=1 to ${N} of (${m[1]} + (k-1)*${d})`;
    return `sum k=1 to ${N} of (${m[1]} * ${Number(m[2]) / Number(m[1])}^(k-1))`;
  }
  // ---- probability distribution: P(X = 1) = 1/a, ... -> the probabilities add up to 1
  if (/skirstin/.test(f)) {
    const ps = [...s.matchAll(/P\s*\([^)]*\)\s*=\s*([^,;]+?)(?=[,;]|\.\s|\.$|$)/g)].map((q) => `(${q[1].trim()})`);
    if (ps.length >= 2) return `${ps.join(' + ')} = 1`;
  }
  // ---- "kiekvienas su kiekvienu ... po vieną partiją": every pair once
  if (/kiekvienas su kiekvienu/.test(f)) { const N = num0(/(\d+)\s+\S*(?:ninkai|ninkų|dalyvi|mokini|žaidėj|komand)/i) || num0(/(\d+)/); if (N) return `nCr(${N}, 2)`; }
  // ---- arithmetic progression in words: 12 eurų, kiekvieną kitą ... 3 eurais daugiau
  if (/kiekvien\w* kit\w*/.test(f) && /daugiau|maziau/.test(f)) {
    const a1 = num0(/(\d+(?:\.\d+)?)/), d = num0(/(\d+(?:\.\d+)?)\s*\S*\s+(?:daugiau|mažiau|maziau)/i);
    const sign = /maziau/.test(f) ? '-' : '+';
    const nth = num0(/(\d+)\s*-\s*(?:ąjį|ąją|ąsias|uosius|ojo|osios|ą|a|tą)(?=[\s,.;?]|$)/i), sumN = num0(/per\s+pirm\S*\s+(\d+)/i);
    if (a1 && d && sumN) return `sum k=1 to ${sumN} of (${a1} ${sign} (k-1)*${d})`;
    if (a1 && d && nth) return `${a1} ${sign} (${nth}-1)*${d}`;
  }
  // ---- how much it decreased / increased during the first N days: f(0) - f(N)
  if (/sumazejo|padidejo|sumaz|padidej/.test(f) && /per\s+(?:pirm\S*\s+)?\d+/i.test(s)) {
    const N = num0(/per\s+(?:pirm\S*\s+)?(\d+)/i);
    const fm = s.match(/\b([a-zA-Z])\s*=\s*([^;]+?)(?:;|\s+čia|\s+cia|\.\s|$)/);
    const tv = (s.match(/;\s*čia\s+([a-z])\b/i) || s.match(/\b(t)\b/) || [])[1] || 't';
    if (N && fm) { const at = (k) => `(${fm[2].replace(new RegExp(`\\b${tv}\\b`, 'g'), `(${k})`)})`; return /sumaz/.test(f) ? `${at(0)} - ${at(N)}` : `${at(N)} - ${at(0)}`; }
  }
  // ---- instantaneous speed = derivative of the distance: s(t) = 5t^2 + 40t ... (t = 2)
  if (/momentin/.test(f)) {
    const fm = s.match(/[a-zA-Z]\(\s*([a-z])\s*\)\s*=\s*([^.;]+?)(?:\.|;|$)/), at = s.match(/\(\s*([a-z])\s*=\s*([-\d.]+)\s*\)/) || s.match(/po\s+(\d+(?:\.\d+)?)/i);
    if (fm && at) return `derivative of ${fm[2]} at ${fm[1]} = ${at[2] ?? at[1]}`;
  }
  // ---- solid of revolution about the x-axis: V = π ∫ y² dx
  if (/sukin/.test(f) && /absciesi|abscisi|ox/.test(f)) {
    const y = (s.match(/y\s*=\s*([^,]+?)(?:,|\s+tiese|\s+tiesėmis|\s+ir\s)/i) || [])[1];
    const xs = [...s.matchAll(/x\s*=\s*(-?[\d.]+)/g)].map((q) => q[1]);
    if (y) return xs.length >= 2 ? `integrate from ${xs[0]} to ${xs[1]} of pi*(${y})^2` : xs.length === 1 ? `volume of revolution of ${y} up to x = ${xs[0]}` : null;
  }
  // ---- tangent that makes a given angle with the x-axis: f'(x) = tan(angle)
  if (/liestin/.test(f) && /kamp/.test(f) && /(\d+)\s*°/.test(s)) {
    const fx = (s.match(/[a-zA-Z]\(x\)\s*=\s*(.+?)\s+(?:grafik|grafiko|kreiv)/i) || [])[1];
    if (fx) return `slope of ${fx} = tan(${s.match(/(\d+)\s*°/)[1]}°)`;
  }
  // ---- given ... find: "Yra žinoma, kad a = 2^m. Nustatykite, kam lygu log_2(1/a)." / "Apskaičiuokite xy, jei 2^x = 3 ir 3^y = 16."
  if ((m = s.match(/(?:yra žinoma|yra zinoma|žinoma|zinoma),?\s*kad\s+(.+?)\.\s*(?:apskaičiuokite|apskaiciuokite|nustatykite|raskite)[^,]*?(?:,\s*kam\s+lygu)?\s+(.+?)\.?$/i))) return `${mathRun(m[2].replace(/^kam\s+lygu\s+/i, ''))} given ${m[1].split(/\s+ir\s+/).map(mathRun).join('; ')}`;
  if ((m = s.match(/(?:apskaičiuokite|apskaiciuokite|raskite|nustatykite)\s+(.+?),?\s+(?:jei|jeigu|kai)\s+(.+?)\.?$/i)) && /=/.test(m[2]) && !/=/.test(m[1])) return `${mathRun(m[1])} given ${m[2].split(/\s+ir\s+|;\s*/).map(mathRun).join('; ')}`;
  // ---- interval condition: "kai x ∈ (90°; 270°)", "x ∈ [0; 2π]"
  let interval = '';
  if ((m = s.match(/(?:kai|kur|,|;)?\s*([a-z])\s*∈\s*([([])\s*([^;]+?)\s*;\s*([^)\]]+?)\s*([)\]])/i))) interval = ` on ${m[2]}${m[3]}, ${m[4]}${m[5]}`;
  const withoutInterval = (t) => t.replace(/(?:,|;)?\s*(?:kai\s+)?[a-z]\s*∈\s*[([][^)\]]*[)\]]/i, '').replace(/[,;]\s*$/, '').trim();
  const core = withoutInterval(M);
  // ---- sets: "A = {1; 4; 9} ir B = {9; 16}. Raskite šių aibių sankirtą A ∩ B."
  if (/aibi/.test(f)) {
    const sets = [...s.matchAll(/([A-Z])\s*=\s*(\{[^}]*\})/g)];
    const op = /sankirt/.test(f) ? '∩' : /sajung|sąjung/.test(f) ? '∪' : /skirtum/.test(f) ? '\\' : null;
    if (sets.length >= 2 && op) {
      const opm = s.match(/([A-Z])\s*(?:∩|∪|\\)\s*([A-Z])/);
      const [L, R] = opm ? [opm[1], opm[2]] : [sets[0][1], sets[1][1]];
      const get = (k) => (sets.find((x) => x[1] === k) || sets[0])[2];
      return `${get(L)} ${op} ${get(R)}`;
    }
  }
  // ---- derivatives
  if (/isvestin/.test(f)) {
    const at = s.match(/(?:taske|taške|kai)\s*([a-z])\s*=\s*([-\w./π]+)/i) || s.match(/\b([a-z])0?\s*=\s*([-\d./π]+)\s*$/i);
    const fx = defBody || body(core.split(/\s(?:ir|kai)\s/)[0]);
    if (at) return `derivative of ${body(withoutInterval(fx.replace(/\s*(?:taške|taske).*$/i, '')))} at ${at[1]} = ${at[2]}`;
    return `d/d${defVar || 'x'} ${fx}`;
  }
  // ---- antiderivative: "pirmykštę funkciją ... taškas (0; 1)"
  if (/pirmykst/.test(f)) {
    const pt = s.match(/task\w*\s*\(\s*([-\d.]+)\s*;\s*([-\d.]+)\s*\)|taš\w*\s*\(\s*([-\d.]+)\s*;\s*([-\d.]+)\s*\)/i);
    const fx = body(s.match(/=\s*(.+?)\s+pirmyk/i)?.[1] || core);
    return pt ? `antiderivative of ${fx} through (${pt[1] ?? pt[3]}, ${pt[2] ?? pt[4]})` : `integrate ${fx} dx`;
  }
  if (/integral/.test(f)) {
    const lim = s.match(/nuo\s+([-\w./π]+)\s+iki\s+([-\w./π]+)/i);
    return lim ? `integrate from ${lim[1]} to ${lim[2]} of ${body(core)}` : `integrate ${body(core)} dx`;
  }
  if (/\bribq\b|\bribą\b|\briba\b|\bribos\b|\bribq/.test(f) || /\bribq|ribą/.test(s)) {
    const to = s.match(/([a-z])\s*(?:->|→)\s*([-\w∞./]+)/i);
    if (to) return `lim ${to[1]}->${to[2].replace('∞', 'oo')} ${body(core.replace(/^.*?(?:->|→)\s*\S+\s*/, ''))}`;
  }
  // ---- domain / range
  if (/apibrezimo sri/.test(f)) return `domain of ${defBody || body(core)}`;
  if (/reiksmiu sri/.test(f)) return `range of ${defBody || body(core)}`;
  // ---- rationalise: "Panaikinkite iracionalumą trupmenos 3/(sqrt(5) + 1) vardiklyje."
  if (/iracionalum/.test(f)) return `rationalize ${core}`;
  // ---- curve and line y = c meet at A; the tangent to the curve at A
  if (/liestin/.test(f) && /susikert/.test(f)) {
    const curve = (s.match(/y\s*=\s*([^=]*?x[^=]*?)(?=\s+(?:ir|yra|susikerta)(?=[\s,.;]|$)|[,.;]\s|$)/) || [])[1];
    const level = (s.match(/y\s*=\s*(-?[\d.]+)(?=\s|[,.;]|$)/) || [])[1];
    if (curve && level) return `tangent line to ${curve} where it equals ${level}`;
  }
  // ---- tangent line: "liestinės lygtį taške x0 = 2"
  if (/liestin/.test(f)) {
    const at = s.match(/(?:taške|taske|kai)\s*([a-z])0?\s*=\s*([-\w./π]+)/i);
    if (at) return `tangent line to ${body(core.split(/\s(?:ir|kai)\s/)[0].replace(/\s*(?:taške|taske).*$/i, ''))} at ${at[1]} = ${at[2]}`;
  }
  // ---- largest / smallest value (on an interval)
  if (/didziausi|maziausi|ekstrem/.test(f)) {
    const fx = defBody || body(withoutInterval(core));
    if (/ekstrem/.test(f)) return `extrema of ${fx}`;
    return `${/didziausi/.test(f) ? 'maximum' : 'minimum'} of ${fx}${interval}`;
  }
  // ---- equations / inequalities / systems
  if (/issprsk|isspresk|lygt|nelygyb|sistem/.test(f)) {
    if (interval && /=/.test(core)) return `${core}${interval}`;
    return core;
  }
  // ---- simplify / calculate
  if (/suprastink/.test(f)) return `simplify ${core}`;
  if (/apskaiciuok|raskite|nustatykite|kam lygu|lygus|lygi/.test(f) && core) {
    if (interval && /=/.test(core)) return `${core}${interval}`;
    if (!/=/.test(core) && /(^|[^a-z])[a-df-z](?![a-z(])/i.test(core.replace(/\b(sin|cos|tan|cot|log|lg|ln|sqrt|root|abs|pi|nCr|nPr|asin|acos|atan)\b/g, ''))) return `simplify ${core}`;
    return core;
  }
  return core || null;
}
