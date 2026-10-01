// The browser tokenizer for the formula reader must match the reference (Hugging Face tokenizers) ids.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Tokenizer } from '../web/src/ocr/mfr.js';

const tok = new Tokenizer(JSON.parse(fs.readFileSync(new URL('../web/model/mfr/tokenizer.json', import.meta.url), 'utf8')));
const cases = [
  ['\\frac { 1 } { 5 } x ^ { 2 }', [64, 277, 262, 268, 261, 262, 431, 261, 282, 265, 262, 269, 261]],
  ['- \\frac { 1 } { 1 9 2 }', [17, 263, 277, 262, 268, 261, 262, 268, 516, 269, 261]],
  ['a x + b y = 0', [69, 282, 274, 345, 338, 270, 279]],
  ['\\sqrt { 3 6 0 } \\leq 4', [64, 418, 262, 312, 450, 279, 261, 263, 443, 333]],
];
for (const [s, ids] of cases) {
  test(`encode ${s}`, () => assert.deepEqual(tok.encode(s), ids));
  test(`decode ${s}`, () => assert.equal(tok.decode(ids), s));
}
