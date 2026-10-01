// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveProblem } from '../web/src/engine/index.js';

const cases = [
  ['2+3*4^2', '50'],
  ['1/2+1/3', '5/6 ≈ 0.8333333333'],
  ['2/3 ÷ 4/5', '5/6 ≈ 0.8333333333'],
  ['0.5+0.25*2', '1'],
  ['-3^2+(-2)^3', '-17'],
  ['sqrt(144)+5!', '132'],
  ['15% of 80', '12'],
  ['3(x+2)-4=2x+7', 'x = 5'],
  ['x/2+1/3=5', 'x = 28/3'],
  ['x^2-5x+6=0', 'x = 2, x = 3'],
  ['2x^2+3x-4=0', 'x = (-3 - sqrt(41))/4, x = (-3 + sqrt(41))/4'],
  ['x^2+4=0', 'No real solutions'],
  ['x^3-6x^2+11x-6=0', 'x = 1, x = 2, x = 3'],
  ['x^4-5x^2+4=0', 'x = -2, x = -1, x = 1, x = 2'],
  ['1/x + 1/(x+1) = 1/2', 'x = (3 - sqrt(17))/2, x = (3 + sqrt(17))/2'],
  ['sqrt(x+3)=x-3', 'x = 6'],
  ['|2x-1|=5', 'x = -2, x = 3'],
  ['2^(x+1)=16', 'x = 3'],
  ['log(x)+log(x-3)=1', 'x = 5'],
  ['e^(2x)-3e^x+2=0', 'x = 0, x = ln(2)'],
  ['2x+3>7', 'x > 2'],
  ['x^2-4>0', 'x < -2 or x > 2'],
  ['|x-3|<5', '-2 < x < 8'],
  ['1<2x+3<9', '-1 < x < 3'],
  ['3x+2y=12, x-y=-1', 'x = 2, y = 3'],
  ['x+y+z=6, 2x-y+z=3, x+2y-z=2', 'x = 1, y = 2, z = 3'],
  ['y=x^2, y=x+2', '(x = -1, y = 1), (x = 2, y = 4)'],
  ['d/dx x^3 sin(x)', 'x^3*cos(x) + 3*x^2*sin(x)'],
  ['derivative of ln(sin x)', 'cot(x)'],
  ['second derivative of x^4', '12*x^2'],
  ['integrate x^2+3x dx', 'x^3/3 + 3*x^2/2 + C'],
  ['∫ 2x(x^2+1)^5 dx', '(x^2 + 1)^6/6 + C'],
  ['integrate from 0 to 1 of x^2', '1/3'],
  ['lim x->2 (x^2-4)/(x-2)', '4'],
  ['limit of sin(x)/x as x approaches 0', '1'],
  ['factor x^2-5x+6', '(x - 2)*(x - 3)'],
  ['expand (x+2)^3', 'x^3 + 6*x^2 + 12*x + 8'],
  ['simplify (x^2-9)/(x+3)', 'x - 3'],
  ['prime factorization of 360', '2^3 × 3^2 × 5'],
  ['solve for y: 2x+3y=6', 'y = (-2*x + 6)/3'],
];
for (const [q, want] of cases) {
  test(q, () => {
    const r = solveProblem(q);
    assert.equal(r.answerText, want);
    assert.ok(r.steps.length > 0);
  });
}
test('degree mode', () => assert.equal(solveProblem('sin(30)', { degrees: true }).answerText, '1/2 ≈ 0.5'));
test('bad input gives a friendly error', () => assert.throws(() => solveProblem('2+*'), /./));
