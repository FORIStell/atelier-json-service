// Clean up what the printed-text reader returns for a word problem.
export function cleanOcrText(t) {
  return String(t || '')
    .replace(/(\p{L})[-‐‑]\s*\n\s*(\p{Ll})/gu, '$1$2') // word split over two lines
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/(?<=\p{L})\|(?=\p{L})/gu, 'l')
    .replace(/(?<=\d)[oO](?=\d)/g, '0').replace(/(\d) (?:96|9b|0\/0|°\/o)(?=[\s.,;:!?)]|$)/g, '$1 %').replace(/(\d) 90(?=[.,;:!?)]|$)/g, '$1 %').replace(/(\d) ?€/g, '$1 €').replace(/(\d) ?%/g, '$1 %')
    .replace(/^\s*\d{1,2}\s*[.)]\s+(?=\p{Lu})/u, '') // "3. Kostiumo ..." -> drop the task number
    .replace(/\s{2,}/g, ' ').trim();
}

// a word-likeness score, to pick the better of two readings
export function textScore(t) {
  const ws = String(t).split(/\s+/).filter(Boolean);
  return ws.filter((w) => /^[\p{L}]{2,}[.,;:!?]?$/u.test(w) || /^\d+([.,]\d+)?[.,;:!?%€]?$/u.test(w)).length - 0.5 * ws.filter((w) => /[^\p{L}\d.,;:!?%€()\-–+=/·×÷"'²³]/u.test(w)).length;
}
