// Common geometry formulas written in words, e.g. "area of a circle with radius 5".
import { MathError } from './rational.js';
import { parse } from './parser.js';
import { fromRaw, simplify, evalNum, subst, sym, num } from './cas.js';
import { tex, text } from './print.js';
import { formatNumber } from './rational.js';

const N = String.raw`(-?\d+(?:\.\d+)?)`;
const SHAPES = [
  { re: new RegExp(`area of (?:a )?circle (?:with )?(?:radius|r)\\s*(?:=|of|is)?\\s*${N}`, 'i'), name: 'Area of a circle', f: 'pi*r^2', fx: 'A = \\pi r^2', vars: ['r'] },
  { re: new RegExp(`area of (?:a )?circle (?:with )?(?:diameter|d)\\s*(?:=|of|is)?\\s*${N}`, 'i'), name: 'Area of a circle', f: 'pi*(d/2)^2', fx: 'A = \\pi \\left(\\frac{d}{2}\\right)^2', vars: ['d'] },
  { re: new RegExp(`(?:circumference|perimeter) of (?:a )?circle (?:with )?(?:radius|r)\\s*(?:=|of|is)?\\s*${N}`, 'i'), name: 'Circumference of a circle', f: '2*pi*r', fx: 'C = 2\\pi r', vars: ['r'] },
  { re: new RegExp(`(?:circumference|perimeter) of (?:a )?circle (?:with )?(?:diameter|d)\\s*(?:=|of|is)?\\s*${N}`, 'i'), name: 'Circumference of a circle', f: 'pi*d', fx: 'C = \\pi d', vars: ['d'] },
  { re: new RegExp(`area of (?:a )?(?:rectangle|rect)\\D*?${N}\\s*(?:by|x|×|and|,)\\s*${N}`, 'i'), name: 'Area of a rectangle', f: 'l*w', fx: 'A = l \\cdot w', vars: ['l', 'w'] },
  { re: new RegExp(`perimeter of (?:a )?(?:rectangle|rect)\\D*?${N}\\s*(?:by|x|×|and|,)\\s*${N}`, 'i'), name: 'Perimeter of a rectangle', f: '2*l+2*w', fx: 'P = 2l + 2w', vars: ['l', 'w'] },
  { re: new RegExp(`area of (?:a )?square\\D*?${N}`, 'i'), name: 'Area of a square', f: 's^2', fx: 'A = s^2', vars: ['s'] },
  { re: new RegExp(`perimeter of (?:a )?square\\D*?${N}`, 'i'), name: 'Perimeter of a square', f: '4*s', fx: 'P = 4s', vars: ['s'] },
  { re: new RegExp(`area of (?:a )?triangle\\D*?(?:base|b)\\s*(?:=|of|is)?\\s*${N}\\D+?(?:height|h)\\s*(?:=|of|is)?\\s*${N}`, 'i'), name: 'Area of a triangle', f: 'b*h/2', fx: 'A = \\frac{1}{2} b h', vars: ['b', 'h'] },
  { re: new RegExp(`area of (?:a )?trapezoid\\D*?${N}\\s*(?:,|and)\\s*${N}\\D+?(?:height|h)\\s*(?:=|of|is)?\\s*${N}`, 'i'), name: 'Area of a trapezoid', f: '(a+b)*h/2', fx: 'A = \\frac{(a + b)h}{2}', vars: ['a', 'b', 'h'] },
  { re: new RegExp(`volume of (?:a )?sphere (?:with )?(?:radius|r)\\s*(?:=|of|is)?\\s*${N}`, 'i'), name: 'Volume of a sphere', f: '4/3*pi*r^3', fx: 'V = \\frac{4}{3}\\pi r^3', vars: ['r'] },
  { re: new RegExp(`surface area of (?:a )?sphere (?:with )?(?:radius|r)\\s*(?:=|of|is)?\\s*${N}`, 'i'), name: 'Surface area of a sphere', f: '4*pi*r^2', fx: 'S = 4\\pi r^2', vars: ['r'] },
  { re: new RegExp(`volume of (?:a )?cylinder\\D*?(?:radius|r)\\s*(?:=|of|is)?\\s*${N}\\D+?(?:height|h)\\s*(?:=|of|is)?\\s*${N}`, 'i'), name: 'Volume of a cylinder', f: 'pi*r^2*h', fx: 'V = \\pi r^2 h', vars: ['r', 'h'] },
  { re: new RegExp(`volume of (?:a )?cone\\D*?(?:radius|r)\\s*(?:=|of|is)?\\s*${N}\\D+?(?:height|h)\\s*(?:=|of|is)?\\s*${N}`, 'i'), name: 'Volume of a cone', f: 'pi*r^2*h/3', fx: 'V = \\frac{1}{3}\\pi r^2 h', vars: ['r', 'h'] },
  { re: new RegExp(`volume of (?:a )?cube\\D*?${N}`, 'i'), name: 'Volume of a cube', f: 's^3', fx: 'V = s^3', vars: ['s'] },
  { re: new RegExp(`volume of (?:a )?(?:box|rectangular prism|prism)\\D*?${N}\\s*(?:by|x|×|,)\\s*${N}\\s*(?:by|x|×|,)\\s*${N}`, 'i'), name: 'Volume of a box', f: 'l*w*h', fx: 'V = l \\cdot w \\cdot h', vars: ['l', 'w', 'h'] },
];

export function geometryProblem(s, res) {
  let m;
  // Pythagorean theorem
  if ((m = s.match(new RegExp(`^(?:hypotenuse|pythagor\\w*)\\D*?${N}\\s*(?:,|and|\\s)\\s*${N}$`, 'i')))) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const c2 = a * a + b * b;
    const exact = simplify(fromRaw(parse(`sqrt(${c2})`)));
    const steps = [
      { title: 'Pythagorean theorem for a right triangle', math: 'a^2 + b^2 = c^2' },
      { title: 'Substitute the two legs', math: `${a}^2 + ${b}^2 = c^2` },
      { title: 'Square and add', math: `${a * a} + ${b * b} = ${c2} = c^2` },
      { title: 'Take the square root', math: `c = \\sqrt{${c2}} = ${tex(exact)}${exact.t === 'num' ? '' : ` \\approx ${formatNumber(evalNum(exact), 6)}`}` },
    ];
    return res('geometry', 'Hypotenuse', `a = ${a},\\ b = ${b}`, steps, `c = ${tex(exact)}`, `c = ${text(exact)}`);
  }
  for (const sh of SHAPES) {
    if (!(m = s.match(sh.re))) continue;
    const vals = m.slice(1, 1 + sh.vars.length).map(Number);
    if (vals.some((v) => !Number.isFinite(v))) throw new MathError('Please give the measurements as numbers');
    let node = fromRaw(parse(sh.f));
    const sub = sh.vars.map((v, i) => `${v} = ${vals[i]}`).join(',\\ ');
    for (let i = 0; i < sh.vars.length; i++) node = subst(node, sh.vars[i], num(vals[i]));
    const exact = simplify(node);
    const approx = evalNum(exact);
    const steps = [
      { title: 'Use the formula', math: sh.fx },
      { title: 'Substitute the values', detail: sub, math: tex(node) },
      { title: 'Calculate', math: `${tex(exact)}${exact.t === 'num' ? '' : ` \\approx ${formatNumber(approx, 6)}`}` },
    ];
    return res('geometry', sh.name, sh.fx.replace(/^\w = /, ''), steps, `${tex(exact)}${exact.t === 'num' ? '' : ` \\approx ${formatNumber(approx, 6)}`}`, `${text(exact)}${exact.t === 'num' ? '' : ` ≈ ${formatNumber(approx, 6)}`}`);
  }
  return null;
}
