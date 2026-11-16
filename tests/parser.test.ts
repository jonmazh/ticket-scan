import { describe, expect, it } from 'vitest';
import { parseReceipt, matchItemLine } from '@/features/receipt-parser';
import { cleanLine } from '@/features/receipt-parser/cleanText';

// Todos los tickets son SINTÉTICOS: establecimientos, direcciones y NIF ficticios.
const TODAY = new Date(2026, 10, 16);

describe('reglas de línea de producto', () => {
  const ctx = { quantityColumn: false };
  it('nombre + importe', () => {
    const m = matchItemLine('LECHE ENTERA 1L 1,20', ctx)!;
    expect(m.name).toBe('LECHE ENTERA 1L');
    expect(m.lineTotalCents).toBe(120);
    expect(m.quantity).toBeNull();
  });
  it('cantidad x nombre + importe', () => {
    const m = matchItemLine('2 X LECHE 2,40', ctx)!;
    expect(m.name).toBe('LECHE');
    expect(m.quantity).toBe(2);
    expect(m.lineTotalCents).toBe(240);
  });
  it('detalle cantidad x precio + importe', () => {
    const m = matchItemLine('2 X 1,20 2,40', ctx)!;
    expect(m.name).toBe('');
    expect(m.quantity).toBe(2);
    expect(m.unitPriceCents).toBe(120);
    expect(m.lineTotalCents).toBe(240);
  });
  it('peso con precio por kg', () => {
    const m = matchItemLine('2,00 KG X 1,50/KG 3,00', ctx)!;
    expect(m.quantity).toBe(2);
    expect(m.unit).toBe('kg');
    expect(m.unitPriceCents).toBe(150);
    expect(m.lineTotalCents).toBe(300);
  });
  it('peso con nombre y €/kg', () => {
    const m = matchItemLine('MANZANAS 1,250 kg x 2,40 €/kg 3,00', ctx)!;
    expect(m.name).toBe('MANZANAS');
    expect(m.quantity).toBe(1.25);
    expect(m.unit).toBe('kg');
    expect(m.unitPriceCents).toBe(240);
    expect(m.lineTotalCents).toBe(300);
  });
  it('no confunde el formato del producto con un peso', () => {
    const m = matchItemLine('AGUA MINERAL 1,5 L 0,60 1,20', ctx)!;
    expect(m.name).toBe('AGUA MINERAL 1,5 L');
    expect(m.quantity).toBe(2);
    expect(m.unitPriceCents).toBe(60);
    expect(m.lineTotalCents).toBe(120);
  });
  it('elimina el código de IVA final', () => {
    const m = matchItemLine('PAN MOLDE 1,50 A', ctx)!;
    expect(m.name).toBe('PAN MOLDE');
    expect(m.lineTotalCents).toBe(150);
  });
  it('limpia confusiones del OCR en números', () => {
    expect(cleanLine('LECHE 1,2O')).toBe('LECHE 1,20');
    expect(cleanLine('PAN 1 ,50')).toBe('PAN 1,50');
  });
});

describe('ticket sencillo (nombre + precio)', () => {
  const text = `
SUPERMERCADO EJEMPLO
C/ Inventada 12, 28000 Madrid
CIF: B12345674
Tel: 910 000 000
FACTURA SIMPLIFICADA: 0001-002-000123
Fecha: 05/11/2026 Hora: 18:42
----------------------------------
LECHE ENTERA 1L        1,20
PAN MOLDE              1,50
HUEVOS L               3,20
----------------------------------
TOTAL                  5,90
TARJETA                5,90
IVA 4%   BASE 5,67  CUOTA 0,23
GRACIAS POR SU VISITA
`;
  const r = parseReceipt(text, { today: TODAY });

  it('extrae los productos', () => {
    expect(r.items.map((i) => i.rawName)).toEqual(['LECHE ENTERA 1L', 'PAN MOLDE', 'HUEVOS L']);
    expect(r.items.map((i) => i.lineTotalCents)).toEqual([120, 150, 320]);
    expect(r.items.every((i) => i.quantity === 1 && i.unit === 'ud')).toBe(true);
  });
  it('extrae total, fecha, hora y establecimiento', () => {
    expect(r.totalCents).toBe(590);
    expect(r.purchaseDate).toBe('2026-11-05');
    expect(r.purchaseTime).toBe('18:42');
    expect(r.merchantName).toBe('Supermercado Ejemplo');
    expect(r.merchantTaxId).toBe('B12345674');
    expect(r.merchantReference).toBe('0001-002-000123');
    expect(r.merchantAddress).toContain('Inventada');
  });
  it('detecta el IVA como informativo', () => {
    expect(r.taxCents).toBe(23);
    const tax = r.adjustments.find((a) => a.type === 'tax')!;
    expect(tax.affectsTotal).toBe(false);
    expect(tax.description).toBe('IVA 4%');
  });
  it('no interpreta teléfono, CIF ni pago como productos', () => {
    expect(r.items).toHaveLength(3);
    expect(r.warnings).not.toContain('El importe de los productos no coincide con el total del ticket.');
  });
});

describe('ticket con columna de cantidad (tipo Mercadona)', () => {
  const text = `
MERCADONA, S.A. A00000000
AVDA. FICTICIA 1
46000 VALENCIA
TELEFONO: 960000000
07/11/2026 10:15  OP: 123456
FACTURA SIMPLIFICADA: 1234-011-765432
Descripción          P. Unit  Importe
1 LECHE SEMIDESNATADA          0,92
2 YOGUR NATURAL         0,55   1,10
1 PLATANO
  0,850 kg   1,99 €/kg         1,69
3 AGUA MINERAL 1,5L     0,45   1,35
TOTAL (€)                      5,06
TARJETA BANCARIA               5,06
IVA     BASE IMPONIBLE (€)   CUOTA (€)
4%      0,88                 0,04
10%     3,71                 0,37
TOTAL   4,59                 0,41
`;
  const r = parseReceipt(text, { today: TODAY });

  it('reconoce el establecimiento conocido', () => {
    expect(r.merchantName).toBe('Mercadona');
  });
  it('separa cantidad, precio unitario e importe', () => {
    const names = r.items.map((i) => i.rawName);
    expect(names).toEqual(['LECHE SEMIDESNATADA', 'YOGUR NATURAL', '1 PLATANO', 'AGUA MINERAL 1,5L']);
    const yogur = r.items[1];
    expect(yogur.quantity).toBe(2);
    expect(yogur.unitPriceCents).toBe(55);
    expect(yogur.lineTotalCents).toBe(110);
    const agua = r.items[3];
    expect(agua.quantity).toBe(3);
    expect(agua.unitPriceCents).toBe(45);
  });
  it('reconoce productos a peso en dos líneas', () => {
    const platano = r.items[2];
    expect(platano.quantity).toBe(0.85);
    expect(platano.unit).toBe('kg');
    expect(platano.unitPriceCents).toBe(199);
    expect(platano.lineTotalCents).toBe(169);
  });
  it('total, fecha e IVA', () => {
    expect(r.totalCents).toBe(506);
    expect(r.purchaseDate).toBe('2026-11-07');
    expect(r.purchaseTime).toBe('10:15');
    expect(r.taxCents).toBe(41);
    expect(r.items.reduce((s, i) => s + i.lineTotalCents, 0)).toBe(506);
  });
});

describe('ticket con detalle de cantidades y descuentos', () => {
  const text = `
FRUTERIA LA HUERTA DEMO
NIF 12345678Z
Ticket nº: T-998877
12-10-2026 19:03
LECHE
2 x 1,20              2,40
MANZANAS
1,250 kg x 2,40 €/kg  3,00
ACEITE OLIVA 1L       8,50
DESCUENTO PROMOCION  -1,00
SUBTOTAL             13,90
TOTAL A PAGAR        12,90
EFECTIVO             20,00
CAMBIO                7,10
`;
  const r = parseReceipt(text, { today: TODAY });

  it('combina nombre y línea de detalle', () => {
    expect(r.items.map((i) => i.rawName)).toEqual(['LECHE', 'MANZANAS', 'ACEITE OLIVA 1L']);
    expect(r.items[0]).toMatchObject({ quantity: 2, unitPriceCents: 120, lineTotalCents: 240, unit: 'ud' });
    expect(r.items[1]).toMatchObject({ quantity: 1.25, unitPriceCents: 240, lineTotalCents: 300, unit: 'kg' });
  });
  it('trata el descuento como ajuste negativo, no como compra', () => {
    const d = r.adjustments.find((a) => a.type === 'discount')!;
    expect(d.amountCents).toBe(-100);
    expect(d.affectsTotal).toBe(true);
    expect(r.items.some((i) => i.lineTotalCents < 0)).toBe(false);
  });
  it('subtotal, total y no confunde efectivo/cambio', () => {
    expect(r.subtotalCents).toBe(1390);
    expect(r.totalCents).toBe(1290);
    expect(r.merchantReference).toBe('T-998877');
    expect(r.merchantTaxId).toBe('12345678Z');
    expect(r.purchaseDate).toBe('2026-10-12');
    expect(r.warnings).not.toContain('El importe de los productos no coincide con el total del ticket.');
  });
});

describe('ticket con formato "cantidad X nombre" e importes con punto', () => {
  const text = `
TIENDA DE PRUEBA SL
2026-09-03 08:15
2 X LECHE 2.40
CAFE MOLIDO 250G 3.99
1 X GALLETAS 1.75
TOTAL EUR 8.14
`;
  const r = parseReceipt(text, { today: TODAY });
  it('extrae cantidades y precios', () => {
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toMatchObject({ rawName: 'LECHE', quantity: 2, unitPriceCents: 120, lineTotalCents: 240 });
    expect(r.items[1]).toMatchObject({ rawName: 'CAFE MOLIDO 250G', lineTotalCents: 399 });
    expect(r.totalCents).toBe(814);
    expect(r.purchaseDate).toBe('2026-09-03');
  });
});

describe('devoluciones e importes grandes', () => {
  const text = `
ELECTRO DEMO
15/08/2026
TELEVISOR 55 PULGADAS 1.234,56
CABLE HDMI 12,99
DEVOLUCION CABLE ANTIGUO -9,99
TOTAL 1.237,56
`;
  const r = parseReceipt(text, { today: TODAY });
  it('reconoce miles y devoluciones', () => {
    expect(r.items.map((i) => i.lineTotalCents)).toEqual([123456, 1299]);
    const refund = r.adjustments.find((a) => a.type === 'refund')!;
    expect(refund.amountCents).toBe(-999);
    expect(r.totalCents).toBe(123756);
  });
});

describe('ticket sin fecha ni total', () => {
  const r = parseReceipt('ALGO RARO\nPRODUCTO X 2,00\n', { today: TODAY });
  it('marca los campos pendientes de revisión', () => {
    expect(r.purchaseDate).toBeNull();
    expect(r.totalCents).toBeNull();
    expect(r.needsReview).toContain('date');
    expect(r.needsReview).toContain('total');
    expect(r.items).toHaveLength(1);
  });
  it('texto vacío no rompe el parser', () => {
    const empty = parseReceipt('', { today: TODAY });
    expect(empty.items).toHaveLength(0);
    expect(empty.needsReview).toContain('items');
  });
});

describe('texto OCR real con errores típicos (capturado en el navegador)', () => {
  // Salida literal de Tesseract sobre un ticket sintético: comas perdidas, ":" por ",", guion largo.
  const ocr =
    'FRUTERIA LA HUERTA DEMO\nNIF 123456787\nTICKET N: T-998877\n\n2-11-2026 19:03\n\nPLATANOS\n\n0,850 kg x 1,99 €/kg   17:69\nTOMATES PERA           215\n3 X AGUA MINERAL 1,51 1,35\n\nDESCUENTO PROMOCION   —-0,50\n\nTOTAL A PAGAR          4,69\nEFECTIVO              10,00\n\nCAMBIO                 531\n';
  const r = parseReceipt(ocr, { today: TODAY });
  it('recupera las líneas dañadas marcándolas para revisión', () => {
    expect(r.items.map((i) => i.rawName)).toEqual(['PLATANOS', 'TOMATES PERA', 'AGUA MINERAL 1,51']);
    expect(r.items[0]).toMatchObject({ quantity: 0.85, unit: 'kg', unitPriceCents: 199, lineTotalCents: 169 });
    expect(r.items[0].confidence).toBeLessThan(0.6);
    expect(r.items[1]).toMatchObject({ lineTotalCents: 215 });
    expect(r.items[1].confidence).toBeLessThan(0.6);
    expect(r.items[2]).toMatchObject({ quantity: 3, lineTotalCents: 135, unitPriceCents: 45 });
    expect(r.needsReview).toContain('items');
  });
  it('reconoce el descuento con guion largo y el total', () => {
    expect(r.adjustments.find((a) => a.type === 'discount')?.amountCents).toBe(-50);
    expect(r.totalCents).toBe(469);
    // 1,69 + 2,15 + 1,35 - 0,50 = 4,69: cuadra con el total
    expect(r.warnings).not.toContain('El importe de los productos no coincide con el total del ticket.');
  });
});

describe('avisa de diferencias sin modificar los datos', () => {
  const r = parseReceipt('TIENDA X\n01/11/2026\nPAN 1,00\nLECHE 1,00\nTOTAL 3,00\n', { today: TODAY });
  it('mantiene el total impreso y avisa', () => {
    expect(r.totalCents).toBe(300);
    expect(r.items.reduce((s, i) => s + i.lineTotalCents, 0)).toBe(200);
    expect(r.warnings).toContain('El importe de los productos no coincide con el total del ticket.');
  });
});
