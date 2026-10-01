// The calculator keyboard produces LaTeX; check it converts and solves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { latexToText } from '../web/src/engine/latex.js';
import { solveProblem } from '../web/src/engine/index.js';

const cases = [
  ['\\frac12+3^2', '19/2 ≈ 9.5'],
  ['\\sqrt[3]{27}+\\sqrt{16}', '7'],
  ['x^2-5x+6=0', 'x = 2, x = 3'],
  ['\\int_0^2x^2\\,dx', '8/3'],
  ['\\int x\\cdot e^{x}\\,dx', 'x*e^x - e^x + C'],
  ['\\lim_{x\\to0}\\frac{\\sin(x)}{x}', '1'],
  ['\\lim_{x\\to0^{+}}\\frac{1}{x}', '∞'],
  ['\\sum_{n=1}^{100}n', '5050'],
  ['\\sum_{n=0}^{\\infty}\\frac{1}{2^{n}}', '2'],
  ['\\sum_{k=1}^{n}k', '(n*(n + 1))/2'],
  ['\\frac{d}{dx}x^3\\sin(x)', 'x^3*cos(x) + 3*x^2*sin(x)'],
  ['\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(e^{2x}\\right)', '2*e^(2*x)'],
  ['\\sqrt[5]{32}', '2'],
  ['\\log_2\\left(64\\right)', '6'],
  ['\\binom{10}{3}', '120'],
  ['\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}', '-2'],
  ['\\left|x-3\\right|<5', '-2 < x < 8'],
  ['\\sin^{2}\\left(x\\right)+\\cos^2x', '1'],
  ['e^{i\\pi}', '-1'],
  ['3\\times4\\div2', '6'],
  ['\\frac{x^{\\frac14}+x}{x^{\\frac14}}', 'x^(3/4) + 1'],
];
for (const [latex, want] of cases) test(latex, () => assert.equal(solveProblem(latexToText(latex)).answerText, want));
test('empty boxes give a clear message', () => assert.throws(() => latexToText('\\frac{1}{\\placeholder{}}'), /empty boxes/));
