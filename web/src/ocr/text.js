// Clean up what the printed-text reader returns for a word problem.

// common words of school word problems: a misread one (one or two letters off) is put right
const VOCAB = new Set(`
tikimybė tikimybę tikimybės lyginis lyginį lyginių nelyginis nelyginį nelyginių greitis greitį greičiu greičio greičiai vidutinis vidutinį vidutiniu
trikampis trikampio trikampį trikampyje stačiojo stačiasis statinis statinį statiniai įžambinė įžambinę įžambinės spindulys spindulį spindulio skersmuo skersmenį
skritulys skritulio skritulį apskritimas apskritimo apskritimą perimetras perimetrą perimetro plotas plotą ploto procentais procentų procentus procentas
sumažinta sumažėjo sumažinus padidinta padidėjo padidinus koncentracija koncentraciją koncentracijos tirpalas tirpalo tirpalą rūgšties druskos vandens
palūkanos palūkanų sudėtinės metinės progresija progresijos progresijoje aritmetinės geometrinės skirtumas skirtumą vardiklis vardiklį narys narį nariai narių
pirmasis pirmųjų pirmoje pirmojoje antrasis antroje trečiasis trečioje paskutinėje pripildo pripildytų pripildys pripildytas ištuština vamzdis vamzdžiai vamzdžius vamzdžių baseiną baseinas baseino
valandų valandas valandos valandą minučių minutes minutės sekundžių kilometrų kilometrus atstumas atstumą nuvažiavo nuvažiuoja nuėjo nubėgo plaukia
traukinys traukinio automobilis automobilio dviratininkas pėsčiasis kauliukas kauliukai kauliuką lošimo atsivers atsiverčia metamas metami kortų kortos
rutuliukai rutuliukų rutuliukas baltų juodų raudonų mėlynų žalių geltonų ištraukiamas ištraukti atsitiktinai skaičius skaičių skaičiaus skaičiai
skaičiuokite vidurkis vidurkį mediana medianą moda modą dėžėje maišelyje kaina kainą kainos nuolaida nuolaidą pabrango atpigo brangesnis pigesnis
duoti duota duotas duotos duotieji raskite apskaičiuokite nustatykite išspręskite kvadratas kvadrato kvadratą stačiakampis stačiakampio stačiakampį kraštinė kraštinės kraštinę kraštinių
ilgis ilgį ilgio plotis plotį pločio aukštinė aukštinę aukštis aukštį tūris tūrį kubas kubo ritinys ritinio kūgis kūgio rutulys rutulio pasroviui
srovę srovės tėkmės darbininkai darbininkų darbą atlieka atliktų dirbdami kartu kiekvienoje kiekvienas kiekviena eilėje eilėse vietų vietos mokinių
mokiniai klasėje berniukų mergaičių uždirba atlyginimas mokesčių sveikųjų nuoseklių santykiu santykis lygiomis dalimis
probability rolling triangle rectangle perimeter consecutive integers average speed distance percent increased decreased discount interest
together hours minutes kilometres kilometers marbles random arranged numbers difference circle radius diameter length width height
`.split(/\s+/).filter(Boolean));

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
// letters the reader typically mixes up ("tnkampio" = "trikampio", "ukimybė" = "tikimybė")
const LOOKALIKE = [['n', 'ri'], ['u', 'ti'], ['m', 'rn'], ['h', 'li'], ['d', 'cl'], ['b', 'ti'], ['rn', 'm'], ['ri', 'n'], ['l', 'i'], ['i', 'l'], ['t', 'f'], ['f', 't'], ['c', 'e'], ['e', 'c']];
const keepCase = (w, v) => (w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase() ? v[0].toUpperCase() + v.slice(1) : v);
function fixWord(w) {
  const lo = w.toLowerCase();
  if (lo.length < 4 || VOCAB.has(lo) || /\d/.test(lo)) return w;
  for (const [a, b] of LOOKALIKE) for (let i = lo.indexOf(a); i >= 0; i = lo.indexOf(a, i + 1)) {
    const v = lo.slice(0, i) + b + lo.slice(i + a.length);
    if (VOCAB.has(v)) return keepCase(w, v);
  }
  if (lo.length < 6) return w;
  const max = lo.length >= 9 ? 2 : 1;
  let best = null, bd = max + 1, tie = false;
  for (const v of VOCAB) {
    if (lo.startsWith('ne') !== v.startsWith('ne')) continue; // never turn "nelyginis" into "lyginis"
    const d = lev(lo, v, max);
    if (d < bd) { bd = d; best = v; tie = false; } else if (d === bd) tie = true;
  }
  if (!best || bd > max || tie) return w;
  return keepCase(w, best);
}

const PERCENT_CONTEXT = /procent|sumažint|sumažėj|padidint|padidėj|pabrang|atpig|palūkan|nuolaid|koncentr|tirpal|mokes|percent|increase|decrease|discount|interest|%/i;
const A_WORDS = /^(and|are|area|after|all|also|an|another|at|average|any|as|ago|age|amount|angle|answer|about|above|again|along|among)$/i;

export function cleanOcrText(t) {
  let s = String(t || '')
    .replace(/(\p{L})[-‐‑]\s*\n\s*(\p{Ll})/gu, '$1$2') // word split over two lines
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/(?<=\p{L})\|(?=\p{L})/gu, 'l')
    .replace(/(?<=\d)[oO](?=\d)/g, '0')
    .replace(/\b\d+(?:\. ?\d+){2,}\b/g, (m) => m.split(/\. ?/).join(', ')) // a list "3. 7. 7.2.11" -> "3, 7, 7, 2, 11"
    .replace(/(?<=\d )\](?= \p{L})/gu, 'l') // "1 ] vandens" -> "1 l vandens"
    .replace(/\bkm ?[/l1|] ?h\b|\bkm\/n\b|\bkmih\b|\bkmlh\b/g, 'km/h').replace(/\bm[l1|]s\b/g, 'm/s')
    .replace(/\b(\d{1,2})96(?= (?:of|nuo) \d)/g, '$1 %'); // "3096 of 70" -> "30 % of 70"
  if (PERCENT_CONTEXT.test(s)) {
    // the % sign is often read as 96, 9b, 0/0, 9 or 90
    s = s.replace(/(\d) ?(?:96|9b|0\/0|°\/o)(?=[\s.,;:!?)]|$)/g, '$1 %')
      .replace(/(\d) (?:9|90)(?=[.,;:!?)]|$)/g, '$1 %')
      .replace(/(\d) 9 %/g, '$1 %');
  }
  s = s.replace(/(\d) ?€/g, '$1 €').replace(/(\d) ?%/g, '$1 %')
    .replace(/^\s*\d{1,2}\s*[.)]\s+(?=\p{Lu})/u, '') // "3. Kostiumo ..." -> drop the task number
    .replace(/(?<=[\p{Ll},] )I(?=\p{Ll})/gu, 'i'); // "narį Ir" -> "narį ir"
  if (/\b(the|is|of|what|how|find)\b/i.test(s)) s = s.replace(/(^|[.?!] )A([a-z]{3,})/g, (m, p, w) => (A_WORDS.test('a' + w) ? m : `${p}A ${w}`)); // "Aprice" -> "A price"
  s = s.replace(/[\p{L}]+/gu, fixWord);
  return s.replace(/\s{2,}/g, ' ').trim();
}

// a word-likeness score, to pick the better of two readings
export function textScore(t) {
  const ws = String(t).split(/\s+/).filter(Boolean);
  return ws.filter((w) => /^[\p{L}]{2,}[.,;:!?]?$/u.test(w) || /^\d+([.,]\d+)?[.,;:!?%€]?$/u.test(w)).length - 0.5 * ws.filter((w) => /[^\p{L}\d.,;:!?%€()\-–+=/·×÷"'²³]/u.test(w)).length;
}
