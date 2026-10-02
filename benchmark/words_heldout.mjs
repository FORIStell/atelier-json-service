// Held-out word problems (new wording and numbers, written after the word-problem rules) – measures how well
// the rules generalise. node words_heldout.mjs [--fails]
import { solveProblem } from '../web/src/engine/index.js';
import { val } from './bench_check.mjs';

const DEV = [
  // percentages and money
  ['lt', 'Kostiumo kaina buvo 120 €. Ji sumažinta 15 %. Kokia nauja kaina?', [102]],
  ['lt', 'Kiek eurų yra 35 % nuo 260 eurų?', [91]],
  ['lt', 'Bilieto kaina padidėjo nuo 8 € iki 10 €. Keliais procentais padidėjo kaina?', [25]],
  ['lt', 'Indėlis 5000 € laikomas banke 4 metus, kai metinės sudėtinės palūkanos 3 %. Kiek pinigų bus po 4 metų?', [5627.54]],
  ['lt', 'Prekė pabrango 10 %, o vėliau dar 10 %. Keliais procentais iš viso pabrango prekė?', [21]],
  ['lt', 'Kiek gramų druskos yra 250 g 12 % tirpalo?', [30]],
  ['lt', 'Į 4 l 25 % rūgšties tirpalo įpylė 1 l vandens. Kokia gauto tirpalo koncentracija procentais?', [20]],
  ['lt', 'Kompiuteris kainavo 900 €. Po nuolaidos jis kainuoja 765 €. Kiek procentų buvo nuolaida?', [15]],
  // motion
  ['lt', 'Traukinys per 4 valandas nuvažiavo 360 km. Koks jo vidutinis greitis?', [90]],
  ['lt', 'Pėsčiasis eina 5 km/h greičiu. Kiek laiko jis eis 12 km?', [2.4]],
  ['lt', 'Iš dviejų miestų, tarp kurių 300 km, vienu metu vienas priešais kitą išvažiavo du automobiliai, kurių greičiai 70 km/h ir 80 km/h. Po kiek valandų jie susitiks?', [2]],
  ['lt', 'Laivas plaukė 3 valandas 24 km/h greičiu ir 2 valandas 18 km/h greičiu. Koks vidutinis laivo greitis?', [21.6]],
  ['lt', 'Valtis pasroviui plaukia 15 km/h, o prieš srovę 9 km/h greičiu. Koks upės tėkmės greitis?', [3]],
  // work
  ['lt', 'Pirmas vamzdis baseiną pripildo per 10 valandų, antras – per 15 valandų. Per kiek valandų baseinas bus pripildytas, jei atsuksime abu vamzdžius?', [6]],
  ['lt', 'Trys darbininkai darbą atlieka per 8 dienas. Per kiek dienų tą patį darbą atliktų 4 darbininkai?', [6]],
  // progressions
  ['lt', 'Aritmetinės progresijos pirmasis narys 5, skirtumas 4. Raskite 15-ąjį narį ir pirmųjų 15 narių sumą.', [61, 495]],
  ['lt', 'Geometrinės progresijos pirmasis narys 3, vardiklis 2. Raskite šeštąjį narį.', [96]],
  ['lt', 'Aritmetinės progresijos a₅ = 20 ir a₉ = 36. Raskite a₁ ir d.', [4, 4]],
  ['lt', 'Teatro salėje pirmoje eilėje yra 20 vietų, o kiekvienoje kitoje eilėje – 2 vietomis daugiau. Kiek vietų yra 12-oje eilėje?', [42]],
  ['lt', 'Bakterijų skaičius kas valandą patrigubėja. Iš pradžių buvo 100 bakterijų. Kiek bakterijų bus po 5 valandų?', [24300]],
  // probability and counting
  ['lt', 'Metamas lošimo kauliukas. Kokia tikimybė, kad atsivers lyginis skaičius?', [0.5]],
  ['lt', 'Krepšelyje 6 obuoliai ir 4 kriaušės. Atsitiktinai paimamas vienas vaisius. Kokia tikimybė, kad tai kriaušė?', [0.4]],
  ['lt', 'Urnoje 3 balti ir 5 juodi rutuliai. Atsitiktinai traukiami 2 rutuliai. Kokia tikimybė, kad abu juodi?', [5 / 14]],
  ['lt', 'Keliais būdais galima išrikiuoti 6 mokinius į eilę?', [720]],
  ['lt', 'Keliais būdais iš 8 žmonių galima išrinkti 2 asmenų delegaciją?', [28]],
  ['lt', 'Kiek skirtingų trijų skaitmenų kodų galima sudaryti iš skaitmenų 0–9, jei skaitmenys gali kartotis?', [1000]],
  ['lt', 'Šaulys pataiko su tikimybe 0,9. Jis šauna 2 kartus. Kokia tikimybė, kad pataikys bent kartą?', [0.99]],
  ['lt', 'Moneta metama 3 kartus. Kokia tikimybė, kad herbas atsivers lygiai 1 kartą?', [3 / 8]],
  // statistics
  ['lt', 'Duoti skaičiai: 4, 8, 6, 10, 2. Raskite jų vidurkį ir medianą.', [6, 6]],
  ['lt', 'Keturių skaičių vidurkis 10. Pridėjus dar vieną skaičių, vidurkis tapo 12. Koks skaičius pridėtas?', [20]],
  // geometry
  ['lt', 'Stačiakampio ilgis 12 cm, plotis 5 cm. Raskite jo plotą, perimetrą ir įstrižainę.', [60, 34, 13]],
  ['lt', 'Apskritimo spindulys 5 cm. Raskite jo ilgį ir skritulio plotą.', [10 * Math.PI, 25 * Math.PI]],
  ['lt', 'Stačiojo trikampio įžambinė 10 cm, vienas statinis 6 cm. Raskite kitą statinį.', [8]],
  ['lt', 'Kubo briauna 4 cm. Raskite kubo tūrį ir paviršiaus plotą.', [64, 96]],
  ['lt', 'Kūgio pagrindo spindulys 3 cm, aukštinė 4 cm. Raskite kūgio tūrį.', [12 * Math.PI]],
  ['lt', 'Rutulio spindulys 3 cm. Raskite rutulio tūrį.', [36 * Math.PI]],
  // algebra stories
  ['lt', 'Dviejų skaičių suma 50, o skirtumas 12. Raskite tuos skaičius.', [31, 19]],
  ['lt', 'Trijų iš eilės einančių natūraliųjų skaičių suma lygi 72. Raskite mažiausią iš jų.', [23]],
  ['lt', 'Tėvas 4 kartus vyresnis už sūnų, o abiejų amžių suma 50 metų. Kiek metų sūnui?', [10]],
  ['lt', 'Skaičių 84 padalykite santykiu 3 : 4.', [36, 48]],
  // English
  ['en', 'A rectangle has perimeter 30 and length 9. Find its width.', [6]],
  ['en', 'The sum of two consecutive integers is 41. Find the smaller one.', [20]],
  ['en', 'A car travels 150 km in 2.5 hours. What is its average speed?', [60]],
  ['en', 'A price of 80 is increased by 15%. What is the new price?', [92]],
  ['en', 'How many ways can 5 people sit in a row?', [120]],
  ['en', 'What is the probability of rolling a sum of 7 with two dice?', [1 / 6]],
  ['en', 'Find the hypotenuse of a right triangle with legs 5 and 12', [13]],
  ['en', 'Two pipes fill a tank in 4 hours and 12 hours. How long do they take together?', [3]],
];
// written after the general solver was built, measured once before any change
const TEST = [
  ['lt', 'Marškinių kaina 40 €. Per išpardavimą jie atpigo 25 %. Kiek dabar kainuoja marškiniai?', [30]],
  ['lt', 'Apskaičiuokite 12 % nuo 450.', [54]],
  ['lt', 'Benzino kaina padidėjo nuo 1,50 € iki 1,65 €. Keliais procentais padidėjo kaina?', [10]],
  ['lt', 'Butas pabrango 5 %, o paskui atpigo 5 %. Keliais procentais pasikeitė buto kaina?', [0.25]],
  ['lt', 'Kiek kilogramų cukraus yra 20 kg 15 % cukraus sirupo tirpalo?', [3]],
  ['lt', 'Indėlis 2000 € padėtas 2 metams su 10 % metinėmis sudėtinėmis palūkanomis. Kiek pinigų bus po 2 metų?', [2420]],
  ['lt', 'Dviratininkas važiuoja 18 km/h greičiu. Kiek kilometrų jis nuvažiuos per 3 valandas?', [54]],
  ['lt', 'Lėktuvas per 2 valandas nuskrido 1600 km. Koks lėktuvo greitis?', [800]],
  ['lt', 'Pėsčiasis nuėjo 15 km per 3 valandas. Koks jo greitis?', [5]],
  ['lt', 'Du dviratininkai išvažiavo vienas priešais kitą iš kaimų, tarp kurių 54 km. Jų greičiai 12 km/h ir 15 km/h. Po kiek valandų jie susitiks?', [2]],
  ['lt', 'Vienas siurblys baseiną pripildo per 6 valandas, kitas – per 3 valandas. Per kiek valandų jie kartu pripildys baseiną?', [2]],
  ['lt', 'Penki darbininkai sienas nudažo per 12 dienų. Per kiek dienų tą darbą atliktų 6 darbininkai?', [10]],
  ['lt', 'Aritmetinės progresijos pirmasis narys 2, skirtumas 3. Raskite 10-ąjį narį.', [29]],
  ['lt', 'Geometrinės progresijos pirmasis narys 5, vardiklis 3. Raskite ketvirtąjį narį.', [135]],
  ['lt', 'Stadiono pirmoje eilėje yra 30 vietų, o kiekvienoje kitoje – 4 vietomis daugiau. Kiek vietų yra 8-oje eilėje?', [58]],
  ['lt', 'Metamas lošimo kauliukas. Kokia tikimybė, kad atsivers skaičius, didesnis už 4?', [1 / 3]],
  ['lt', 'Dėžutėje 8 raudoni ir 2 žali pieštukai. Atsitiktinai paimamas vienas pieštukas. Kokia tikimybė, kad jis žalias?', [0.2]],
  ['lt', 'Maišelyje 4 raudoni ir 6 mėlyni saldainiai. Atsitiktinai paimami 2 saldainiai. Kokia tikimybė, kad abu mėlyni?', [1 / 3]],
  ['lt', 'Keliais būdais galima išrikiuoti 4 knygas lentynoje?', [24]],
  ['lt', 'Keliais būdais iš 7 mokinių galima išrinkti 3 asmenų komandą?', [35]],
  ['lt', 'Duoti skaičiai: 3, 7, 7, 2, 11. Raskite jų vidurkį ir medianą.', [6, 7]],
  ['lt', 'Stačiakampio ilgis 8 cm, plotis 6 cm. Raskite jo plotą ir įstrižainę.', [48, 10]],
  ['lt', 'Kvadrato kraštinė 7 cm. Raskite jo plotą ir perimetrą.', [49, 28]],
  ['lt', 'Apskritimo spindulys 4 cm. Raskite skritulio plotą.', [16 * Math.PI]],
  ['lt', 'Ritinio pagrindo spindulys 2 cm, aukštinė 5 cm. Raskite ritinio tūrį.', [20 * Math.PI]],
  ['lt', 'Stačiojo trikampio statiniai 8 cm ir 15 cm. Raskite įžambinę.', [17]],
  ['lt', 'Dviejų skaičių suma 30, o skirtumas 8. Raskite tuos skaičius.', [19, 11]],
  ['lt', 'Dviejų iš eilės einančių natūraliųjų skaičių suma lygi 45. Raskite mažesnįjį skaičių.', [22]],
  ['lt', 'Mama 3 kartus vyresnė už dukrą, o abiejų amžių suma 48 metai. Kiek metų dukrai?', [12]],
  ['lt', 'Skaičių 60 padalykite santykiu 2 : 3.', [24, 36]],
  ['en', 'A jacket costs 60 dollars and is discounted by 20%. What is the new price?', [48]],
  ['en', 'What is 30% of 70?', [21]],
  ['en', 'A train travels 240 km in 3 hours. What is its average speed?', [80]],
  ['en', 'A cyclist rides at 15 km/h for 4 hours. How far does she travel?', [60]],
  ['en', 'One pipe fills a tank in 6 hours and another in 12 hours. How long do they take together?', [4]],
  ['en', 'A bag has 3 red and 7 blue marbles. One marble is picked at random. What is the probability that it is red?', [0.3]],
  ['en', 'How many ways can 6 books be arranged on a shelf?', [720]],
  ['en', 'The sum of two numbers is 40 and their difference is 10. Find the numbers.', [25, 15]],
  ['en', 'A rectangle has length 7 and width 3. Find its area and perimeter.', [21, 20]],
  ['en', 'Find the area of a circle with radius 6', [36 * Math.PI]],
];const P = process.argv.includes('--test') ? TEST : DEV;

function numsIn(t) {
  const out = [];
  const add = (x) => { const v = val(x.trim()); if (Number.isFinite(v)) out.push(v); };
  for (const p of [t, ...t.split(/[,;]|\s+or\s+|\s+and\s+|:/)]) { add(p); if (p.includes('=')) add(p.slice(p.lastIndexOf('=') + 1)); }
  for (const m of t.matchAll(/-?\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
  return out;
}
const close = (a, b) => Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b));
const score = { lt: [0, 0], en: [0, 0] }, fails = [];
for (const [lang, q, exp] of P) {
  let ok = false, ans = '';
  try { ans = solveProblem(q).answerText; const got = numsIn(ans); ok = exp.every((e) => got.some((g) => close(g, e))); } catch (e) { ans = 'ERROR: ' + e.message; }
  score[lang][1]++; if (ok) score[lang][0]++; else fails.push(`✗ [${lang}] ${q.slice(0, 90)}\n      got: ${ans.slice(0, 120)}`);
}
console.log(`${process.argv.includes('--test') ? 'TEST' : 'DEV'}  Lithuanian ${score.lt[0]}/${score.lt[1]}   English ${score.en[0]}/${score.en[1]}`);
if (process.argv.includes('--fails')) fails.forEach((f) => console.log(f));
