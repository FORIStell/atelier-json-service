// cleaning up printed-text OCR of a word problem
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanOcrText } from '../web/src/ocr/text.js';

test('joins lines and words split by a hyphen', () => {
  assert.equal(cleanOcrText('Du vamzdžiai kartu pri-\npildo baseiną\nper 6 valandas.\n'), 'Du vamzdžiai kartu pripildo baseiną per 6 valandas.');
});
test('drops the task number, fixes O read as 0, spaces units', () => {
  assert.equal(cleanOcrText('7. Indėlis 5O00€ laikomas 4 metus, palūkanos 3%.'), 'Indėlis 5000 € laikomas 4 metus, palūkanos 3 %.');
});
test('keeps the Lithuanian word o', () => {
  assert.equal(cleanOcrText('pirmasis per 10 h, o antrasis per 15 h'), 'pirmasis per 10 h, o antrasis per 15 h');
});
