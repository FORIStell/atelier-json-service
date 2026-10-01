// Matrices with exact fractions: determinant, inverse, transpose, add/subtract/multiply, RREF.
import { Q, MathError } from './rational.js';
import { parse } from './parser.js';
import { fromRaw, simplify, num } from './cas.js';
import { tex, text } from './print.js';

const qt = (q) => tex(num(q));
export const mtex = (M) => `\\begin{bmatrix} ${M.map((r) => r.map(qt).join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
const mtext = (M) => '[' + M.map((r) => '[' + r.map((q) => text(num(q))).join(', ') + ']').join(', ') + ']';

// "[[1,2],[3,4]]" or "[1 2; 3 4]" -> Q[][]
export function parseMatrix(src) {
  let s = src.trim();
  let rows;
  if (/^\[\s*\[/.test(s)) {
    rows = [];
    const re = /\[([^\[\]]*)\]/g;
    let m;
    while ((m = re.exec(s))) rows.push(m[1].split(',').map((x) => x.trim()).filter(Boolean));
  } else if (/^\[.*\]$/.test(s)) {
    rows = s.slice(1, -1).split(/;|\|/).map((r) => r.trim().split(/[\s,]+/).filter(Boolean));
  } else return null;
  if (!rows.length || rows.some((r) => r.length !== rows[0].length)) throw new MathError('Every row of a matrix needs the same number of entries');
  return rows.map((r) => r.map((e) => {
    const v = simplify(fromRaw(parse(e)));
    if (v.t !== 'num' || !(v.v instanceof Q)) throw new MathError('Matrix entries must be numbers');
    return v.v;
  }));
}
const isMatrixText = (s) => /^\[\s*\[[^]*\]\s*\]$|^\[[^\[\]]*;[^\[\]]*\]$/.test(s.trim());

export function matrixProblem(s, res) {
  let m;
  const mat = String.raw`(\[\s*\[[^]*?\]\s*\]|\[[^\[\]]*;[^\[\]]*\])`;
  if ((m = s.match(new RegExp(`^(?:det|determinant)\\s*(?:of\\s*)?\\(?\\s*${mat}\\s*\\)?$`, 'i')))) return det(parseMatrix(m[1]), res);
  if ((m = s.match(new RegExp(`^(?:inverse|inv)\\s*(?:of\\s*)?\\(?\\s*${mat}\\s*\\)?$`, 'i'))) || (m = s.match(new RegExp(`^${mat}\\s*\\^\\s*\\(?-1\\)?$`)))) return inverse(parseMatrix(m[1]), res);
  if ((m = s.match(new RegExp(`^(?:transpose)\\s*(?:of\\s*)?\\(?\\s*${mat}\\s*\\)?$`, 'i')))) { const A = parseMatrix(m[1]); const T = A[0].map((_, j) => A.map((r) => r[j])); return res('matrix', 'Transpose', `${mtex(A)}^{T}`, [{ title: 'Swap rows and columns', math: `${mtex(A)}^{T} = ${mtex(T)}` }], mtex(T), mtext(T)); }
  if ((m = s.match(new RegExp(`^(?:rref|row reduce)\\s*(?:of\\s*)?\\(?\\s*${mat}\\s*\\)?$`, 'i')))) return rrefProblem(parseMatrix(m[1]), res);
  if ((m = s.match(new RegExp(`^${mat}\\s*([*×+\\-]?)\\s*${mat}$`)))) {
    const A = parseMatrix(m[1]), B = parseMatrix(m[3]);
    return m[2] === '+' || m[2] === '-' ? addSub(A, B, m[2], res) : multiply(A, B, res);
  }
  if (isMatrixText(s)) return det(parseMatrix(s), res, true);
  return null;
}

function det(A, res, auto) {
  const n = A.length;
  if (A[0].length !== n) throw new MathError('The determinant needs a square matrix');
  const steps = [];
  let value;
  if (n === 1) value = A[0][0];
  else if (n === 2) {
    const [[a, b], [c, d]] = A;
    value = a.mul(d).sub(b.mul(c));
    steps.push({ title: 'For a 2×2 matrix: $\\det = ad - bc$', math: `(${qt(a)})(${qt(d)}) - (${qt(b)})(${qt(c)}) = ${qt(a.mul(d))} - ${paren(b.mul(c))} = ${qt(value)}` });
  } else if (n === 3) {
    const minor = (i, j) => A.filter((_, r) => r !== i).map((r) => r.filter((_, c) => c !== j));
    const d2 = (M) => M[0][0].mul(M[1][1]).sub(M[0][1].mul(M[1][0]));
    steps.push({ title: 'Expand along the first row (cofactor expansion)', math: `${qt(A[0][0])}\\begin{vmatrix} ${minor(0, 0).map((r) => r.map(qt).join(' & ')).join(' \\\\ ')} \\end{vmatrix} - ${paren(A[0][1])}\\begin{vmatrix} ${minor(0, 1).map((r) => r.map(qt).join(' & ')).join(' \\\\ ')} \\end{vmatrix} + ${paren(A[0][2])}\\begin{vmatrix} ${minor(0, 2).map((r) => r.map(qt).join(' & ')).join(' \\\\ ')} \\end{vmatrix}` });
    const ds = [0, 1, 2].map((j) => d2(minor(0, j)));
    steps.push({ title: 'Work out each 2×2 determinant ($ad - bc$)', math: `${qt(A[0][0])}(${qt(ds[0])}) - ${paren(A[0][1])}(${qt(ds[1])}) + ${paren(A[0][2])}(${qt(ds[2])})` });
    value = A[0][0].mul(ds[0]).sub(A[0][1].mul(ds[1])).add(A[0][2].mul(ds[2]));
    steps.push({ title: 'Multiply and add', math: `= ${qt(value)}` });
  } else {
    // row reduction
    const M = A.map((r) => r.slice());
    let sign = Q.of(1);
    for (let c = 0; c < n; c++) {
      let p = c; while (p < n && M[p][c].isZero()) p++;
      if (p === n) { value = Q.of(0); break; }
      if (p !== c) { [M[p], M[c]] = [M[c], M[p]]; sign = sign.neg(); steps.push({ title: `Swap rows ${p + 1} and ${c + 1} (changes the sign)`, math: mtex(M) }); }
      for (let r = c + 1; r < n; r++) { const f = M[r][c].div(M[c][c]); if (!f.isZero()) M[r] = M[r].map((x, j) => x.sub(f.mul(M[c][j]))); }
      steps.push({ title: `Clear column ${c + 1} below the pivot`, math: mtex(M) });
    }
    if (value === undefined) {
      value = M.reduce((acc, r, i) => acc.mul(r[i]), sign);
      steps.push({ title: 'Determinant = product of the diagonal' + (sign.sign() < 0 ? ' (times −1 for the swaps)' : ''), math: `${M.map((r, i) => paren(r[i])).join(' \\cdot ')} = ${qt(value)}` });
    }
  }
  return res('matrix', auto ? 'Matrix determinant' : 'Determinant', `\\det ${mtex(A)}`, [{ title: 'Start with the matrix', math: mtex(A) }, ...steps], qt(value), value.toString());
}
const paren = (q) => (q.sign() < 0 ? `(${qt(q)})` : qt(q));

function inverse(A, res) {
  const n = A.length;
  if (A[0].length !== n) throw new MathError('Only square matrices have inverses');
  const steps = [{ title: 'Start with the matrix', math: mtex(A) }];
  if (n === 2) {
    const [[a, b], [c, d]] = A;
    const D = a.mul(d).sub(b.mul(c));
    steps.push({ title: 'Find the determinant $ad - bc$', math: `\\det = ${qt(D)}` });
    if (D.isZero()) { steps.push({ title: 'The determinant is 0, so the matrix has no inverse' }); return res('matrix', 'Inverse', `${mtex(A)}^{-1}`, steps, '\\text{no inverse}', 'No inverse'); }
    const adj = [[d, b.neg()], [c.neg(), a]];
    steps.push({ title: 'Swap $a$ and $d$, change the signs of $b$ and $c$, divide by the determinant', math: `\\frac{1}{${qt(D)}}${mtex(adj)}` });
    const inv = adj.map((r) => r.map((x) => x.div(D)));
    steps.push({ title: 'Divide each entry', math: mtex(inv) });
    return res('matrix', 'Inverse', `${mtex(A)}^{-1}`, steps, mtex(inv), mtext(inv));
  }
  // Gauss-Jordan on [A | I]
  const M = A.map((r, i) => [...r, ...r.map((_, j) => Q.of(i === j ? 1 : 0))]);
  const aug = () => `\\left[\\begin{array}{${'r'.repeat(n)}|${'r'.repeat(n)}} ${M.map((r) => r.map(qt).join(' & ')).join(' \\\\ ')} \\end{array}\\right]`;
  steps.push({ title: 'Write $[A \\mid I]$ and row-reduce until the left side is $I$', math: aug() });
  for (let c = 0; c < n; c++) {
    let p = c; while (p < n && M[p][c].isZero()) p++;
    if (p === n) { steps.push({ title: 'A column has no pivot, so the matrix has no inverse' }); return res('matrix', 'Inverse', `${mtex(A)}^{-1}`, steps, '\\text{no inverse}', 'No inverse'); }
    if (p !== c) [M[p], M[c]] = [M[c], M[p]];
    const pv = M[c][c];
    M[c] = M[c].map((x) => x.div(pv));
    for (let r = 0; r < n; r++) if (r !== c && !M[r][c].isZero()) { const f = M[r][c]; M[r] = M[r].map((x, j) => x.sub(f.mul(M[c][j]))); }
    steps.push({ title: `Make column ${c + 1} a pivot column`, math: aug() });
  }
  const inv = M.map((r) => r.slice(n));
  steps.push({ title: 'The right side is the inverse', math: mtex(inv) });
  return res('matrix', 'Inverse', `${mtex(A)}^{-1}`, steps, mtex(inv), mtext(inv));
}

function multiply(A, B, res) {
  if (A[0].length !== B.length) throw new MathError(`Can't multiply: the first matrix has ${A[0].length} columns but the second has ${B.length} rows`);
  const C = A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => s.add(x.mul(B[k][j])), Q.of(0))));
  const detail = A.map((r, i) => B[0].map((_, j) => r.map((x, k) => `${paren(x)}\\cdot${paren(B[k][j])}`).join('+')).slice(0, 3).join(',\\ ')).slice(0, 3);
  const steps = [
    { title: 'Each entry = (row of the first) · (column of the second)', math: `${mtex(A)}${mtex(B)}` },
    { title: 'Multiply and add', detail: detail.map((d, i) => `\\text{row ${i + 1}: } ${d}`).join(' \\\\ ') },
    { title: 'Result', math: mtex(C) },
  ];
  return res('matrix', 'Matrix multiplication', `${mtex(A)}${mtex(B)}`, steps, mtex(C), mtext(C));
}
function addSub(A, B, op, res) {
  if (A.length !== B.length || A[0].length !== B[0].length) throw new MathError('Matrices must be the same size to add or subtract');
  const C = A.map((r, i) => r.map((x, j) => (op === '+' ? x.add(B[i][j]) : x.sub(B[i][j]))));
  return res('matrix', op === '+' ? 'Matrix addition' : 'Matrix subtraction', `${mtex(A)} ${op} ${mtex(B)}`, [{ title: `${op === '+' ? 'Add' : 'Subtract'} matching entries`, math: `${mtex(A)} ${op} ${mtex(B)} = ${mtex(C)}` }], mtex(C), mtext(C));
}
function rrefProblem(A, res) {
  const M = A.map((r) => r.slice());
  const steps = [{ title: 'Start with the matrix', math: mtex(M) }];
  let row = 0;
  for (let c = 0; c < M[0].length && row < M.length; c++) {
    let p = row; while (p < M.length && M[p][c].isZero()) p++;
    if (p === M.length) continue;
    [M[p], M[row]] = [M[row], M[p]];
    const pv = M[row][c];
    M[row] = M[row].map((x) => x.div(pv));
    for (let r = 0; r < M.length; r++) if (r !== row && !M[r][c].isZero()) { const f = M[r][c]; M[r] = M[r].map((x, j) => x.sub(f.mul(M[row][j]))); }
    steps.push({ title: `Pivot in column ${c + 1}`, math: mtex(M) });
    row++;
  }
  steps.push({ title: `Rank = ${row}` });
  return res('matrix', 'Reduced row echelon form', mtex(A), steps, mtex(M), mtext(M));
}
