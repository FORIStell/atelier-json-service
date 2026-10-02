// AI tutor: the messages sent to Claude and how its answers are shown (no network here)
import test from 'node:test';
import assert from 'node:assert/strict';
import { contextMessage, userMessage, renderAI, errorText } from '../web/src/ai.js';

globalThis.navigator ??= { onLine: true };
const tex = (t, d) => `<m${d ? ' d' : ''}>${t}</m>`, esc = (s) => s.replace(/</g, '&lt;');
test('the first message carries the problem, the app answer, the steps and the photo', () => {
  const m = contextMessage({ problem: 'x^2=4', answer: 'x = -2, x = 2', steps: ['Take the root'], image: { type: 'image/jpeg', data: 'AAA' }, question: 'Why?', lang: 'en' });
  assert.equal(m.role, 'user');
  assert.equal(m.content[0].type, 'image');
  assert.equal(m.content[0].source.data, 'AAA');
  assert.match(m.content[1].text, /Problem: x\^2=4[\s\S]*answer: x = -2, x = 2[\s\S]*1\. Take the root[\s\S]*Why\?$/);
  assert.match(contextMessage({ problem: 'p', lang: 'lt' }).content[0].text, /Uždavinys: p[\s\S]*Paaiškink/);
  assert.equal(userMessage('hi').content, 'hi');
});
test('answers render math, bold and lists, and escape HTML', () => {
  const h = renderAI('Step **one**: $x=2$\n\n$$x^2=4$$\n- a <b>\n- $y$', tex, esc);
  assert.match(h, /<p>Step <b>one<\/b>: <m>x=2<\/m><\/p>/);
  assert.match(h, /<div class="ai-math"><m d>x\^2=4<\/m><\/div>/);
  assert.match(h, /<ul><li>a &lt;b><\/li><li><m>y<\/m><\/li><\/ul>/);
  assert.match(renderAI('\\[a+b\\] and \\(c\\)', tex, esc), /<m d>a\+b<\/m>[\s\S]*<m>c<\/m>/);
});
test('friendly error messages', () => {
  assert.match(errorText({ status: 401 }, 'en'), /API key is not valid/);
  assert.match(errorText({ status: 429 }, 'lt'), /Per daug/);
  assert.match(errorText({ status: 529 }, 'en'), /trouble/);
  assert.match(errorText({ kind: 'refusal', message: 'no' }, 'en'), /^no$/);
});
