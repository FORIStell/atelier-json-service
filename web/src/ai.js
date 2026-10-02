// AI tutor: Claude explains a solution, answers follow-up questions and solves what the built-in engine can't
// (including photos of figures). Runs in the browser with the student's own API key, stored only on this device.
const MODEL = 'claude-opus-5-5';
let client = null, clientKey = null;

async function getClient(key) {
  if (!client || clientKey !== key) {
    const { Anthropic } = await import('../vendor/anthropic/anthropic.mjs');
    // a test page may point the app at a local mock server
    const baseURL = globalThis.MATHBOT_AI_BASE || undefined;
    client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, baseURL });
    clientKey = key;
  }
  return client;
}

const SYSTEM = {
  en: `You are the tutor inside MathBot, a math app for high-school students (including the Lithuanian VBE exam) and first-year university students.
Explain like a good teacher: short steps, one idea per step, no filler. Reply in English.
Write math in LaTeX between $...$ (inline) or $$...$$ (on its own line). Do not use other Markdown than **bold** and "- " lists.
When the app's own solution is given, build on it; if you think it is wrong, say so clearly and show the right way.
When you solve a problem, end with one line that starts with "Answer:".
If a photo is unreadable, say what you can and cannot read and ask the student to type the unclear part.`,
  lt: `Tu esi MathBot – matematikos programėlės moksleiviams (taip pat ruošiantis VBE) ir pirmų kursų studentams – mokytojas.
Aiškink kaip geras mokytojas: trumpi žingsniai, viena mintis žingsnyje, be tuščių žodžių. Atsakyk lietuviškai, taisyklinga kalba.
Matematiką rašyk LaTeX tarp $...$ (eilutėje) arba $$...$$ (atskiroje eilutėje). Iš Markdown naudok tik **paryškinimą** ir „- “ sąrašus.
Jei pateiktas programėlės sprendimas, remkis juo; jei manai, kad jis klaidingas, aiškiai tai pasakyk ir parodyk teisingą būdą.
Kai sprendi uždavinį, pabaik viena eilute, prasidedančia „Atsakymas:“.
Jei nuotrauka neįskaitoma, pasakyk, ką gali ir ko negali perskaityti, ir paprašyk mokinio įrašyti neaiškią dalį.`,
};

// the first message about a solved problem: the problem, the app's answer and steps, and the photo if there is one
export function contextMessage({ problem, answer, steps = [], image = null, question, lang = 'en' }) {
  const lt = lang === 'lt';
  const parts = [];
  if (problem) parts.push(`${lt ? 'Uždavinys' : 'Problem'}: ${problem}`);
  if (answer) parts.push(`${lt ? 'Programėlės atsakymas' : "The app's answer"}: ${answer}`);
  if (steps.length) parts.push(`${lt ? 'Programėlės žingsniai' : "The app's steps"}:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`);
  parts.push(question || (lt ? 'Paaiškink šį sprendimą paprasčiau.' : 'Explain this solution more simply.'));
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.type, data: image.data } });
  content.push({ type: 'text', text: parts.join('\n\n') });
  return { role: 'user', content };
}

export function userMessage(text, image = null) {
  if (!image) return { role: 'user', content: text };
  return { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: image.type, data: image.data } }, { type: 'text', text }] };
}

// one streamed reply; messages is the whole conversation so far (append-only). Returns the assistant message to keep.
export async function ask({ key, lang = 'en', messages, onText, signal, effort = 'high' }) {
  const c = await getClient(key);
  const stream = c.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // a declined request is re-run on a fallback model instead of failing
    output_config: { effort },
    cache_control: { type: 'ephemeral' }, // follow-up questions reuse the cached conversation
    system: SYSTEM[lang] || SYSTEM.en,
    messages,
  }, { signal });
  stream.on('text', (delta, snapshot) => onText && onText(snapshot));
  const msg = await stream.finalMessage();
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (msg.stop_reason === 'refusal') {
    const err = new Error(lang === 'lt' ? 'Šio klausimo AI atsakyti negali.' : 'The AI can’t answer this one.');
    err.kind = 'refusal';
    throw err;
  }
  return { reply: { role: 'assistant', content: msg.content }, text, truncated: msg.stop_reason === 'max_tokens' };
}

// a short, friendly message for an API error
export function errorText(e, lang = 'en') {
  const lt = lang === 'lt';
  if (e && e.kind === 'refusal') return e.message;
  const s = e && e.status;
  if (e && e.name === 'APIUserAbortError') return lt ? 'Sustabdyta.' : 'Stopped.';
  if (s === 401) return lt ? 'API raktas neteisingas. Patikrinkite jį nustatymuose.' : 'The API key is not valid. Check it in the AI settings.';
  if (s === 403) return lt ? 'Šis API raktas neturi leidimo.' : 'This API key is not allowed to do that.';
  if (s === 429) return lt ? 'Per daug užklausų. Palaukite minutę ir bandykite vėl.' : 'Too many requests. Wait a minute and try again.';
  if (s === 400 && /credit|balance|billing/i.test(e.message || '')) return lt ? 'API paskyroje nebeliko kreditų.' : 'Your API account is out of credit.';
  if (s >= 500) return lt ? 'AI paslauga šiuo metu neveikia. Bandykite vėliau.' : 'The AI service is having trouble. Try again later.';
  if (!navigator.onLine || (e && e.name === 'APIConnectionError')) return lt ? 'Nėra interneto ryšio.' : 'No internet connection.';
  return (lt ? 'Klaida: ' : 'Error: ') + ((e && e.message) || String(e));
}

// AI text -> HTML: $$..$$ and $..$ as math, **bold**, "- " lists, paragraphs
export function renderAI(text, texHTML, escapeHtml) {
  const out = [];
  let list = false;
  const inline = (s) => s.split(/(\$\$[^$]+\$\$|\$[^$\n]+\$)/g).map((p) => {
    if (/^\$\$[^$]+\$\$$/.test(p)) return texHTML(p.slice(2, -2), true);
    if (/^\$[^$\n]+\$$/.test(p)) return texHTML(p.slice(1, -1), false);
    return escapeHtml(p).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  }).join('');
  const blocks = String(text).replace(/\\\[([\s\S]+?)\\\]/g, (m, x) => `$$${x}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (m, x) => `$${x}$`)
    .replace(/\$\$([\s\S]+?)\$\$/g, (m, x) => `\n$$${x.replace(/\n/g, ' ')}$$\n`).split('\n');
  for (const raw of blocks) {
    const line = raw.trim();
    const li = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (!line) continue;
    if (/^\$\$[^$]+\$\$$/.test(line)) out.push(`<div class="ai-math">${texHTML(line.slice(2, -2), true)}</div>`);
    else if (/^#+\s/.test(line)) out.push(`<p><b>${inline(line.replace(/^#+\s/, ''))}</b></p>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}

// a picture as base64 JPEG for the API (at most ~1.5 megapixels)
export function imageForAI(src, crop) {
  const sw = src.naturalWidth || src.videoWidth || src.width, sh = src.naturalHeight || src.videoHeight || src.height;
  const c = crop || { x: 0, y: 0, w: sw, h: sh };
  const k = Math.min(1, 1568 / Math.max(c.w, c.h));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(c.w * k)); cv.height = Math.max(1, Math.round(c.h * k));
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(src, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  return { type: 'image/jpeg', data: cv.toDataURL('image/jpeg', 0.88).split(',')[1], url: cv.toDataURL('image/jpeg', 0.6) };
}
