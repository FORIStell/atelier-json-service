// 100 VBE-style problems (Kasparas Grigaliūnas, 2026-10-02), typed exactly as given, with the answers from the document.
// node vbe100.mjs [--fails]
import { solveProblem } from '../web/src/engine/index.js';
import { check, val } from './bench_check.mjs';

const PTS = [0.7, 1.3, 2.1];
const IPTS = [-5, -3.5, -2, -1, -0.5, 0, 0.5, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 6];
const pi = Math.PI, r = Math.sqrt;
const EX = (f) => PTS.map(f);
const IN = (f) => IPTS.map(f);
// [no, part, text, kind, expected]
const P = [
  [1, 'I', 'Apskaičiuokite: (2¹⁰ · 4⁻³) : 8⁻¹.', 'nums', [128]],
  [2, 'I', 'Apskaičiuokite: log₂ 48 − log₂ 3 + log₃ 27.', 'nums', [7]],
  [3, 'I', 'Apskaičiuokite: √50 − √18 + √8.', 'nums', [4 * r(2)]],
  [4, 'I', 'Apskaičiuokite: 27^(2/3) + 16^(−1/4) − (1/32)^(−0,2).', 'nums', [7.5]],
  [5, 'I', 'Suprastinkite: (a² − 9)/(a² + 6a + 9) : (a − 3)/(2a + 6).', 'expr', [2, 2, 2], 'a'],
  [6, 'I', 'Apskaičiuokite: (√7 − √3)(√7 + √3) + (√5 − 1)².', 'nums', [10 - 2 * r(5)]],
  [7, 'I', 'Apskaičiuokite: lg 25 + lg 40 − 2^(log₂ 5).', 'nums', [-2]],
  [8, 'I', 'Apskaičiuokite: sin 210° + cos 300° + tg 225°.', 'nums', [1]],
  [9, 'I', 'Panaikinkite iracionalumą vardiklyje: 6/(√5 − √2).', 'nums', [2 * r(5) + 2 * r(2)]],
  [10, 'I', 'Apskaičiuokite: log₃ 5 · log₅ 81.', 'nums', [4]],
  [11, 'I', 'Suprastinkite: (√x + √y)(√x − √y)/(x − y).', 'nums', [1]],
  [12, 'I', 'Paverskite paprastosiomis trupmenomis ir sudėkite: 0,(36) + 0,(63).', 'nums', [1]],
  [13, 'I', 'Skaičius a yra 25 % didesnis už b. Keliais procentais b mažesnis už a?', 'nums', [20]],
  [14, 'I', 'Apskaičiuokite: (3/4)⁻² · (2/3)⁻³.', 'nums', [6]],
  [15, 'I', 'Apskaičiuokite: cos² 15° − sin² 15°.', 'nums', [r(3) / 2]],
  [16, 'I', 'Apskaičiuokite: sin 75° + sin 15°.', 'nums', [r(6) / 2]],
  [17, 'I', 'Apskaičiuokite: ∛(−54) + ∛16.', 'nums', [-Math.cbrt(2)]],
  [18, 'I', 'Žinoma, kad logₐ b = 3. Apskaičiuokite logₐ(a²b⁴).', 'nums', [14]],
  [19, 'I', 'Žinoma, kad tg α = 2. Apskaičiuokite (sin α + cos α)/(sin α − cos α).', 'nums', [3]],
  [20, 'I', 'sin α = 3/5, kai α ∈ (90°; 180°). Raskite cos α ir tg α.', 'nums', [-0.8, -0.75]],
  [21, 'I', 'Išskaidykite dauginamaisiais: x³ − 4x² − 9x + 36.', 'expr', EX((x) => (x - 4) * (x - 3) * (x + 3))],
  [22, 'I', 'Apskaičiuokite: |2 − √5| + |√5 − 3|.', 'nums', [1]],
  [23, 'I', 'Apskaičiuokite sandaugą: (1 + 1/2)(1 + 1/3)(1 + 1/4)…(1 + 1/99).', 'nums', [50]],
  [24, 'I', 'Apskaičiuokite sumą: 1/(1·2) + 1/(2·3) + … + 1/(49·50).', 'nums', [49 / 50]],
  [25, 'I', 'Kiek skaitmenų turi skaičius 2²⁰ · 5¹⁷?', 'nums', [18]],
  [26, 'II', 'Išspręskite lygtį: 3^(2x) − 10·3^x + 9 = 0.', 'set', [0, 2]],
  [27, 'II', 'Išspręskite lygtį: log₂(x − 1) + log₂(x + 1) = 3.', 'set', [3]],
  [28, 'II', 'Išspręskite lygtį: √(x + 7) = x − 5.', 'set', [9]],
  [29, 'II', 'Išspręskite nelygybę: x·3^x − 9x − 3^x + 9 ≤ 0.', 'ineq', IN((x) => x >= 1 && x <= 2)],
  [30, 'II', 'Išspręskite nelygybę: (x − 1)(x + 4)/(x − 3) ≥ 0.', 'ineq', IN((x) => (x >= -4 && x <= 1) || x > 3)],
  [31, 'II', 'Išspręskite lygtį 2cos²x − cos x − 1 = 0, kai x ∈ [0; 2π].', 'nums', [0, 2 * pi / 3, 4 * pi / 3, 2 * pi]],
  [32, 'II', 'Išspręskite lygtį: sin 2x = cos x.', 'trig', [pi / 6, pi / 2, 5 * pi / 6, 3 * pi / 2]],
  [33, 'II', 'Išspręskite nelygybę: (1/2)^(x² − 4) > 1.', 'ineq', IN((x) => x > -2 && x < 2)],
  [34, 'II', 'Išspręskite nelygybę: log₀,₅(2x − 3) > −1.', 'ineq', IN((x) => x > 1.5 && x < 2.5)],
  [35, 'II', 'Išspręskite sistemą: x + y = 7, xy = 12.', 'nums', [3, 4]],
  [36, 'II', 'Išspręskite sistemą: x² + y² = 25, x − y = 1.', 'nums', [4, 3, -3, -4]],
  [37, 'II', 'Su kuriomis parametro a reikšmėmis lygtis x² − 2ax + 9 = 0 turi du skirtingus realiuosius sprendinius?', 'ineqa', IN((a) => Math.abs(a) > 3)],
  [38, 'II', 'Išspręskite lygtį: |2x − 3| = x + 3.', 'set', [0, 6]],
  [39, 'II', 'Išspręskite lygtį: 4^x − 2^(x+1) = 8.', 'set', [2]],
  [40, 'II', 'Išspręskite lygtį: lg²x − 3 lg x + 2 = 0.', 'set', [10, 100]],
  [41, 'II', 'Išspręskite lygtį: |x − 1| + |x + 2| = 5.', 'set', [-3, 2]],
  [42, 'II', 'Išspręskite lygtį: x⁴ − 13x² + 36 = 0.', 'set', [-3, -2, 2, 3]],
  [43, 'II', 'Išspręskite lygtį: 2^x · 5^x = 0,001.', 'set', [-3]],
  [44, 'II', 'Išspręskite nelygybę: (x + 2)/(x − 1) ≤ 2.', 'ineq', IN((x) => x < 1 || x >= 4)],
  [45, 'II', 'Su kuriomis k reikšmėmis tiesė y = kx + 2 liečia parabolę y = x² + 3?', 'nums', [-2, 2]],
  [46, 'III', 'Raskite funkcijos f(x) = x³ − 3x² + 4 ekstremumo taškus ir ekstremumus.', 'extrema', [[0, 4, 'max'], [2, 0, 'min']]],
  [47, 'III', 'Raskite funkcijos f(x) = (2x − 1)⁵ išvestinę.', 'expr', EX((x) => 10 * (2 * x - 1) ** 4)],
  [48, 'III', 'Apskaičiuokite f′(1), kai f(x) = x²·ln x.', 'nums', [1]],
  [49, 'III', 'Parašykite funkcijos f(x) = x² − 4x + 1 grafiko liestinės lygtį taške x₀ = 3.', 'expr', EX((x) => 2 * x - 8)],
  [50, 'III', 'Raskite didžiausią ir mažiausią funkcijos f(x) = x³ − 12x reikšmę intervale [−3; 3].', 'nums', [16, -16]],
  [51, 'III', 'Raskite funkcijos f(x) = √(6 − x − x²) apibrėžimo sritį.', 'ineq', IN((x) => x >= -3 && x <= 2)],
  [52, 'III', 'Raskite funkcijos f(x) = e^(2x)·sin x išvestinę.', 'expr', EX((x) => Math.exp(2 * x) * (2 * Math.sin(x) + Math.cos(x)))],
  [53, 'III', 'Apskaičiuokite ∫₀² (3x² − 2x + 1) dx.', 'nums', [6]],
  [54, 'III', 'Apskaičiuokite figūros, apribotos kreivėmis y = x² ir y = 2x, plotą.', 'nums', [4 / 3]],
  [55, 'III', 'Raskite funkcijos f(x) = 3x² − 4/x³ pirmykštę funkciją F, kurios grafikas eina per tašką (1; 5).', 'expr', EX((x) => x ** 3 + 2 / x ** 2 + 2)],
  [56, 'III', 'Kuriuose intervaluose funkcija f(x) = x⁴ − 8x² didėja?', 'ineq', IN((x) => (x >= -2 && x <= 0) || x >= 2)],
  [57, 'III', 'Raskite funkcijai f(x) = 2^x + 1 atvirkštinę funkciją.', 'expr', [0.7, 1.3, 2.1].map((x) => (x > 1 ? Math.log2(x - 1) : null))],
  [58, 'III', 'Apskaičiuokite: ∫₀^(π/2) cos x dx + ∫₁^e (1/x) dx.', 'nums', [2]],
  [59, 'III', 'Taškas juda tiese pagal dėsnį s(t) = t³ − 6t² + 9t (s – metrais, t – sekundėmis). Kuriais momentais jo greitis lygus 0? Koks pagreitis, kai t = 3 s?', 'nums', [1, 3, 6]],
  [60, 'III', 'Raskite funkcijos f(x) = (x² + 1)/x ekstremumus.', 'extrema', [[-1, -2, 'max'], [1, 2, 'min']]],
  [61, 'IV', 'Prekės kaina pirmiausia padidinta 20 %, paskui sumažinta 20 %. Keliais procentais pasikeitė pradinė kaina?', 'nums', [4]],
  [62, 'IV', 'Į banką padėta 2000 € su 5 % metinėmis sudėtinėmis palūkanomis. Kiek pinigų bus po 3 metų?', 'nums', [2315.25]],
  [63, 'IV', 'Telefonas po dviejų vienodų nuolaidų atpigo nuo 500 € iki 405 €. Kiek procentų buvo kiekviena nuolaida?', 'nums', [10]],
  [64, 'IV', 'Lydinys sveria 40 kg, jame 30 % vario. Kiek kg gryno vario reikia pridėti, kad vario būtų 50 %?', 'nums', [16]],
  [65, 'IV', 'Kiek litrų vandens reikia įpilti į 6 l 40 % druskos tirpalo, kad gautumėte 15 % tirpalą?', 'nums', [10]],
  [66, 'IV', 'Bruto atlyginimas 1500 €. Iš jo išskaičiuojama 20 % pajamų mokesčio ir 19,5 % socialinio draudimo įmokų (abu nuo bruto). Kiek darbuotojas gauna į rankas?', 'nums', [907.5]],
  [67, 'IV', 'Iš dviejų miestų, tarp kurių 360 km, vienu metu priešpriešiais išvažiavo du automobiliai. Vieno greitis 10 km/h didesnis už kito, jie susitiko po 2 h. Raskite abiejų automobilių greičius.', 'nums', [85, 95]],
  [68, 'IV', 'Motorinė valtis nuplaukė 48 km pasroviui ir grįžo atgal, iš viso sugaišusi 7 h. Upės tėkmės greitis 2 km/h. Koks valties greitis stovinčiame vandenyje?', 'nums', [14]],
  [69, 'IV', 'Dviratininkas pusę kelio važiavo 20 km/h greičiu, o likusią pusę – 30 km/h. Koks jo vidutinis greitis?', 'nums', [24]],
  [70, 'IV', '300 m ilgio traukinys pro stulpą pravažiuoja per 15 s, o per tiltą – per 45 s. Koks tilto ilgis?', 'nums', [600]],
  [71, 'IV', 'Automobilis turėjo nuvažiuoti 300 km. Jis važiavo 10 km/h greičiau nei planuota ir atvyko 1 h anksčiau. Koks buvo planuotas greitis?', 'nums', [50]],
  [72, 'IV', 'Du bėgikai iš to paties taško ta pačia kryptimi startuoja 400 m ratu greičiais 5 m/s ir 4 m/s. Po kiek laiko greitesnis pirmą kartą aplenks lėtesnį visu ratu?', 'nums', [400]],
  [73, 'IV', 'Vienas meistras darbą atlieka per 6 h, kitas – per 12 h. Per kiek laiko jie atliks jį dirbdami kartu?', 'nums', [4]],
  [74, 'IV', 'Du vamzdžiai kartu baseino pripildo per 6 h. Pirmasis vienas jį pripildo 5 h greičiau nei antrasis. Per kiek laiko kiekvienas vienas pripildo baseiną?', 'nums', [10, 15]],
  [75, 'IV', 'Vienas vamzdis baseiną pripildo per 4 h, kitas ištuština per 6 h. Per kiek laiko baseinas prisipildys, jei atsukti abu?', 'nums', [12]],
  [76, 'IV', 'Aritmetinės progresijos a₃ = 7, a₁₀ = 28. Raskite a₁, d ir S₂₀.', 'nums', [1, 3, 590]],
  [77, 'IV', 'Geometrinės progresijos b₂ = 6, b₅ = 162. Raskite b₁, q ir S₅.', 'nums', [2, 3, 242]],
  [78, 'IV', 'Sportininkas pirmą dieną nubėgo 3 km, o kiekvieną kitą – 0,5 km daugiau nei prieš tai. Per kiek dienų jis iš viso nubėgs 69 km?', 'nums', [12]],
  [79, 'IV', 'Nykstamosios geometrinės progresijos suma lygi 12, pirmasis narys – 8. Raskite vardiklį q.', 'nums', [1 / 3]],
  [80, 'IV', 'Bakterijų skaičius kas valandą padvigubėja. Iš pradžių jų buvo 500. Po kiek valandų jų pirmą kartą bus daugiau nei 100 000?', 'nums', [8]],
  [81, 'IV', 'Tarp skaičių 2 ir 162 įrašykite tris teigiamus skaičius taip, kad gautumėte geometrinę progresiją.', 'nums', [6, 18, 54]],
  [82, 'IV', 'Metami du lošimo kauliukai. Kokia tikimybė, kad akučių suma bus 8?', 'nums', [5 / 36]],
  [83, 'IV', 'Dėžėje 5 raudoni ir 7 mėlyni rutuliai. Atsitiktinai traukiami 2. Kokia tikimybė, kad abu raudoni?', 'nums', [5 / 33]],
  [84, 'IV', 'Kiek skirtingų 4 skaitmenų PIN kodų galima sudaryti iš skaitmenų 0–9, jei skaitmenys nesikartoja?', 'nums', [5040]],
  [85, 'IV', 'Klasėje 25 mokiniai. Keliais būdais galima išrinkti seniūną, jo pavaduotoją ir ižinininką?', 'nums', [13800]],
  [86, 'IV', 'Keliais būdais iš 10 mokinių galima išrinkti 3 asmenų komandą?', 'nums', [120]],
  [87, 'IV', 'Moneta metama 4 kartus. Kokia tikimybė, kad herbas atsivers lygiai 2 kartus?', 'nums', [3 / 8]],
  [88, 'IV', 'Šaulys pataiko į taikinį su tikimybe 0,8. Jis šauna 3 kartus. Kokia tikimybė, kad pataikys bent kartą?', 'nums', [0.992]],
  [89, 'IV', 'Kiek skirtingų raidžių sekų galima sudaryti iš visų žodžio VILNIUS raidžių?', 'nums', [2520]],
  [90, 'IV', 'Tikimybė išlaikyti matematiką 0,6, anglų kalbą – 0,5, o abu egzaminus – 0,3. Kokia tikimybė išlaikyti bent vieną? Ar šie įvykiai nepriklausomi?', 'nums', [0.8]],
  [91, 'IV', 'Mokinio pažymiai: 7, 9, 8, 10, 6, 9, 9. Raskite vidurkį, medianą ir modą.', 'nums', [58 / 7, 9]],
  [92, 'IV', 'Penkių skaičių vidurkis 12. Pridėjus dar vieną skaičių, vidurkis tapo 13. Koks skaičius pridėtas?', 'nums', [18]],
  [93, 'IV', 'Stačiojo trikampio statiniai 9 cm ir 12 cm. Raskite įžambinę, plotą ir įbrėžto apskritimo spindulį.', 'nums', [15, 54, 3]],
  [94, 'IV', 'Trikampio kraštinės 7, 8 ir 13. Raskite didžiausią trikampio kampą.', 'nums', [120]],
  [95, 'IV', 'Dvi trikampio kraštinės 6 cm ir 10 cm, kampas tarp jų 30°. Raskite trikampio plotą.', 'nums', [15]],
  [96, 'IV', 'Ritinio aukštinė 10 cm, pagrindo spindulys 3 cm. Raskite tūrį ir visą paviršiaus plotą.', 'nums', [90 * pi, 78 * pi]],
  [97, 'IV', 'Rutulio paviršiaus plotas 36π cm². Raskite rutulio tūrį.', 'nums', [36 * pi]],
  [98, 'IV', 'Vektoriai a = (2; −1; 3) ir b = (1; 4; k). Su kuria k reikšme jie statmeni?', 'nums', [2 / 3]],
  [99, 'IV', 'Turima 120 m tvoros. Reikia aptverti stačiakampį sklypą prie upės (iš upės pusės tvoros nereikia). Kokie turi būti sklypo matmenys, kad plotas būtų didžiausias?', 'nums', [30, 60]],
  [100, 'IV', 'Iš 30 cm × 30 cm kartono lapo kampų išpjaunami vienodi kvadratėliai ir sulenkiama atvira dėžutė. Kokio kraštinės ilgio kvadratėlius reikia išpjauti, kad dėžutės tūris būtų didžiausias? Koks tas tūris?', 'nums', [5, 2000]],
];

// every expected number must appear in the answer (as a whole part, a right-hand side, or a number in the text)
function numsIn(t) {
  const out = [];
  const add = (x) => { const v = val(x.trim()); if (Number.isFinite(v)) out.push(v); };
  const pieces = [t, ...t.split(/[,;]|\s+or\s+|\s+and\s+|:/)];
  for (const p of pieces) { add(p); if (p.includes('=')) add(p.slice(p.lastIndexOf('=') + 1)); const m = p.match(/\(([^()]*)\)\s*$/); if (m) add(m[1]); }
  for (const m of t.matchAll(/-?\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
  return out;
}
const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
const fails = [], score = { I: [0, 0], II: [0, 0], III: [0, 0], IV: [0, 0] };
for (const [no, part, q, kind, exp, v] of P) {
  let ok = false, ans = '';
  try {
    const res = solveProblem(q, {});
    ans = res.answerText;
    if (kind === 'nums') { const got = numsIn(ans.replace(/\s*\+\s*C$/, '')); ok = exp.every((e) => got.some((g) => close(g, e)) || got.some((g) => close(g, -e) && part === 'IV')); }
    else if (kind === 'ineqa') ok = check({ kind: 'ineq', expected: exp }, { answerText: ans.replace(/\ba\b/g, 'x') }, PTS, IPTS);
    else ok = check({ kind, expected: exp, var: v || 'x', cat: '' }, res, PTS, IPTS);
  } catch (e) { ans = 'ERROR: ' + e.message; }
  score[part][1]++; if (ok) score[part][0]++; else fails.push(`✗ ${no}. ${q.slice(0, 80)}\n      got: ${ans.slice(0, 150)}`);
}
const names = { I: 'Skaičiavimai ir reiškiniai', II: 'Lygtys ir nelygybės', III: 'Funkcijos, išvestinės, integralai', IV: 'Žodiniai uždaviniai' };
let A = 0, B = 0;
for (const [k, [a, b]] of Object.entries(score)) { console.log(`${k.padEnd(4)} ${names[k].padEnd(36)} ${a}/${b}`); A += a; B += b; }
console.log(`TOTAL ${A}/${B}`);
if (process.argv.includes('--fails')) fails.forEach((f) => console.log(f));
