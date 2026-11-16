/**
 * Paso 1: limpieza del texto OCR.
 * Corrige confusiones típicas del OCR en contextos numéricos sin tocar el resto.
 */

const LOOKALIKE_DIGITS: Record<string, string> = { O: '0', o: '0', D: '0', l: '1', I: '1', '|': '1', S: '5', B: '8' };

function fixNumericLookalikes(line: string): string {
  // Letras parecidas a dígitos rodeadas de dígitos o separadores decimales: 1,2O -> 1,20 ; 1O,50 -> 10,50
  let s = line.replace(/(\d[.,]?)([OoDlI|SB])(?=[.,]?\d)/g, (_m, a: string, b: string) => a + LOOKALIKE_DIGITS[b]);
  s = s.replace(/(\d[.,]\d)([OoD])(?![A-Za-z])/g, (_m, a: string) => `${a}0`);
  return s;
}

const HAS_DATE_OR_TIME_CONTEXT = /hora|fecha|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i;

export interface CleanedLine {
  text: string;
  /** true si se ha reparado un importe dudoso (p. ej. sin coma decimal): conviene revisarlo. */
  repaired: boolean;
}

/**
 * Limpia una línea. Además intenta reparar dos errores frecuentes del OCR en
 * la columna de importes (siempre marcándolo como "reparado" para revisión):
 *  - "TOMATES PERA        215"  -> "2,15" (se perdió la coma; solo si va alineado en columna)
 *  - "PLATANOS           1:69"  -> "1,69" (coma leída como dos puntos)
 */
export function cleanLineDetailed(raw: string): CleanedLine {
  let repaired = false;
  let s = raw.normalize('NFC');
  s = s
    .replace(/[\t\u00a0\u2007\u202f]/g, '   ')
    .replace(/[‚¸]/g, ',')
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/×/g, 'x');
  // Guiones repetidos delante de un número: "--0,50" -> "-0,50"
  s = s.replace(/-{2,}(?=\s*\d)/g, '-').replace(/(^|\s)-\s+(?=\d+[.,]\d{2}\b)/g, '$1-');
  s = fixNumericLookalikes(s);
  // "1 ,20" "1, 20" "1 . 20" -> "1,20" (solo si quedan exactamente 2 decimales)
  s = s.replace(/(\d)\s*([.,])\s+(\d{2})(?!\d)/g, '$1$2$3');
  s = s.replace(/(\d)\s+([.,])(\d{2})(?!\d)/g, '$1$2$3');

  const hasLetters = /[A-Za-zÀ-ÿ]{2}/.test(s);
  const hasPrice = /\d[.,]\d{2}(?!\d)/.test(s);
  if (hasLetters && !HAS_DATE_OR_TIME_CONTEXT.test(s)) {
    // Coma leída como ":" o ";" en el importe final
    const colon = /(\s{2,}|\s)(\d{1,4})[:;](\d{2})(\s*€?)\s*$/.exec(s);
    if (colon) {
      s = s.slice(0, colon.index) + `${colon[1]}${colon[2]},${colon[3]}${colon[4]}`;
      repaired = true;
    } else if (!hasPrice) {
      // Importe en columna sin coma decimal: "NOMBRE      215" -> 2,15
      const noComma = /^(.*[A-Za-zÀ-ÿ].*?)\s{3,}(-?)(\d{3,4})(-?)\s*€?\s*$/.exec(s);
      if (noComma) {
        const digits = noComma[3];
        s = `${noComma[1]}   ${noComma[2]}${digits.slice(0, -2)},${digits.slice(-2)}${noComma[4]}`;
        repaired = true;
      }
    }
  }

  // "1,20 €" pegado o separado: lo dejamos separado del número
  s = s.replace(/(\d)\s*(€|EUR\b)/gi, '$1 €');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return { text: s, repaired };
}

export function cleanLine(raw: string): string {
  return cleanLineDetailed(raw).text;
}

export function isSeparatorLine(s: string): boolean {
  return s.length > 0 && /^[\s\-=_*.~#:+]+$/.test(s);
}

export function splitLinesDetailed(text: string): CleanedLine[] {
  return text.replace(/\r\n?/g, '\n').split('\n').map(cleanLineDetailed);
}

export function splitLines(text: string): string[] {
  return splitLinesDetailed(text).map((l) => l.text);
}
