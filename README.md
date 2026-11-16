# TicketScan

Aplicación web progresiva (PWA) **personal** para fotografiar tickets de compra con el iPhone, reconocer sus productos y precios **en el propio dispositivo** y saber cuánto gastas en cada producto, mes a mes.

Sin cuentas, sin servidores, sin analítica: los tickets, las fotografías y el texto reconocido se quedan en el almacenamiento del navegador de tu dispositivo.

---

## Índice

1. [Descripción](#1-descripción)
2. [Funciones](#2-funciones)
3. [Tecnologías](#3-tecnologías)
4. [Requisitos](#4-requisitos)
5. [Instalación local](#5-instalación-local)
6. [Ejecutar en desarrollo](#6-ejecutar-en-desarrollo)
7. [Compilar](#7-compilar)
8. [Pruebas](#8-pruebas)
9. [Cómo funciona el OCR](#9-cómo-funciona-el-ocr)
10. [Base de datos local](#10-base-de-datos-local)
11. [Cómo se guardan las fotografías](#11-cómo-se-guardan-las-fotografías)
12. [Modo sin conexión](#12-modo-sin-conexión)
13. [Copias de seguridad](#13-copias-de-seguridad)
14. [Publicar gratis en Cloudflare Pages](#14-publicar-gratis-en-cloudflare-pages)
15. [Instalar en el iPhone](#15-instalar-en-el-iphone)
16. [Actualizar la aplicación](#16-actualizar-la-aplicación)
17. [Limitaciones conocidas](#17-limitaciones-conocidas)
18. [Estructura del proyecto](#18-estructura-del-proyecto)

---

## 1. Descripción

TicketScan permite:

- Fotografiar un ticket con la cámara (o elegir una foto de la galería).
- Recortarlo, enderezarlo y mejorar su legibilidad.
- Reconocer el texto con OCR **local** (Tesseract.js, español y opcionalmente inglés).
- Extraer productos, cantidades, unidades, precios unitarios, importes, descuentos, IVA, total, fecha, hora, establecimiento, NIF y nº de ticket.
- Revisar y corregir todo antes de guardar.
- Agrupar automáticamente los productos iguales entre tickets y ver cuánto has gastado en cada uno, en qué fechas y en qué tickets.

Ejemplo: con tres tickets (Leche 1,20 / 1,20 / 1,30 €), el producto **Leche** muestra 3 unidades, 3,70 € y el detalle de cada compra con su referencia `TKT-2026-0001`, `TKT-2026-0002`, `TKT-2026-0003`, que se puede pulsar para abrir el ticket y su fotografía original.

## 2. Funciones

| Área | Qué hace |
|---|---|
| **Resumen** | Gasto del periodo, nº de tickets y unidades, comparación con el mes anterior, gráfico de los últimos 6 meses (pulsar un mes lo selecciona), 5 productos con más gasto con su %, últimos tickets con miniatura y acceso rápido para escanear o añadir a mano. |
| **Filtro temporal** | Este mes, mes anterior, últimos 3 y 6 meses, este año, todo el histórico, un mes concreto, un año concreto o un rango de fechas. Es común a Resumen, Tickets y Productos. Siempre se usa la **fecha de compra**, nunca la fecha de registro. |
| **Escáner** | Cámara propia (`getUserMedia`, trasera preferente, cambio de cámara, linterna si existe), alternativa nativa de iOS con `<input type="file" capture="environment">`, galería, repetir foto, cancelar. |
| **Preparación de la imagen** | Detección automática aproximada de los bordes, 4 esquinas arrastrables con **corrección de perspectiva**, rotación, mejora de contraste o blanco y negro adaptativo, vista previa. La foto original **no se modifica**. |
| **OCR + extracción** | Progreso real del motor, pantalla de "Analizando ticket", mensajes de error comprensibles y alternativa manual si falla. |
| **Revisión** | Edición de establecimiento, fecha (marcada como *estimada* si no se reconoció), hora, referencia, total impreso, dirección, NIF, subtotal, líneas (nombre, cantidad, unidad, precio, importe), descuentos/IVA/cargos/devoluciones y observaciones. Recalcula importes al cambiar cantidad o precio. Muestra **suma de líneas vs. total impreso** y avisa si no coinciden, sin corregir nada automáticamente. |
| **Referencias** | `TKT-AAAA-NNNN`, únicas, consecutivas, reinician cada año, nunca se reutilizan aunque se borren tickets y no cambian al editar. |
| **Productos** | Agrupación conservadora, buscador (también por alias), orden por gasto, unidades, recencia o nombre; detalle con histórico y enlace a cada ticket. Renombrar, categoría, **fusionar**, **separar** compras, **mover** una compra a otro producto, crear producto, **alias**. |
| **Tickets** | Historial con miniatura, búsqueda por establecimiento o referencia, filtro por periodo, orden ascendente/descendente; detalle con foto ampliable (pellizcar/doble toque), original y versión ajustada, edición, añadir/eliminar líneas, eliminar ticket (con confirmación), ajustar o sustituir la foto. |
| **Duplicados** | Aviso "Este ticket podría estar ya registrado" si coincide la foto (SHA‑256), es casi idéntica (hash perceptual) o coinciden establecimiento, fecha e importe. Opciones: cancelar, revisar el existente o guardar igualmente. Nunca borra nada. |
| **Copias** | ZIP completo (JSON + fotos originales + ajustadas + miniaturas), importación validada con *sustituir todo* o *añadir sin duplicar*, CSV para Excel en español, recordatorio si hace más de 30 días de la última copia. |
| **Ajustes** | Idioma, moneda, formato de fecha, calidad de fotos, OCR (inglés, mejora por defecto, disposición del texto, preparación sin conexión), gestión de productos, copias, almacenamiento (uso, cuota, persistencia), modo demostración, privacidad y versión. |
| **Modo demostración** | Tickets ficticios en una base de datos **separada** (`ticketscan-demo`), con banner visible. Al desactivarlo se borra y vuelven tus datos reales intactos. |

## 3. Tecnologías

- **React 18 + TypeScript + Vite 6**
- **Tailwind CSS 3** (componentes propios, sin librería de UI pesada) y **lucide-react** para iconos
- **IndexedDB** con **Dexie 4** (`dexie-react-hooks` para consultas en vivo)
- **Tesseract.js 6** (OCR WebAssembly en el navegador), datos de idioma de `@tesseract.js-data/spa` y `/eng`
- **date-fns 4** (fechas en español)
- **fflate** (ZIP de copias de seguridad; ligera)
- **vite-plugin-pwa** (manifest + service worker Workbox)
- **Vitest** + **fake-indexeddb** (pruebas), **ESLint 9**

Decisiones justificadas:

- **Gráficos sin Recharts**: el gráfico mensual es un componente propio muy ligero; evita ~100 KB de JavaScript.
- **Router `react-router-dom` 6**: `npm audit` muestra avisos que afectan al renderizado en servidor (SSR) y a redirecciones con URLs controladas por terceros; TicketScan no usa SSR ni redirige a URLs externas.
- **Rollup en WebAssembly** (`overrides` en `package.json`): en el PC donde se desarrolló, una directiva de *Control de aplicaciones* de Windows bloqueaba el binario nativo de Rollup. La versión WebAssembly oficial (`@rollup/wasm-node`) es idéntica en resultado y también funciona en Cloudflare.

## 4. Requisitos

- **Node.js 20 o superior** (probado con Node 24) y npm.
- Para usarla en el iPhone: iOS 16.4 o superior recomendado, Safari, y la app publicada en **HTTPS** (Cloudflare Pages lo da gratis).

## 5. Instalación local

```bash
npm install
```

`npm install` copia automáticamente los archivos del OCR (worker, núcleo WebAssembly y datos de idioma) desde `node_modules` a `public/ocr` (script `scripts/copy-ocr-assets.mjs`). Esa carpeta no se sube al repositorio: se regenera siempre.

## 6. Ejecutar en desarrollo

```bash
npm run dev
```

Abre `http://localhost:5173`. En `localhost` la cámara funciona en el ordenador. El service worker solo se activa en la versión compilada (`npm run preview`).

Para probar desde el iPhone en la misma red necesitas HTTPS (la cámara integrada lo exige); lo más sencillo es publicar en Cloudflare Pages. Sin HTTPS la app usa la alternativa de la cámara del sistema.

## 7. Compilar

```bash
npm run build
npm run preview
```

La versión de producción queda en `dist/`. `npm run preview` la sirve en `http://localhost:4173` con service worker y con la misma política de seguridad (CSP) que se usa en Cloudflare.

Para regenerar los iconos (opcional): `npm run icons`.

## 8. Pruebas

```bash
npm test
```

Todo de una vez (lint + compilación + pruebas, incluidas las de `dist/`):

```bash
npm run verify
```

97 pruebas en 8 archivos (`tests/`), todas con datos sintéticos:

| Archivo | Cubre |
|---|---|
| `money.test.ts` | Importes europeos (`1,20`, `1.234,56`, `12.00`, `1.234`, `12,00-`, `(2,00)`, `€`), cantidades decimales, formato `1.250,50 €`, cálculo exacto en céntimos |
| `parser.test.ts` | Reglas de línea (nombre+precio, `2 X LECHE 2,40`, `2 X 1,20 2,40`, `2,00 KG X 1,50/KG 3,00`, códigos de IVA), tickets completos de distintos formatos, fecha/hora, establecimiento, NIF, nº de ticket, IVA, descuentos, devoluciones, miles, texto OCR real con errores |
| `grouping.test.ts` | Normalización (mayúsculas, espacios, acentos, unidades), productos parecidos que **no** se agrupan, fusión, separación, asignación manual, alias, renombrado con conflicto |
| `database.test.ts` | Crear, modificar, eliminar, relaciones, referencias por año y sin reutilización, imágenes como Blob, duplicados, validación, **migración v1 → v2** |
| `statistics.test.ts` | El ejemplo de los 3 tickets, total mensual, total por producto, precio medio, periodos, comparación, top 5, total impreso vs calculado |
| `backup.test.ts` | Exportar ZIP, restaurar sustituyendo, importar sin duplicar con renumeración, archivos inválidos, CSV para Excel |
| `ocr.integration.test.ts` | **OCR real**: genera una imagen de ticket y la reconoce con Tesseract y los datos de idioma locales; comprueba productos, fecha y total |
| `pwa.test.ts` | Metadatos iOS, iconos 192/512/maskable/apple-touch, recursos OCR locales, manifest, precarga del service worker (app + OCR), ausencia de analítica |

Además se probó manualmente en el navegador (Chromium) la versión compilada: escaneo con imagen sintética, recorte automático, OCR, revisión, guardado, aviso de duplicado, modo demostración, exportación de copia, aviso de actualización y **OCR con el servidor apagado** (sin conexión).

## 9. Cómo funciona el OCR

1. La foto se reduce a un tamaño seguro para Safari (máx. 2400 px) solo para procesarla.
2. Se recorta/endereza (homografía de 4 puntos), se gira y se mejora el contraste.
3. **Tesseract.js** reconoce el texto en un *Web Worker* dentro del navegador. El worker (`/ocr/worker.min.js`), el núcleo WebAssembly (`/ocr/core/…`) y los idiomas (`/ocr/lang/spa.traineddata.gz`) se sirven **desde el mismo dominio de la app**. No se usa ningún CDN ni servicio externo.
4. El texto pasa por el **motor de extracción** (`src/features/receipt-parser/`), basado en reglas y heurísticas, sin IA externa:

| Módulo | Responsabilidad |
|---|---|
| `cleanText.ts` | Limpieza: confusiones O/0, l/1, comas separadas, guiones, importes en columna sin coma (marcados para revisión) |
| `patterns.ts` | Expresiones y palabras clave (total, IVA, pagos, descuentos…), cadenas conocidas |
| `itemRules.ts` | **Reglas ampliables** de línea de producto: peso (`kg x €/kg`), detalle `2 x 1,20`, `2 X NOMBRE`, columna de cantidad (tipo Mercadona), dos importes, nombre+importe |
| `totals.ts` | Total, subtotal, tabla de IVA, descuentos y devoluciones |
| `metadata.ts` | Fecha, hora, establecimiento, dirección, CIF/NIF, nº de ticket |
| `parseReceipt.ts` | Orquestador: clasifica cada línea, combina líneas de nombre + detalle, calcula confianza y campos a revisar |

Para soportar un formato nuevo de supermercado basta con añadir una regla en `ITEM_RULES` y un test con un ejemplo sintético.

El reconocimiento **no es perfecto**: por eso todo pasa por la pantalla de revisión, las líneas dudosas se marcan y nunca se ajustan datos para que cuadren.

## 10. Base de datos local

IndexedDB mediante Dexie, esquema **versionado** (`src/database/schema.ts`, migraciones en `migrations.ts`):

| Tabla | Contenido |
|---|---|
| `receipts` | Ticket: referencia, establecimiento, fecha `YYYY-MM-DD`, hora, ref. del comercio, moneda, `printedTotalCents`, `calculatedItemsTotalCents`, `adjustmentsTotalCents`, notas, texto OCR, estado, hashes, ids de imágenes, fechas de alta/modificación |
| `receiptItems` | Línea: producto, `rawName` (nombre original, nunca se pierde), `productName`, nombre normalizado, cantidad, unidad, precio unitario y total en céntimos, línea OCR original, confianza, tipo de asignación, fecha de compra |
| `products` / `productAliases` | Productos agrupados y sus nombres alternativos |
| `receiptAdjustments` | Descuentos, IVA, cargos, devoluciones (con signo) |
| `images` | Fotografías como `Blob` (original, ajustada, miniatura) |
| `settings`, `counters` | Ajustes y contador de referencias por año |

- **Dinero en céntimos enteros** (sin errores de coma flotante). Las cantidades admiten decimales.
- **Fechas locales** `YYYY-MM-DD` (sin zona horaria): una compra del 30/11 a las 23:30 nunca cambia de mes.
- Gasto del ticket = total impreso si existe; si no, suma de líneas + ajustes. El gasto por producto suma los importes de sus líneas. El IVA es informativo (ya está incluido en los precios).
- Las imágenes van en su propia tabla para que los listados no carguen fotos completas.

## 11. Cómo se guardan las fotografías

- Como **Blob** en IndexedDB (nunca Base64).
- Se guardan: la **original** tal cual (o comprimida si eliges calidad *Alta*/*Media* en Ajustes), la **ajustada** para OCR (opcional) y una **miniatura** de 320 px.
- Editar el ticket nunca toca las fotos. Sustituir la foto pide confirmación.
- Si el almacenamiento se llena, se muestra un error claro y un aviso en la app. Nunca se borran tickets automáticamente.
- Al guardar el primer ticket se solicita **almacenamiento persistente** (`navigator.storage.persist()`); el navegador puede no concederlo. En Ajustes puedes ver el uso orientativo y volver a solicitarlo.

## 12. Modo sin conexión

El service worker precarga (≈10,5 MB la primera vez):

- HTML, JavaScript, CSS, iconos y manifest.
- Worker del OCR, núcleo WebAssembly (versiones con y sin SIMD) y datos de **español**.

El inglés, si lo activas, se descarga la primera vez que se usa o con el botón **Ajustes › OCR › Preparar uso sin conexión**, y queda en caché.

**Comprobado** con la versión compilada: con el servidor apagado la app abre, muestra los datos y ejecuta el OCR. En Ajustes se indica si el OCR está listo sin conexión; si no lo está y no hay Internet, al escanear aparece una pantalla informativa con la opción de introducir el ticket a mano (la foto se guarda igualmente).

En iPhone: abre la app una vez con conexión después de instalarla (y tras cada actualización) para que se descargue todo.

## 13. Copias de seguridad

En **Ajustes › Copias de seguridad**:

1. **Exportar copia completa (ZIP)** → cuando esté preparada pulsa **Guardar copia**. En el iPhone se abre la hoja de compartir: elige **Guardar en Archivos** (iCloud Drive o "En mi iPhone").
2. **Importar copia**: elige el ZIP. Se valida y se muestra un resumen. Elige:
   - **Añadir sin duplicar**: conserva tus datos y añade los tickets que falten (los que ya existen se omiten; si una referencia ya está ocupada se renumera y se anota la original en Observaciones).
   - **Sustituir todo**: deja exactamente los datos de la copia.
3. **CSV**: historial de tickets, productos agrupados y líneas de compra (UTF‑8 con BOM, `;`, coma decimal).

La app recuerda la fecha de la última copia y avisa si han pasado más de 30 días.

## 14. Publicar gratis en Cloudflare Pages

Guía paso a paso (no hace falta saber programar). Necesitas una cuenta gratuita de **GitHub** y otra de **Cloudflare**.

### A. Subir el proyecto a GitHub

1. Entra en <https://github.com> y crea una cuenta si no la tienes.
2. Pulsa **New repository**. Ponle un nombre (por ejemplo `ticketscan`), márcalo como **Private** si quieres y pulsa **Create repository**.
3. En tu ordenador, abre una terminal en la carpeta del proyecto y ejecuta (sustituye `TU-USUARIO` por tu usuario de GitHub):

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "TicketScan"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/TU-USUARIO/ticketscan.git
```

```bash
git push -u origin main
```

(Alternativa sin terminal: instala **GitHub Desktop**, *Add existing repository* → elige la carpeta → *Publish repository*.)

> Un repositorio privado no hace privada la web publicada: cualquiera con la URL puede abrir la app, pero **no ve tus datos**, que solo están en tu iPhone.

### B. Crear el proyecto en Cloudflare Pages

1. Entra en <https://dash.cloudflare.com> y crea una cuenta gratuita.
2. Menú **Workers & Pages** → **Create** → pestaña **Pages** → **Connect to Git**.
3. Autoriza GitHub y elige el repositorio `ticketscan`.
4. Configuración de compilación:

| Campo | Valor |
|---|---|
| Production branch | `main` |
| Framework preset | `Vite` (o `None`) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(vacío)* |
| Variable de entorno | `NODE_VERSION` = `22` |

5. Pulsa **Save and Deploy**. Tarda 1–3 minutos.
6. Cloudflare te dará una dirección del tipo `https://<nombre-del-proyecto>.pages.dev`. Esa es la URL de tu app.

### C. Verificar el HTTPS

- Abre la dirección: debe empezar por `https://` y Safari muestra el candado. Cloudflare Pages siempre usa HTTPS con certificado gratuito; no hay que configurar nada.
- Comprueba en **Ajustes** de la app que aparece la versión y, tras recargar una vez, "OCR disponible sin conexión".

El archivo `public/_headers` añade cabeceras de seguridad (CSP sin dominios externos, cámara permitida solo para la propia app, sin caché para `sw.js` y `index.html` para que las actualizaciones lleguen).

## 15. Instalar en el iPhone

1. Abre la dirección web de la aplicación con **Safari** (no con Chrome ni otra app).
2. Pulsa el botón **Compartir** (el cuadrado con la flecha hacia arriba).
3. Selecciona **Añadir a pantalla de inicio** (si no aparece, desliza hacia abajo en el menú).
4. Confirma el nombre **TicketScan**.
5. Pulsa **Añadir**.
6. Abre el nuevo icono de la pantalla de inicio. Se abre a pantalla completa, sin barra del navegador.

**Permiso de cámara**

- La primera vez que pulses el botón de la cámara, iOS preguntará si TicketScan puede usar la cámara: pulsa **Permitir**.
- Si lo denegaste: **Ajustes del iPhone › Safari › Cámara** → *Preguntar* o *Permitir*. (En algunas versiones: **Ajustes › Aplicaciones › Safari › Cámara**). Después cierra y vuelve a abrir TicketScan.
- La cámara integrada **requiere HTTPS** y el permiso del usuario. Si no está disponible, la app ofrece la cámara del sistema (**Hacer foto**) y la **Galería**, que siempre funcionan.

**Importante:** tus datos se guardan en el almacenamiento de la app instalada. Si borras el icono o los datos del sitio en Safari, se pierden. Haz copias de seguridad.

## 16. Actualizar la aplicación

1. Cambia el código (o pide los cambios) y súbelos a GitHub (`git add .`, `git commit -m "Cambios"`, `git push`; o *Commit* + *Push* en GitHub Desktop).
2. Cloudflare Pages vuelve a compilar y publicar automáticamente en 1–3 minutos.
3. En el iPhone, abre TicketScan con conexión: aparecerá el aviso **"Hay una nueva versión de TicketScan" → Actualizar**. Tus datos no se tocan.

Si cambias el esquema de la base de datos, añade una versión nueva en `src/database/db.ts` con su migración (nunca modifiques las anteriores) y un test en `tests/database.test.ts`.

## 17. Limitaciones conocidas

- **El OCR no es perfecto.** Tickets arrugados, con poca luz, papel térmico desvaído o tipografías muy pequeñas producen errores. Revisa siempre antes de guardar. Las reglas se han probado con tickets **sintéticos**; con tickets reales de cada cadena puede hacer falta añadir reglas.
- **No probado todavía en un iPhone real** durante el desarrollo: se probó en Chromium (escritorio y vista móvil) y con pruebas automáticas. La cámara integrada no pudo probarse en el entorno de desarrollo (sin cámara); la alternativa de galería/archivo sí.
- La **detección automática de bordes** es aproximada (busca el papel claro sobre fondo más oscuro). Sobre fondo blanco no detecta nada y usa la imagen completa; siempre puedes mover las esquinas.
- La primera ejecución del OCR en el iPhone tarda más (carga ~4 MB de WebAssembly y el idioma). Las siguientes son más rápidas.
- Safari puede borrar los datos de sitios **no instalados** tras unas semanas sin uso. Instalada en la pantalla de inicio el riesgo es mucho menor, pero no nulo: haz copias.
- iOS no siempre concede el almacenamiento persistente; el espacio mostrado es una estimación del navegador.
- Las copias muy grandes (cientos de fotos en calidad original) se generan en memoria; si el iPhone se queda sin memoria, cambia la calidad de fotos a *Alta* o *Media*.
- Los datos **no están cifrados** por la app; dependen del bloqueo del dispositivo. Que la URL sea difícil de adivinar no la hace privada (aunque tus datos nunca están en el servidor).
- La interfaz solo está en español. La moneda se puede cambiar, pero no hay conversión entre monedas.
- Los descuentos se registran a nivel de ticket: el gasto por producto usa el importe bruto de cada línea.

## 18. Estructura del proyecto

```
src/
  app/            App, rutas y proveedores (periodo, ajustes, avisos, confirmaciones, demo)
  components/     layout (cabecera, navegación), common (UI, hoja, visor de imagen), cards, charts, forms
  pages/          Dashboard, Receipts, ReceiptDetail, ReceiptReview, Scan, Products, ProductDetail, Settings
  features/
    camera/       captura, ajuste de imagen, aviso de duplicados
    ocr/          servicio Tesseract.js local y comprobación offline
    receipt-parser/  motor de extracción modular
    products/     selector de producto
  database/       Dexie: esquema versionado y migraciones
  services/       receipt, product, statistics, backup, image, storage, settings, demo
  hooks/, utils/, types/, styles/
public/
  icons/          iconos PWA generados (scripts/generate-icons.mjs)
  _headers        cabeceras de seguridad para Cloudflare Pages
  ocr/            (generado) worker, núcleo WASM e idiomas de Tesseract
scripts/          copia de recursos OCR y generación de iconos
tests/            pruebas Vitest
```

## Privacidad

TicketScan no tiene backend, cuentas, analítica, publicidad ni rastreadores. No envía fotos, tickets ni texto reconocido a ningún sitio. Lo único que se descarga de Internet son los archivos de la propia aplicación. No se registran textos de tickets en la consola.
