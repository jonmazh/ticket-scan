import { KEYWORDS, KNOWN_MERCHANTS, MONTHS_ES, letterCount } from './patterns';

/**
 * Detección de la información general del ticket: fecha, hora, establecimiento,
 * dirección, CIF/NIF y número de ticket del comercio.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validDate(y: number, m: number, d: number, today: Date): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  if (y < 2000 || y > today.getFullYear() + 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function normalizeYear(y: string): number {
  const n = parseInt(y, 10);
  return y.length === 2 ? 2000 + n : n;
}

/** Busca todas las fechas de una línea. */
export function findDatesInLine(line: string, today: Date): string[] {
  const found: string[] = [];
  const dmy = /(^|[^\d])(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = dmy.exec(line))) {
    const d = validDate(normalizeYear(m[4]), parseInt(m[3], 10), parseInt(m[2], 10), today);
    if (d) found.push(d);
  }
  const ymd = /(^|[^\d])(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?!\d)/g;
  while ((m = ymd.exec(line))) {
    const d = validDate(parseInt(m[2], 10), parseInt(m[3], 10), parseInt(m[4], 10), today);
    if (d) found.push(d);
  }
  const text = /(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?\s*(?:de\s+)?(\d{4})/gi;
  while ((m = text.exec(line))) {
    const month = MONTHS_ES[m[2].toLowerCase()];
    const d = validDate(parseInt(m[3], 10), month, parseInt(m[1], 10), today);
    if (d) found.push(d);
  }
  return found;
}

export function findTimeInLine(line: string): string | null {
  const re = /(^|[^\d])([01]?\d|2[0-3])[:.h]([0-5]\d)(?::[0-5]\d)?(?!\d|[.,]\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    // Evita confundir importes "12.50" con horas: exige ":" o "h", o la palabra hora en la línea
    const sep = line.charAt(m.index + m[1].length + m[2].length);
    if (sep === ':' || sep === 'h' || /hora/i.test(line)) {
      return `${pad(parseInt(m[2], 10))}:${m[3]}`;
    }
  }
  return null;
}

export function detectDateTime(lines: string[], today: Date): { date: string | null; time: string | null; dateLine: number } {
  let best: { date: string; score: number; line: number } | null = null;
  lines.forEach((line, i) => {
    const dates = findDatesInLine(line, today);
    for (const d of dates) {
      let score = 1;
      if (/fecha|date|f\.\s*emisi/i.test(line)) score += 3;
      if (findTimeInLine(line)) score += 2;
      if (/caduc|validez|v[aá]lido\s+hasta|vence|devoluci/i.test(line)) score -= 4;
      if (!best || score > best.score) best = { date: d, score, line: i };
    }
  });
  const chosen = best as { date: string; score: number; line: number } | null;
  let time: string | null = null;
  if (chosen) time = findTimeInLine(lines[chosen.line]);
  if (!time) {
    for (const line of lines) {
      if (/hora|\d{1,2}:\d{2}/i.test(line) && !/horario/i.test(line)) {
        time = findTimeInLine(line);
        if (time) break;
      }
    }
  }
  return { date: chosen?.date ?? null, time, dateLine: chosen?.line ?? -1 };
}

const TAX_ID_RE =
  /\b(?:C\.?\s?I\.?\s?F\.?|N\.?\s?I\.?\s?F\.?|N\.?\s?I\.?\s?E\.?)\s*[:.-]?\s*(?:ES)?\s*([A-Z]\s?-?\s?\d{7}\s?-?\s?[0-9A-J]|\d{8}\s?-?\s?[A-Z]|[XYZ]\d{7}[A-Z])\b/i;
const BARE_CIF_RE = /\b(?:ES)?([ABCDEFGHJNPQRSUVW]-?\d{7}[0-9A-J])\b/;

export function detectTaxId(lines: string[]): string {
  for (const line of lines) {
    const m = TAX_ID_RE.exec(line);
    if (m) return m[1].replace(/[\s-]/g, '').toUpperCase();
  }
  for (const line of lines) {
    const m = BARE_CIF_RE.exec(line);
    if (m) return m[1].replace(/-/g, '').toUpperCase();
  }
  return '';
}

export function looksLikePhone(line: string): boolean {
  return /\b(tel[eé]?f?(ono)?|tlf|tfno|fax|m[oó]vil)\b/i.test(line) || /(^|\D)[6789]\d{2}[\s.]?\d{2,3}[\s.]?\d{2,3}[\s.]?\d{0,2}(\D|$)/.test(line.replace(/\d+[.,]\d{2}(\s|$)/g, ''));
}

const ADDRESS_RE =
  /\b(c\/|c\.\/|calle|cl\.?|avda\.?|av\.|avenida|plaza|pza\.?|pl\.|paseo|p[ºo]\.?|ctra\.?|carretera|camino|ronda|traves[ií]a|pol[ií]gono|pol\.|centro\s+comercial|c\.\s?c\.|local|urb\.?|barrio)\b|\b\d{5}\b\s+[A-Za-zÀ-ÿ]/i;

export function detectAddress(lines: string[]): string {
  const parts: string[] = [];
  for (const line of lines.slice(0, 12)) {
    if (ADDRESS_RE.test(line) && !looksLikePhone(line) && letterCount(line) >= 3) {
      parts.push(line.replace(/\s+/g, ' ').trim());
      if (parts.length === 2) break;
    }
  }
  return parts.join(', ');
}

const MERCHANT_STOPWORDS =
  /\b(factura|simplificada|ticket|tique|recibo|bienvenid|cliente|fecha|hora|caja|cajer|n[º°]|copia|duplicado|www|http|@|iva|cif|nif|tel|tlf|total)\b/i;

function titleCase(s: string): string {
  const small = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 's.a.', 's.l.', 'sa', 'sl']);
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      if (/^(s\.?a\.?|s\.?l\.?|s\.?l\.?u\.?|s\.?a\.?u\.?)$/.test(w)) return w.toUpperCase();
      if (i > 0 && small.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

export function detectMerchant(lines: string[]): { name: string; confident: boolean } {
  const head = lines.slice(0, 10).join('\n');
  for (const k of KNOWN_MERCHANTS) if (k.re.test(head)) return { name: k.name, confident: true };
  const all = lines.join('\n');
  for (const k of KNOWN_MERCHANTS) if (k.re.test(all)) return { name: k.name, confident: true };

  for (const line of lines.slice(0, 6)) {
    const clean = line.replace(/[^A-Za-zÀ-ÿ0-9&'.,\- ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length < 3) continue;
    const letters = letterCount(clean);
    if (letters < 3 || letters / clean.replace(/\s/g, '').length < 0.6) continue;
    if (MERCHANT_STOPWORDS.test(clean) || ADDRESS_RE.test(clean) || looksLikePhone(clean)) continue;
    if (/\d+[.,]\d{2}\s*$/.test(clean)) continue;
    return { name: titleCase(clean).slice(0, 60), confident: false };
  }
  return { name: '', confident: false };
}

const REFERENCE_RE =
  /\b(?:n[º°o]?\.?\s*(?:de\s+)?)?(?:factura(?:\s+simplificada)?|fra\.?|ticket|tiquet|tique|doc(?:umento)?|operaci[oó]n|recibo|transacci[oó]n|n[º°]\s*op)\s*(?:n[º°o]?\.?|num\.?|n[uú]mero|nr\.?)?\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-/.]{2,}[A-Z0-9])/i;

export function detectMerchantReference(lines: string[]): string {
  for (const line of lines) {
    if (KEYWORDS.payment.test(line) && !/factura|ticket/i.test(line)) continue;
    const m = REFERENCE_RE.exec(line);
    if (!m) continue;
    const ref = m[1];
    if (!/\d/.test(ref)) continue;
    if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(ref)) continue; // es una fecha
    if (/^\d+[.,]\d{2}$/.test(ref)) continue; // es un importe
    return ref;
  }
  return '';
}
