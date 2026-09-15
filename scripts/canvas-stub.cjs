/**
 * Stub de `canvas` y `pdf-img-convert` para scripts offline (ej. generate-swagger).
 *
 * `canvas` es una dependencia nativa de `pdf-img-convert`
 * (CsfQrService → pdf-img-convert → pdfjs-dist) y puede no estar compilada en
 * el entorno. Para generar el documento OpenAPI no se procesa ningún archivo,
 * así que se resuelven ambos módulos con fachadas vacías.
 *
 * Uso:
 *   NODE_OPTIONS="--require ./scripts/canvas-stub.cjs" npx ts-node --transpile-only scripts/generate-swagger.ts
 */
const Module = require('module')

const stubCanvas = {
  createCanvas: () => ({
    getContext: () => null,
    toBuffer: async () => Buffer.alloc(0),
    width: 0,
    height: 0,
  }),
  registerFont: () => {},
  loadImage: async () => ({}),
  Canvas: {},
  CanvasRenderingContext2D: class {},
}

const stubPdfImgConvert = { convert: async () => [] }

const cargaOriginal = Module._load
Module._load = function stubbedLoad(request, parent, isMain) {
  // Se intercepta pdf-img-convert ANTES de que su grafo ESM cargue canvas,
  // porque el loader ESM nativo no pasa por Module._load.
  if (request === 'pdf-img-convert') return stubPdfImgConvert
  if (request === 'canvas') return stubCanvas
  return cargaOriginal.call(this, request, parent, isMain)
}
