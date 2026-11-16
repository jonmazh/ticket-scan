/**
 * Normalización CONSERVADORA de nombres de producto para agrupar.
 * Ignora: mayúsculas, acentos, espacios extra, puntuación irrelevante y
 * diferencias de formato en las unidades ("1 L" = "1L" = "1 litro").
 * NO elimina palabras: "leche entera" y "leche semidesnatada" siguen siendo
 * distintos, y "1L" y "1,5L" también.
 */

const UNIT_ALIASES: [RegExp, string][] = [
  [/^(l|lt|lts|ltr|ltrs|litro|litros)$/, 'l'],
  [/^(ml|mls|mililitro|mililitros)$/, 'ml'],
  [/^(cl|cls|centilitro|centilitros)$/, 'cl'],
  [/^(kg|kgs|kilo|kilos|kilogramo|kilogramos)$/, 'kg'],
  [/^(g|gr|grs|gramo|gramos)$/, 'g'],
  [/^(ud|uds|u|un|unid|unidad|unidades)$/, 'ud'],
];

function canonicalUnit(u: string): string | null {
  for (const [re, canon] of UNIT_ALIASES) if (re.test(u)) return canon;
  return null;
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeProductName(name: string): string {
  let s = stripAccents(name.toLowerCase());
  // Unifica separador decimal dentro de números: 1,5 -> 1.5
  s = s.replace(/(\d)[,.](\d)/g, '$1.$2');
  // Sustituye la puntuación por espacios (conserva el punto decimal y el %)
  s = s.replace(/[^a-z0-9.%\s]/g, ' ');
  s = s.replace(/(^|[^\d])\.|\.(?!\d)/g, '$1 ');
  s = s.replace(/\s+/g, ' ').trim();

  // Une número + unidad: "1 l" -> "1l", "500 gr" -> "500g", "1.5 litros" -> "1.5l"
  const tokens = s.split(' ');
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const attached = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(t);
    if (attached) {
      const unit = canonicalUnit(attached[2]);
      out.push(unit ? `${attached[1]}${unit}` : t);
      continue;
    }
    if (/^\d+(?:\.\d+)?$/.test(t) && i + 1 < tokens.length) {
      const unit = canonicalUnit(tokens[i + 1]);
      if (unit) {
        out.push(`${t}${unit}`);
        i++;
        continue;
      }
    }
    if (t) out.push(t);
  }
  return out.join(' ').trim();
}

/** Nombre legible a partir de un nombre en mayúsculas del ticket. */
export function prettifyProductName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (!trimmed) return trimmed;
  const letters = trimmed.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '');
  if (!letters || upper.length / letters.length < 0.8) return trimmed;
  const lower = trimmed.toLowerCase().replace(/(\d)l\b/g, '$1L');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Clave de búsqueda: minúsculas sin acentos. */
export function searchKey(s: string): string {
  return stripAccents(s.toLowerCase()).replace(/\s+/g, ' ').trim();
}
