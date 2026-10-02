// practice mode: generated problems, similar problems, answer checking
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveProblem } from '../web/src/engine/index.js';
import { TOPICS, generate, similar, check, rng } from '../web/src/practice.js';

const P = (text) => ({ text, result: solveProblem(text) });
test('every topic makes solvable problems whose own answer checks', () => {
  const r = rng(1);
  for (const t of TOPICS) for (let i = 0; i < 15; i++) { const p = generate(t.id, r); assert.ok(check(p.result.answerText, p).ok, `${p.text} -> ${p.result.answerText}`); }
});
test('numbers in any order and form', () => {
  const q = P('x^2-5x+6=0');
  for (const a of ['3, 2', 'x=2, x=3', 'x = 3 arba x = 2', '2; 3', '2 or 3']) assert.ok(check(a, q).ok, a);
  for (const a of ['2', '2, 4', '-2, -3', '']) assert.ok(!check(a, q).ok, a);
  assert.ok(check('0,5', P('2x+3=4')).ok);
  assert.ok(check('1/6', P('Metami du lošimo kauliukai. Kokia tikimybė, kad akių suma bus 7?')).ok);
  assert.ok(check('0.1667', P('Metami du lošimo kauliukai. Kokia tikimybė, kad akių suma bus 7?')).ok);
  assert.ok(check('91 €', P('Kiek eurų yra 35 % nuo 260 eurų?')).ok);
  assert.ok(check('8sqrt(2)', P('sqrt(50)+sqrt(18)')).ok);
  assert.ok(check('x=1, y=2', P('x+y=3, x-y=-1')).ok);
});
test('expressions are compared as functions', () => {
  const d = P('d/dx (x^3+2x^2-5x)');
  assert.ok(check('3x^2+4x-5', d).ok);
  assert.ok(check("f'(x) = 4x + 3x^2 - 5", d).ok);
  assert.ok(!check('3x^2+4x+5', d).ok);
  const i = P('∫ (4x^3 - 6x) dx');
  assert.ok(check('x^4 - 3x^2 + 7', i).ok); // any constant
  assert.ok(!check('x^4 - 6x^2', i).ok);
});
test('similar problems keep the kind and stay nice', () => {
  const r = rng(3);
  for (const q of ['3x+5=20', 'x^2-5x+6=0', 'log_2(x+3)=4', 'Kiek eurų yra 35 % nuo 260 eurų?']) {
    const s = similar(q, r);
    assert.ok(s && s.text !== q, q);
    assert.equal(s.result.title, solveProblem(q).title);
    assert.ok(check(s.result.answerText, s).ok);
  }
});
test('progressions with negative numbers', () => {
  assert.match(solveProblem('Aritmetinės progresijos pirmasis narys 3, skirtumas -4. Raskite 17-ąjį narį.').answerText, /= -61/);
});
