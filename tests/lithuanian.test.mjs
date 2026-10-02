// Lithuanian exam wording (VBE) is understood
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveProblem } from '../web/src/engine/index.js';

const cases = [
  ['Išspręskite lygtį log_2(2x - 6) = log_2 8.', 'x = 7'],
  ['Išspręskite lygtį 2^x + 2^(x+3) = 36.', 'x = 2'],
  ['Išspręskite nelygybę |x - 5| > 2.', 'x < 3 or x > 7'],
  ['Duotos dvi aibės A = {1; 4; 9; 16} ir B = {9; 16; 25}. Raskite šių aibių sankirtą A ∩ B.', '{9; 16}'],
  ['Nustatykite funkcijos f(x) = sqrt(2x + 14) apibrėžimo sritį.', 'x ≥ -7'],
  ['Raskite funkcijos S(x) = 10x - 2x^2 išvestinę.', '-4*x + 10'],
  ['Apskaičiuokite xy, jei 2^x = 3 ir 3^y = 16.', '4'],
  ['Yra žinoma, kad a = 2^m. Nustatykite, kam lygu log_2(1/a).', '-m'],
  ['Išspręskite lygtį tg x - 1 = 0, kai x ∈ (90°; 270°).', 'x = 225'],
];
for (const [q, want] of cases) test(q, () => assert.equal(solveProblem(q, q.includes('°') ? { degrees: true } : {}).answerText, want));

// VBE-style word problems
const words = [
  ['Prekės kaina pirmiausia padidinta 20 %, paskui sumažinta 20 %. Keliais procentais pasikeitė pradinė kaina?', 'decreased by % = 4'],
  ['Vienas meistras darbą atlieka per 6 h, kitas – per 12 h. Per kiek laiko jie atliks jį dirbdami kartu?', 't = 4'],
  ['Dėžėje 5 raudoni ir 7 mėlyni rutuliai. Atsitiktinai traukiami 2. Kokia tikimybė, kad abu raudoni?', 'P = 5/33'],
  ['Aritmetinės progresijos a₃ = 7, a₁₀ = 28. Raskite a₁, d ir S₂₀.', 'a1 = 1, d = 3, S20 = 590'],
  ['Automobilis per 3 valandas nuvažiavo 210 km. Koks jo vidutinis greitis?', 'v = 70'],
];
for (const [q, want] of words) test(q, () => assert.equal(solveProblem(q).answerText, want));
test('unknown story problems say so', () => assert.throws(() => solveProblem('Kiek yra trijų skaitmenų skaičių, kurių visi skaitmenys lyginiai?'), /word problem/));

// general word-problem solver (units + concepts), Lithuanian and English
const general = [
  ['Pėsčiasis eina 5 km/h greičiu. Kiek laiko jis eis 12 km?', 't = 2.4'],
  ['Urnoje 3 balti ir 5 juodi rutuliai. Atsitiktinai traukiami 2 rutuliai. Kokia tikimybė, kad abu juodi?', 'P = 5/14'],
  ['Stačiakampio ilgis 12 cm, plotis 5 cm. Raskite jo plotą, perimetrą ir įstrižainę.', 'S = 60, P = 34, d = 13'],
  ['Skaičių 84 padalykite santykiu 3 : 4.', 'first = 36, second = 48'],
  ['A train travels 240 km in 3 hours. What is its average speed?', 'v = 80'],
  ['The sum of two numbers is 40 and their difference is 10. Find the numbers.', 'x = 25, y = 15'],
];
for (const [q, want] of general) test(q, () => assert.equal(solveProblem(q).answerText, want));
test('together time given, one alone: find the other', () => {
  assert.match(solveProblem('Du vamzdžiai kartu pripildo baseiną per 6 valandas. Pirmasis vienas pripildo per 10 valandų. Per kiek valandų baseiną pripildytų antrasis vamzdis?').answerText, /t = 15/);
  assert.match(solveProblem('Pirmasis vamzdis pripildo baseiną per 6 h, antrasis per 3 h. Per kiek valandų pripildys abu kartu?').answerText, /t = 2/);
});
