"""12th-grade / first-year STEM exam benchmark for MathBot.

Each problem is written the way a student would type it into the app, together with an independent
answer computed by SymPy (not by MathBot). `python exam_problems.py` writes exam_expected.json;
`node run_bench.mjs` then solves every problem with MathBot and scores it.

Problem styles follow the Lithuanian VBE (state matura) exam, AP Calculus AB/BC and A-level Pure Maths."""
import json, math
import sympy as sp
from sympy import sin, cos, tan, asin, acos, atan, exp, log, sqrt, pi, E, I, Abs, Rational as R, oo, Matrix, binomial, factorial

x, y, n, k = sp.symbols('x y n k', real=True)
PTS = [0.7, 1.3, 2.1]          # where expressions are compared
IPTS = [-3.5, -2, -0.5, 0.5, 1.5, 2.5, 3.5, 6]  # where inequality answers are compared
P = []


def add(cat, q, kind, value, src='', **extra):
    P.append({'cat': cat, 'q': q, 'kind': kind, 'expected': value, 'src': src, **extra})


def num(e):
    return float(sp.N(e, 15))


def num_or_none(e):  # None where the function is not real (the point is skipped when comparing)
    v = complex(sp.N(e, 15))
    return v.real if abs(v.imag) < 1e-12 and math.isfinite(v.real) else None


def VAL(cat, q, e, src=''):            # one number
    add(cat, q, 'num', [num(e)], src)


def SOL(cat, q, eq, var=x, src=''):    # real solutions of eq = 0
    s = sp.solveset(eq, var, sp.S.Reals)
    if not isinstance(s, sp.FiniteSet):  # e.g. logs: solve, then keep the roots that really work
        z = sp.Symbol('z')
        cand = sp.solve(sp.expand_log(eq.subs(var, z), force=True), z)
        s = [c for c in cand if c.is_real and abs(complex(sp.N(eq.subs(var, c)))) < 1e-9]
    add(cat, q, 'set', sorted(num(v) for v in s), src)


def TRIG(cat, q, eq, src=''):          # solutions in [0, 2π), found numerically (SymPy's solveset misses some)
    import mpmath
    f = sp.lambdify(x, eq, 'mpmath')
    mpmath.mp.dps = 30
    roots = []
    N = 4000
    xs = [2 * math.pi * i / N for i in range(N + 1)]
    vs = [float(f(t)) for t in xs]
    for i in range(N):
        a, b = vs[i], vs[i + 1]
        cand = None
        if a == 0: cand = xs[i]
        elif a * b < 0: cand = (xs[i] + xs[i + 1]) / 2
        elif i and abs(a) < 1e-3 and abs(a) <= abs(vs[i - 1]) and abs(a) <= abs(b): cand = xs[i]  # touches zero
        if cand is None: continue
        try: r = float(mpmath.findroot(f, cand))
        except Exception: continue
        r = r % (2 * math.pi)
        if abs(r - 2 * math.pi) < 1e-9: r = 0.0
        if abs(float(f(r))) < 1e-9 and not any(abs(r - o) < 1e-7 for o in roots): roots.append(r)
    add(cat, q, 'trig', sorted(roots), src)


def EXPR(cat, q, e, var=x, src=''):    # an expression (derivative, simplification, formula)
    add(cat, q, 'expr', [num_or_none(e.subs(var, p)) for p in PTS], src, var=str(var))


def ANTI(cat, q, f, src=''):           # antiderivative: compare its derivative with f
    add(cat, q, 'anti', [num_or_none(f.subs(x, p)) for p in PTS], src)


def INEQ(cat, q, rel, src=''):         # inequality: which test points satisfy it
    add(cat, q, 'ineq', [bool(rel.subs(x, p)) for p in IPTS], src)


def CPLX(cat, q, vals, src=''):        # complex numbers
    add(cat, q, 'complex', sorted([[num(sp.re(v)), num(sp.im(v))] for v in vals]), src)


def MAT(cat, q, M, src=''):
    add(cat, q, 'matrix', [num(v) for v in M], src)


# ---------------- algebra ----------------
SOL('Equations', '2x+3=11', 2 * x + 3 - 11)
SOL('Equations', '3(x-2)+4=2x+7', 3 * (x - 2) + 4 - (2 * x + 7))
SOL('Equations', 'x/3 + x/4 = 7', x / 3 + x / 4 - 7)
SOL('Equations', 'x^2-5x+6=0', x**2 - 5 * x + 6)
SOL('Equations', '2x^2+3x-2=0', 2 * x**2 + 3 * x - 2)
SOL('Equations', 'x^2-2x-1=0', x**2 - 2 * x - 1)
SOL('Equations', '4x^2-12x+9=0', 4 * x**2 - 12 * x + 9)
SOL('Equations', 'x^3-6x^2+11x-6=0', x**3 - 6 * x**2 + 11 * x - 6)
SOL('Equations', 'x^4-13x^2+36=0', x**4 - 13 * x**2 + 36)
SOL('Equations', 'x^3-8=0', x**3 - 8)
SOL('Equations', '1/x + 1/(x+1) = 1/2', 1 / x + 1 / (x + 1) - R(1, 2))
SOL('Equations', '(x+1)/(x-2) = 3', (x + 1) / (x - 2) - 3)
SOL('Equations', 'sqrt(x+7) = x+1', sqrt(x + 7) - (x + 1))
SOL('Equations', 'sqrt(2x-1) = 3', sqrt(2 * x - 1) - 3)
SOL('Equations', '|2x-1| = 5', Abs(2 * x - 1) - 5)
SOL('Equations', '|x-3| = 2x', Abs(x - 3) - 2 * x)
SOL('Exponents & logs', '2^(x+1) = 16', 2**(x + 1) - 16, src='VBE')
SOL('Exponents & logs', '3^(2x-1) = 27', 3**(2 * x - 1) - 27)
SOL('Exponents & logs', '4^x - 3*2^x - 4 = 0', 4**x - 3 * 2**x - 4, src='VBE')
SOL('Exponents & logs', '9^x - 10*3^x + 9 = 0', 9**x - 10 * 3**x + 9)
SOL('Exponents & logs', 'e^(2x) - 5e^x + 6 = 0', exp(2 * x) - 5 * exp(x) + 6)
SOL('Exponents & logs', '5^x = 12', 5**x - 12)
SOL('Exponents & logs', 'log(2, x) = 5', log(x, 2) - 5)
SOL('Exponents & logs', 'log(2, x-1) + log(2, x+1) = 3', log(x - 1, 2) + log(x + 1, 2) - 3, src='VBE')
SOL('Exponents & logs', 'ln(x) = 2', log(x) - 2)
SOL('Exponents & logs', 'log(x) + log(x-3) = 1', log(x, 10) + log(x - 3, 10) - 1)
SOL('Exponents & logs', 'ln(x+1) - ln(x) = ln(2)', log(x + 1) - log(x) - log(2))
VAL('Exponents & logs', 'log(2, 32)', 5)
VAL('Exponents & logs', 'log(3, 1/9)', -2)
VAL('Exponents & logs', 'log(4) + log(25)', 2)
VAL('Exponents & logs', 'log(2, 12) - log(2, 3)', 2)
VAL('Exponents & logs', '27^(2/3)', 9)
VAL('Exponents & logs', '(1/8)^(-1/3)', 2)
VAL('Exponents & logs', '16^(-3/4)', R(1, 8))
VAL('Exponents & logs', 'e^(ln 7)', 7)
VAL('Radicals', 'sqrt(50) - sqrt(18)', sqrt(50) - sqrt(18))
VAL('Radicals', 'sqrt(12) * sqrt(3)', 6)
VAL('Radicals', '6/sqrt(3)', 6 / sqrt(3))
VAL('Radicals', '1/(sqrt(5)-2)', 1 / (sqrt(5) - 2))
VAL('Radicals', '(sqrt(3)+1)^2', (sqrt(3) + 1)**2)
VAL('Radicals', 'root(3, 54) + root(3, 16)', sp.root(54, 3) + sp.root(16, 3))
VAL('Radicals', 'sqrt(7+4sqrt(3))', sqrt(7 + 4 * sqrt(3)))
VAL('Arithmetic', '2/3 + 3/4 - 5/6', R(2, 3) + R(3, 4) - R(5, 6))
VAL('Arithmetic', '(3/4) / (9/8)', R(3, 4) / R(9, 8))
VAL('Arithmetic', '2^10 - 3^5', 2**10 - 3**5)
VAL('Arithmetic', '15% of 240', 36)
VAL('Arithmetic', '0.125 * 64', 8)
INEQ('Inequalities', '2x - 5 > 3', 2 * x - 5 > 3)
INEQ('Inequalities', 'x^2 - 4 < 0', x**2 - 4 < 0)
INEQ('Inequalities', 'x^2 - x - 6 >= 0', x**2 - x - 6 >= 0)
INEQ('Inequalities', '(x-1)/(x+2) <= 0', sp.And((x - 1) / (x + 2) <= 0, sp.Ne(x, -2)))
INEQ('Inequalities', '|x-1| < 3', Abs(x - 1) < 3)
INEQ('Inequalities', '|2x+1| >= 5', Abs(2 * x + 1) >= 5)
INEQ('Inequalities', '-1 < 2x+3 < 7', sp.And(-1 < 2 * x + 3, 2 * x + 3 < 7))
INEQ('Inequalities', 'x^3 - x > 0', x**3 - x > 0)
INEQ('Inequalities', '2^x > 8', 2**x > 8)
add('Systems', '2x + y = 7, x - y = 2', 'set', [3.0, 1.0])
add('Systems', 'x + y + z = 6, x - y + z = 2, 2x + y - z = 1', 'set', [1.0, 2.0, 3.0])
add('Systems', '3x - 2y = 4, 6x + y = 13', 'set', [2.0, 1.0])

# ---------------- trigonometry ----------------
VAL('Trigonometry', 'sin(pi/6) + cos(pi/3)', 1)
VAL('Trigonometry', 'tan(pi/4) * sin(pi/2)', 1)
VAL('Trigonometry', 'cos(2pi/3)', cos(2 * pi / 3))
VAL('Trigonometry', 'sin(5pi/4)', sin(5 * pi / 4))
VAL('Trigonometry', 'arcsin(sqrt(3)/2)', pi / 3)
VAL('Trigonometry', 'arctan(1)', pi / 4)
VAL('Trigonometry', 'sin(pi/12)', sin(pi / 12))
TRIG('Trig equations', '2sin(x) - 1 = 0', 2 * sin(x) - 1)
TRIG('Trig equations', 'cos(x) = -1/2', cos(x) + R(1, 2))
TRIG('Trig equations', 'tan(x) = sqrt(3)', tan(x) - sqrt(3))
TRIG('Trig equations', '2cos(x)^2 - cos(x) - 1 = 0', 2 * cos(x)**2 - cos(x) - 1)
TRIG('Trig equations', 'sin(2x) = sin(x)', sin(2 * x) - sin(x))
TRIG('Trig equations', 'sin(x)^2 = 1/4', sin(x)**2 - R(1, 4))
TRIG('Trig equations', '2sin(x)^2 + 3sin(x) + 1 = 0', 2 * sin(x)**2 + 3 * sin(x) + 1)
TRIG('Trig equations', 'sin(x) = cos(x)', sin(x) - cos(x))
EXPR('Trig identities', 'simplify sin(x)^2 + cos(x)^2 + tan(x)*cos(x)', 1 + sin(x))
EXPR('Trig identities', 'simplify (1 - cos(x)^2)/sin(x)', sin(x))
EXPR('Trig identities', 'simplify sin(x)/cos(x) * cos(x)^2', sin(x) * cos(x))

# ---------------- functions ----------------
add('Functions', 'domain of sqrt(x-2)', 'ineq', [p >= 2 for p in IPTS])
add('Functions', 'domain of ln(4-x^2)', 'ineq', [-2 < p < 2 for p in IPTS])
add('Functions', 'domain of 1/(x^2-9)', 'ineq', [abs(p) != 3 for p in IPTS])
add('Functions', 'domain of sqrt(x+3)/(x-1)', 'ineq', [p >= -3 and p != 1 for p in IPTS])
EXPR('Functions', 'inverse of f(x)=3x-5', (x + 5) / 3)
EXPR('Functions', 'inverse of f(x)=(x+2)/(x-1)', (x + 2) / (x - 1))
EXPR('Functions', 'inverse of f(x)=e^(2x)', log(x) / 2)
EXPR('Functions', 'inverse of f(x)=x^3+1', sp.real_root(x - 1, 3))
EXPR('Functions', 'inverse of f(x)=ln(x-2)', exp(x) + 2)
add('Functions', 'asymptotes of (2x+1)/(x-3)', 'asym', {'vert': [3.0], 'other': [2.0, 2.0, 2.0]})
add('Functions', 'asymptotes of (x^2-1)/(x+2)', 'asym', {'vert': [-2.0], 'other': [p - 2 for p in PTS]})
add('Functions', 'asymptotes of 3x/(x^2+1)', 'asym', {'vert': [], 'other': [0.0, 0.0, 0.0]})
add('Functions', 'extrema of x^3-3x^2+2', 'extrema', [[0, 2, 'max'], [2, -2, 'min']])
add('Functions', 'extrema of x^4-8x^2', 'extrema', [[-2, -16, 'min'], [0, 0, 'max'], [2, -16, 'min']])
add('Functions', 'extrema of x e^(-x)', 'extrema', [[1, num(exp(-1)), 'max']])
add('Functions', 'extrema of x + 4/x', 'extrema', [[-2, -4, 'max'], [2, 4, 'min']])
add('Functions', 'extrema of x^2 ln(x)', 'extrema', [[num(exp(-R(1, 2))), num(-1 / (2 * E)), 'min']])
EXPR('Functions', 'tangent line to x^3 at x=1', 3 * x - 2)
EXPR('Functions', 'tangent line to ln(x) at x=1', x - 1)
EXPR('Functions', 'tangent line to sqrt(x) at x=4', x / 4 + 1)
EXPR('Functions', 'tangent line to e^x at x=0', x + 1)

# ---------------- derivatives ----------------
for q, f in [('x^5 - 3x^2 + 7', x**5 - 3 * x**2 + 7), ('(2x+1)^4', (2 * x + 1)**4), ('x^2 sin(x)', x**2 * sin(x)), ('e^(3x) cos(x)', exp(3 * x) * cos(x)),
             ('ln(x^2+1)', log(x**2 + 1)), ('sqrt(1+x^2)', sqrt(1 + x**2)), ('(x^2+1)/(x-1)', (x**2 + 1) / (x - 1)), ('sin(x)^3', sin(x)**3),
             ('tan(2x)', tan(2 * x)), ('x ln(x) - x', x * log(x) - x), ('e^(x^2)', exp(x**2)), ('arctan(x^2)', atan(x**2)), ('1/sqrt(x)', 1 / sqrt(x)),
             ('x^x', x**x), ('ln(sin(x))', log(sin(x))), ('cos(x)/(1+sin(x))', cos(x) / (1 + sin(x))), ('2^x', 2**x), ('arcsin(2x)', asin(2 * x))]:
    EXPR('Derivatives', f'd/dx {q}', sp.diff(f, x))
EXPR('Derivatives', 'second derivative of x^4 - 2x^3', sp.diff(x**4 - 2 * x**3, x, 2))
EXPR('Derivatives', 'second derivative of x e^x', sp.diff(x * exp(x), x, 2))
VAL('Derivatives', 'derivative of x^3 - 4x at x=2', 8)
VAL('Derivatives', 'derivative of sin(x)^2 at x=pi/4', 1)

# ---------------- integrals ----------------
for q, f in [('3x^2 - 4x + 1', 3 * x**2 - 4 * x + 1), ('1/x', 1 / x), ('e^(2x)', exp(2 * x)), ('sin(3x)', sin(3 * x)), ('x e^x', x * exp(x)),
             ('x cos(x)', x * cos(x)), ('ln(x)', log(x)), ('x/(x^2+1)', x / (x**2 + 1)), ('1/(x^2+4)', 1 / (x**2 + 4)), ('x sqrt(x^2+1)', x * sqrt(x**2 + 1)),
             ('sin(x)^2', sin(x)**2), ('cos(x)^3', cos(x)**3), ('1/(x^2-1)', 1 / (x**2 - 1)), ('(2x+3)/(x^2+3x+2)', (2 * x + 3) / (x**2 + 3 * x + 2)),
             ('x^2 e^x', x**2 * exp(x)), ('tan(x)', tan(x)), ('1/sqrt(1-x^2)', 1 / sqrt(1 - x**2)), ('e^x sin(x)', exp(x) * sin(x)), ('sec(x)^2', 1 / cos(x)**2),
             ('x^3 ln(x)', x**3 * log(x)), ('1/(x(x+1))', 1 / (x * (x + 1))), ('sqrt(x)', sqrt(x)), ('(x+1)^5', (x + 1)**5), ('x/(x+1)', x / (x + 1))]:
    ANTI('Integrals', f'integrate {q} dx', f)
for q, e in [('integrate from 0 to 1 of x^2', R(1, 3)), ('integrate from 0 to pi of sin(x)', 2), ('integrate from 1 to e of ln(x)', 1),
             ('integrate from 0 to 2 of (3x^2+1)', 10), ('integrate from 0 to 1 of x e^x', 1), ('integrate from 1 to 4 of 1/sqrt(x)', 2),
             ('integrate from 0 to pi/2 of cos(x)^2', pi / 4), ('integrate from -1 to 1 of |x|', 1), ('integrate from 0 to 1 of 1/(1+x^2)', pi / 4),
             ('integrate from 0 to ln(2) of e^x', 1), ('integrate from 1 to 2 of 1/x^2', R(1, 2))]:
    VAL('Definite integrals', q, e)

# ---------------- limits ----------------
for q, e in [('lim x->2 (x^2-4)/(x-2)', 4), ('lim x->0 sin(3x)/x', 3), ('lim x->oo (3x^2+1)/(2x^2-5)', R(3, 2)), ('lim x->0 (1-cos(x))/x^2', R(1, 2)),
             ('lim x->0 (e^x-1)/x', 1), ('lim x->oo (1+2/x)^x', exp(2)), ('lim x->0 x ln(x)', 0), ('lim x->oo x/e^x', 0),
             ('lim x->1 (x^3-1)/(x-1)', 3), ('lim x->0 tan(x)/x', 1), ('lim x->oo (sqrt(x^2+x) - x)', R(1, 2)), ('lim x->0 (sqrt(1+x)-1)/x', R(1, 2)),
             ('lim x->3 (x^2-9)/(x^2-5x+6)', 6), ('lim x->oo ln(x)/x', 0)]:
    VAL('Limits', q, e)

# ---------------- sequences, series, combinatorics ----------------
add('Sequences', '5, 8, 11, 14, ... nth term', 'expr', [5 + 3 * (p - 1) for p in [1, 2, 3]], var='n', npts=[1, 2, 3])
add('Sequences', 'geometric sequence 2, 6, 18, ...', 'expr', [2 * 3**(p - 1) for p in [1, 2, 3]], var='n', npts=[1, 2, 3])
add('Sequences', '2, 5, 10, 17, ...', 'expr', [p**2 + 1 for p in [1, 2, 3]], var='n', npts=[1, 2, 3])
VAL('Series', 'sum n=1 to 20 of (3n-1)', sum(3 * i - 1 for i in range(1, 21)))
VAL('Series', 'sum k=1 to 10 of k^2', 385)
VAL('Series', 'sum n=0 to oo of (2/3)^n', 3)
VAL('Series', 'sum n=1 to oo of 1/(n(n+1))', 1)
VAL('Series', '3 + 6 + 12 + ... + 384', 765)
VAL('Series', '1 + 1/2 + 1/4 + ...', 2)
VAL('Series', '7 + 11 + 15 + ... + 99', sum(range(7, 100, 4)))
VAL('Combinatorics', 'nCr(10, 3)', 120)
VAL('Combinatorics', 'nPr(8, 3)', 336)
VAL('Combinatorics', '7!/(3! 4!)', 35)
VAL('Combinatorics', 'nCr(6,2) * nCr(4,2)', 90)

# ---------------- complex numbers, matrices, vectors ----------------
CPLX('Complex numbers', '(2+3i)(1-i)', [(2 + 3 * I) * (1 - I)])
CPLX('Complex numbers', '(3+4i)/(1+2i)', [(3 + 4 * I) / (1 + 2 * I)])
CPLX('Complex numbers', 'i^7', [I**7])
_z = sp.Symbol('z')
CPLX('Complex numbers', 'x^2 + 2x + 5 = 0', sp.solve(_z**2 + 2 * _z + 5, _z))
VAL('Complex numbers', '|5-12i|', 13)
VAL('Matrices', 'det [[2,1],[5,3]]', 1)
VAL('Matrices', 'det [[1,2,3],[0,1,4],[5,6,0]]', Matrix([[1, 2, 3], [0, 1, 4], [5, 6, 0]]).det())
MAT('Matrices', 'inverse [[4,7],[2,6]]', Matrix([[4, 7], [2, 6]]).inv())
MAT('Matrices', '[[1,2],[3,4]] * [[2,0],[1,2]]', Matrix([[1, 2], [3, 4]]) * Matrix([[2, 0], [1, 2]]))
add('Matrices', 'eigenvalues [[4,1],[2,3]]', 'set', [2.0, 5.0])
add('Matrices', 'eigenvalues [[2,0,0],[0,3,4],[0,4,9]]', 'set', [1.0, 2.0, 11.0])

# ---------------- differential equations, partial fractions ----------------
add('Differential equations', "y' = 3y", 'ode', {'rhs': '3*y'})
add('Differential equations', "y' = 2x y", 'ode', {'rhs': '2*x*y'})
add('Differential equations', "y' = x^2 + 1", 'ode', {'rhs': 'x^2 + 1'})
add('Differential equations', "y' + 2y = 4", 'ode', {'rhs': '4 - 2*y'})
add('Differential equations', "y' = y + e^x", 'ode', {'rhs': 'y + e^x'})
for q, f in [('3/((x-1)(x+2))', 3 / ((x - 1) * (x + 2))), ('(5x-4)/(x^2-x-2)', (5 * x - 4) / (x**2 - x - 2)), ('(x+3)/(x^2(x+1))', (x + 3) / (x**2 * (x + 1))),
             ('(x^2+2)/(x(x^2+1))', (x**2 + 2) / (x * (x**2 + 1)))]:
    EXPR('Partial fractions', f'partial fractions {q}', f)

# ---------------- statistics ----------------
VAL('Statistics', 'mean of 4, 8, 15, 16, 23, 42', R(108, 6))
VAL('Statistics', 'median of 3, 9, 1, 7, 5, 11', 6)
VAL('Statistics', 'variance of 2, 4, 4, 4, 5, 5, 7, 9', 4)

# ---------------- word problems (typed as text, exam style) ----------------
VAL('Word problems', 'A rectangle has perimeter 30 and length 9. Find its width.', 6, src='word')
VAL('Word problems', 'The sum of two consecutive integers is 41. Find the smaller one.', 20, src='word')
VAL('Word problems', 'A car travels 150 km in 2.5 hours. What is its average speed?', 60, src='word')
VAL('Word problems', 'Find the area of a circle with radius 3', 9 * pi, src='word')
VAL('Word problems', 'A price of 80 is increased by 15%. What is the new price?', 92, src='word')
VAL('Word problems', 'How many ways can 5 people sit in a row?', 120, src='word')
VAL('Word problems', 'What is the probability of rolling a sum of 7 with two dice?', R(1, 6), src='word')
VAL('Word problems', 'Find the hypotenuse of a right triangle with legs 5 and 12', 13, src='word')

json.dump({'points': PTS, 'ipoints': IPTS, 'problems': P}, open(__file__.replace('exam_problems.py', 'exam_expected.json'), 'w'), indent=1)
print(len(P), 'problems')
