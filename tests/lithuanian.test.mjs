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
