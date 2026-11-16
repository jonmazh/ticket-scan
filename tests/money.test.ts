import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  formatQuantity,
  lineTotalFrom,
  parseAmount,
  parseQuantity,
  sumCents,
  unitPriceFrom,
  centsToInput,
} from '@/utils/money';

describe('parseAmount (importes europeos)', () => {
  it.each([
    ['1,20', 120],
    ['12,50', 1250],
    ['1.234,56', 123456],
    ['0,99', 99],
    ['12.00', 1200],
    ['12.50', 1250],
    ['1.234', 123400],
    ['1,20 €', 120],
    ['1,20€', 120],
    ['€ 3,10', 310],
    ['EUR 4,5', 450],
    ['1,234.56', 123456],
    ['12,00-', -1200],
    ['-3,10', -310],
    ['(2,00)', -200],
    ['−0,50', -50],
    ['7', 700],
  ])('"%s" -> %i céntimos', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,2,3', '1,250', '12.5.0', '1.23.45', '--1,00'])('rechaza "%s"', (input) => {
    expect(parseAmount(input)).toBeNull();
  });

  it('en modo estricto no acepta enteros ni miles sin decimales', () => {
    expect(parseAmount('12', { allowInteger: false })).toBeNull();
    expect(parseAmount('1.234', { allowInteger: false })).toBeNull();
    expect(parseAmount('1.234,00', { allowInteger: false })).toBe(123400);
  });
});

describe('parseQuantity', () => {
  it('reconoce cantidades enteras y decimales', () => {
    expect(parseQuantity('2')).toBe(2);
    expect(parseQuantity('1,250')).toBe(1.25);
    expect(parseQuantity('0.5')).toBe(0.5);
    expect(parseQuantity('0,375')).toBe(0.375);
  });
  it('rechaza valores no válidos', () => {
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('1,2345')).toBeNull();
  });
});

describe('formato', () => {
  it('formatea importes en español con punto de miles y coma decimal', () => {
    expect(formatMoney(125050)).toBe('1.250,50\u00a0€');
    expect(formatMoney(120)).toBe('1,20\u00a0€');
    expect(formatMoney(5)).toBe('0,05\u00a0€');
    expect(formatMoney(-1200)).toBe('-12,00\u00a0€');
    expect(formatMoney(123456789)).toBe('1.234.567,89\u00a0€');
  });
  it('formatea cantidades', () => {
    expect(formatQuantity(1.25)).toBe('1,25');
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(0.3333333)).toBe('0,333');
  });
  it('convierte céntimos a texto editable', () => {
    expect(centsToInput(120)).toBe('1,20');
    expect(centsToInput(-5)).toBe('-0,05');
    expect(centsToInput(null)).toBe('');
  });
});

describe('cálculos exactos en céntimos', () => {
  it('importe de línea a partir de cantidad y precio', () => {
    expect(lineTotalFrom(2, 120)).toBe(240);
    expect(lineTotalFrom(1.25, 240)).toBe(300);
    expect(lineTotalFrom(0.333, 299)).toBe(100);
  });
  it('precio unitario a partir del importe', () => {
    expect(unitPriceFrom(300, 1.25)).toBe(240);
    expect(unitPriceFrom(240, 2)).toBe(120);
    expect(unitPriceFrom(240, 0)).toBe(240);
  });
  it('suma sin errores de coma flotante', () => {
    // 0.1 + 0.2 en euros
    expect(sumCents([10, 20])).toBe(30);
    expect(sumCents(Array(100).fill(1))).toBe(100);
  });
});
