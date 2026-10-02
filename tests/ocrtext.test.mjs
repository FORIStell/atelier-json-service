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
test('puts misread words right, but only to real words', () => {
  assert.equal(cleanOcrText('Stačiojo tnkampio įžambinė'), 'Stačiojo trikampio įžambinė');
  assert.equal(cleanOcrText('Kokia ukimybė, kad atsivers nelyginis skaičius?'), 'Kokia tikimybė, kad atsivers nelyginis skaičius?');
  assert.equal(cleanOcrText('Stadione pirmoje eilėje'), 'Stadione pirmoje eilėje');
});
test('percent signs, units and number lists', () => {
  assert.equal(cleanOcrText('Ji sumažinta 15 96. Kokia nauja kaina?'), 'Ji sumažinta 15 %. Kokia nauja kaina?');
  assert.equal(cleanOcrText('What is 3096 of 70?'), 'What is 30 % of 70?');
  assert.equal(cleanOcrText('A train travels 240 km in 3 hours'), 'A train travels 240 km in 3 hours');
  assert.equal(cleanOcrText('plaukia 9 kmih greičiu'), 'plaukia 9 km/h greičiu');
  assert.equal(cleanOcrText('Duoti skaičiai: 3. 7. 7.2.11.'), 'Duoti skaičiai: 3, 7, 7, 2, 11.');
  assert.equal(cleanOcrText('Aprice of 80 is increased by 15%.'), 'A price of 80 is increased by 15 %.');
});
