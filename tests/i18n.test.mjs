// Lithuanian app language: interface, result titles, steps and answers
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveProblem } from '../web/src/engine/index.js';

globalThis.document = { documentElement: {} };
const i18n = await import('../web/src/i18n.js');
i18n.setLang('lt');

test('steps keep their math and lose their English', () => {
  assert.equal(i18n.trStep('Subtract $3$ from both sides'), 'Iš abiejų pusių atimkite $3$');
  assert.equal(i18n.trStep('Derivative of $\\sin x$ is $\\cos x$'), '$\\sin x$ išvestinė yra $\\cos x$');
  assert.equal(i18n.trStep('Part 2: Divide both sides by $2$'), '2 dalis: Padalykite abi puses iš $2$');
  assert.equal(i18n.trStep('Check the answers in the original equation'), 'Patikrinkite atsakymus pradinėje lygtyje');
});
test('a half translation falls back to English', () => {
  assert.equal(i18n.trStep('Frobnicate the widget with $x$'), 'Frobnicate the widget with $x$');
});
test('titles, answers and errors', () => {
  assert.equal(i18n.trKind('Solve for x'), 'Spręskite x atžvilgiu');
  assert.equal(i18n.trKind('Derivative'), 'Išvestinė');
  assert.match(i18n.trAnswer(solveProblem('x^2-4>0').answerTex), /\\text\{arba\}/);
  assert.equal(i18n.ui('Copied'), 'Nukopijuota');
});
test('every step of a full solution is translated', () => {
  for (const q of ['x^2-5x+6=0', 'lim x->0 sin(x)/x', 'sqrt(12)+sqrt(27)', '1/(1+sqrt2)']) {
    for (const s of solveProblem(q).steps) assert.notEqual(i18n.trStep(s.title), s.title, s.title);
  }
});
test('English stays English', () => {
  i18n.setLang('en');
  assert.equal(i18n.trStep('Subtract $3$ from both sides'), 'Subtract $3$ from both sides');
  i18n.setLang('lt');
});
