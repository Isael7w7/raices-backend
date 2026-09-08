import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { RoutesService } from './routes.service';
import { FIRESTORE } from '../../database/firebase.provider';
import { COLECCIONES } from '../../database/firestore.constants';

// ─── Mock helpers ────────────────────────────────────────────────────────────

type DocData = Record<string, any>;

/** Ref con snapshot propio: `ref.get()` devuelve { exists, id, data, ref }. */
function crearRef(id: string, data: DocData | null, exists = true) {
  const ref: any = {
    id,
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  ref.get = jest.fn().mockResolvedValue({ exists, id, data: () => data, ref });
  return ref;
}

/** Doc de snapshot para resultados de query (where/get). */
function snapDoc(id: string, data: DocData, ref?: any) {
  return { exists: true, id, data: () => data, ref: ref ?? { id } };
}

/**
 * Mock de Firestore enfocado a RoutesService:
 * - colecciones `rutasDesarrollo` y `pasosRuta`
 * - batch para eliminarRuta
 */
function buildFirestore(opts: {
  rutas?: Record<string, DocData>;
  /** Paso inexistente simulado al pedir ese id */
  rutaInexistente?: string;
  pasos?: { id: string; data: DocData }[];
  pasoInexistente?: string;
  nuevaRutaId?: string;
  nuevoPasoId?: string;
} = {}) {
  const rutasRefs: Record<string, any> = {};
  for (const [id, data] of Object.entries(opts.rutas ?? {})) {
    rutasRefs[id] = crearRef(id, data);
  }

  const pasosRefs: Record<string, any> = {};
  for (const p of opts.pasos ?? []) {
    pasosRefs[p.id] = crearRef(p.id, p.data);
  }

  const rutasDocs = Object.entries(opts.rutas ?? {}).map(([id, data]) =>
    snapDoc(id, data, rutasRefs[id]),
  );
  const pasosDocs = (opts.pasos ?? []).map(p =>
    snapDoc(p.id, p.data, pasosRefs[p.id]),
  );

  const nuevaRutaRef = crearRef(opts.nuevaRutaId ?? 'nueva-ruta', null, false);
  const nuevoPasoRef = crearRef(opts.nuevoPasoId ?? 'nuevo-paso', null, false);

  const rutasCol = {
    doc: jest.fn((id?: string) => {
      if (!id) return nuevaRutaRef;
      if (opts.rutaInexistente === id) return crearRef(id, null, false);
      return rutasRefs[id];
    }),
    where: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      empty: rutasDocs.length === 0,
      size: rutasDocs.length,
      docs: rutasDocs,
    }),
  };

  const pasosCol = {
    doc: jest.fn((id?: string) => {
      if (!id) return nuevoPasoRef;
      if (opts.pasoInexistente === id) return crearRef(id, null, false);
      return pasosRefs[id];
    }),
    where: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      empty: pasosDocs.length === 0,
      size: pasosDocs.length,
      docs: pasosDocs,
    }),
  };

  const batch = {
    delete: jest.fn().mockReturnThis(),
    commit: jest.fn().mockResolvedValue(undefined),
  };

  const firestoreMock = {
    collection: jest.fn((nombre: string) => {
      if (nombre === COLECCIONES.rutasDesarrollo) return rutasCol;
      if (nombre === COLECCIONES.pasosRuta) return pasosCol;
      throw new Error(`Colección no mockeada: ${nombre}`);
    }),
    batch: jest.fn(() => batch),
  };

  return { firestoreMock, rutasRefs, pasosRefs, rutasCol, pasosCol, nuevaRutaRef, nuevoPasoRef, batch };
}

async function crearService(firestoreMock: any) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [RoutesService, { provide: FIRESTORE, useValue: firestoreMock }],
  }).compile();
  return module.get<RoutesService>(RoutesService);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('RoutesService', () => {
  const rutaBase: DocData = {
    usuarioId: 'user1',
    areaInteres: 'educacion',
    nombre: 'Ruta de prueba',
    descripcion: '',
    metaFinal: '',
    estado: 'activa',
    prioridad: 'media',
    totalPasos: 0,
    pasosCompletados: 0,
    porcentajeProgreso: 0,
    fechaCreacion: '2026-01-01T00:00:00.000Z',
  };

  // ── crearRuta ───────────────────────────────────────────────────────────

  describe('crearRuta', () => {
    it('should create a ruta with defaults and generated id', async () => {
      const fx = buildFirestore({ nuevaRutaId: 'ruta-nueva' });
      const service = await crearService(fx.firestoreMock);

      const result: any = await service.crearRuta('user1', {
        areaInteres: 'educacion',
        nombre: 'Mi ruta',
      } as any);

      expect(fx.nuevaRutaRef.set).toHaveBeenCalledTimes(1);
      const guardado = fx.nuevaRutaRef.set.mock.calls[0][0];
      expect(guardado).toMatchObject({
        id: 'ruta-nueva',
        usuarioId: 'user1',
        areaInteres: 'educacion',
        nombre: 'Mi ruta',
        estado: 'activa',
        prioridad: 'media',
        totalPasos: 0,
        pasosCompletados: 0,
        porcentajeProgreso: 0,
      });
      expect(result.id).toBe('ruta-nueva');
    });

    it('should keep provided prioridad and fechaLimite', async () => {
      const fx = buildFirestore();
      const service = await crearService(fx.firestoreMock);

      await service.crearRuta('user1', {
        areaInteres: 'educacion',
        nombre: 'Mi ruta',
        prioridad: 'alta',
        fechaLimite: '2026-12-31',
      } as any);

      const guardado = fx.nuevaRutaRef.set.mock.calls[0][0];
      expect(guardado.prioridad).toBe('alta');
      expect(guardado.fechaLimite).toBe('2026-12-31');
    });
  });

  // ── listarRutas ─────────────────────────────────────────────────────────

  describe('listarRutas', () => {
    it('should filter by estado and sort by prioridad (alta first)', async () => {
      const fx = buildFirestore({
        rutas: {
          'ruta-media': { ...rutaBase, prioridad: 'media', fechaCreacion: '2026-02-01' },
          'ruta-alta': { ...rutaBase, prioridad: 'alta', fechaCreacion: '2026-01-01' },
          'ruta-pausada': { ...rutaBase, estado: 'pausada', prioridad: 'baja' },
        },
      });
      const service = await crearService(fx.firestoreMock);

      const result: any[] = await service.listarRutas('user1', { estado: 'activa' });

      expect(result.map(r => r.id)).toEqual(['ruta-alta', 'ruta-media']);
    });

    it('should filter by areaInteres and break prioridad ties by fechaCreacion desc', async () => {
      const fx = buildFirestore({
        rutas: {
          'ruta-a': { ...rutaBase, prioridad: 'alta', fechaCreacion: '2026-01-01', areaInteres: 'educacion' },
          'ruta-b': { ...rutaBase, prioridad: 'alta', fechaCreacion: '2026-03-01', areaInteres: 'educacion' },
          'ruta-c': { ...rutaBase, prioridad: 'alta', fechaCreacion: '2026-05-01', areaInteres: 'empleo' },
        },
      });
      const service = await crearService(fx.firestoreMock);

      const result: any[] = await service.listarRutas('user1', { areaInteres: 'educacion' });

      expect(result.map(r => r.id)).toEqual(['ruta-b', 'ruta-a']);
    });
  });

  // ── obtenerRuta ─────────────────────────────────────────────────────────

  describe('obtenerRuta', () => {
    it('should throw NotFoundException when ruta does not exist', async () => {
      const fx = buildFirestore({ rutaInexistente: 'no-existe' });
      const service = await crearService(fx.firestoreMock);

      await expect(service.obtenerRuta('user1', 'no-existe')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when ruta belongs to another user', async () => {
      const fx = buildFirestore({ rutas: { ruta1: { ...rutaBase, usuarioId: 'otro' } } });
      const service = await crearService(fx.firestoreMock);

      await expect(service.obtenerRuta('user1', 'ruta1')).rejects.toThrow(ForbiddenException);
    });

    it('should return the ruta with pasos sorted by orden in memory (no composite index needed)', async () => {
      // El mock devuelve los pasos desordenados a propósito: el servicio debe ordenarlos
      const fx = buildFirestore({
        rutas: { ruta1: { ...rutaBase, totalPasos: 3 } },
        pasos: [
          { id: 'p3', data: { rutaId: 'ruta1', titulo: 'Tercero', orden: 3, completado: true } },
          { id: 'p1', data: { rutaId: 'ruta1', titulo: 'Primero', orden: 1, completado: false } },
          { id: 'p2', data: { rutaId: 'ruta1', titulo: 'Segundo', orden: 2, completado: false } },
        ],
      });
      const service = await crearService(fx.firestoreMock);

      const result: any = await service.obtenerRuta('user1', 'ruta1');

      expect(result.pasos.map((p: any) => p.id)).toEqual(['p1', 'p2', 'p3']);
    });
  });

  // ── actualizarRuta ──────────────────────────────────────────────────────

  describe('actualizarRuta', () => {
    it('should apply only provided fields and set fechaActualizacion', async () => {
      const fx = buildFirestore({ rutas: { ruta1: { ...rutaBase } } });
      const service = await crearService(fx.firestoreMock);

      const result: any = await service.actualizarRuta('user1', 'ruta1', {
        nombre: 'Nuevo nombre',
        prioridad: 'alta',
      } as any);

      expect(fx.rutasRefs['ruta1'].update).toHaveBeenCalledTimes(1);
      const carga = fx.rutasRefs['ruta1'].update.mock.calls[0][0];
      expect(carga).toMatchObject({ nombre: 'Nuevo nombre', prioridad: 'alta' });
      expect(carga.fechaActualizacion).toBeDefined();
      expect(result.nombre).toBe('Nuevo nombre');
      expect(result.estado).toBe('activa'); // campo no enviado se conserva
    });

    it('should not write when the payload is empty', async () => {
      const fx = buildFirestore({ rutas: { ruta1: { ...rutaBase } } });
      const service = await crearService(fx.firestoreMock);

      await service.actualizarRuta('user1', 'ruta1', {} as any);

      expect(fx.rutasRefs['ruta1'].update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when ruta does not exist', async () => {
      const fx = buildFirestore({ rutaInexistente: 'no-existe' });
      const service = await crearService(fx.firestoreMock);

      await expect(service.actualizarRuta('user1', 'no-existe', { nombre: 'x' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ── eliminarRuta ────────────────────────────────────────────────────────

  describe('eliminarRuta', () => {
    it('should delete pasos and the ruta in a single batch', async () => {
      const fx = buildFirestore({
        rutas: { ruta1: { ...rutaBase } },
        pasos: [
          { id: 'p1', data: { rutaId: 'ruta1', titulo: 'Uno', orden: 1 } },
          { id: 'p2', data: { rutaId: 'ruta1', titulo: 'Dos', orden: 2 } },
        ],
      });
      const service = await crearService(fx.firestoreMock);

      const result = await service.eliminarRuta('user1', 'ruta1');

      expect(result).toEqual({ eliminado: true });
      expect(fx.batch.delete).toHaveBeenCalledTimes(3); // 2 pasos + ruta
      expect(fx.batch.delete).toHaveBeenCalledWith(fx.pasosRefs['p1']);
      expect(fx.batch.delete).toHaveBeenCalledWith(fx.pasosRefs['p2']);
      expect(fx.batch.delete).toHaveBeenCalledWith(fx.rutasRefs['ruta1']);
      expect(fx.batch.commit).toHaveBeenCalledTimes(1);
    });

    it('should throw ForbiddenException when ruta belongs to another user', async () => {
      const fx = buildFirestore({ rutas: { ruta1: { ...rutaBase, usuarioId: 'otro' } } });
      const service = await crearService(fx.firestoreMock);

      await expect(service.eliminarRuta('user1', 'ruta1')).rejects.toThrow(ForbiddenException);
      expect(fx.batch.commit).not.toHaveBeenCalled();
    });
  });

  // ── agregarPaso ─────────────────────────────────────────────────────────

  describe('agregarPaso', () => {
    it('should assign orden = max(orden) + 1 computed in memory', async () => {
      // Pasos con órdenes desordenados: el máximo real es 3, el nuevo debe ser 4
      const fx = buildFirestore({
        rutas: { ruta1: { ...rutaBase, totalPasos: 3 } },
        pasos: [
          { id: 'p1', data: { rutaId: 'ruta1', titulo: 'Uno', orden: 3, completado: false } },
          { id: 'p2', data: { rutaId: 'ruta1', titulo: 'Dos', orden: 1, completado: false } },
          { id: 'p3', data: { rutaId: 'ruta1', titulo: 'Tres', orden: 2, completado: false } },
        ],
        nuevoPasoId: 'p4',
      });
      const service = await crearService(fx.firestoreMock);

      const result: any = await service.agregarPaso('user1', 'ruta1', { titulo: 'Nuevo paso' } as any);

      const guardado = fx.nuevoPasoRef.set.mock.calls[0][0];
      expect(guardado).toMatchObject({ id: 'p4', rutaId: 'ruta1', titulo: 'Nuevo paso', orden: 4, completado: false });
      expect(result.orden).toBe(4);
    });

    it('should coerce totalPasos to number when incrementing (regresión TS2365)', async () => {
      const fx = buildFirestore({
        rutas: { ruta1: { ...rutaBase, totalPasos: 2 } },
        pasos: [{ id: 'p1', data: { rutaId: 'ruta1', titulo: 'Uno', orden: 1 } }],
      });
      const service = await crearService(fx.firestoreMock);

      await service.agregarPaso('user1', 'ruta1', { titulo: 'Otro paso' } as any);

      const carga = fx.rutasRefs['ruta1'].update.mock.calls[0][0];
      expect(carga.totalPasos).toBe(3);
      expect(carga.fechaActualizacion).toBeDefined();
    });

    it('should respect a provided orden from the dto', async () => {
      const fx = buildFirestore({
        rutas: { ruta1: { ...rutaBase, totalPasos: 1 } },
        pasos: [{ id: 'p1', data: { rutaId: 'ruta1', titulo: 'Uno', orden: 1 } }],
        nuevoPasoId: 'p2',
      });
      const service = await crearService(fx.firestoreMock);

      const result: any = await service.agregarPaso('user1', 'ruta1', { titulo: 'Insertado', orden: 1 } as any);

      expect(result.orden).toBe(1);
    });

    it('should throw ForbiddenException when ruta belongs to another user', async () => {
      const fx = buildFirestore({ rutas: { ruta1: { ...rutaBase, usuarioId: 'otro' } } });
      const service = await crearService(fx.firestoreMock);

      await expect(service.agregarPaso('user1', 'ruta1', { titulo: 'x' } as any)).rejects.toThrow(ForbiddenException);
      expect(fx.nuevoPasoRef.set).not.toHaveBeenCalled();
    });
  });

  // ── completarPaso ───────────────────────────────────────────────────────

  describe('completarPaso', () => {
    const rutaConPasos = (completadosPrevios: number) => ({
      rutas: {
        ruta1: { ...rutaBase, totalPasos: 4, pasosCompletados: completadosPrevios },
      },
      pasos: [
        { id: 'p1', data: { rutaId: 'ruta1', titulo: 'Uno', orden: 1, completado: false } },
        { id: 'p2', data: { rutaId: 'ruta1', titulo: 'Dos', orden: 2, completado: false } },
        { id: 'p3', data: { rutaId: 'ruta1', titulo: 'Tres', orden: 3, completado: false } },
        { id: 'p4', data: { rutaId: 'ruta1', titulo: 'Cuatro', orden: 4, completado: false } },
      ],
    });

    it('should mark the paso completed and recompute route progress (25%)', async () => {
      const fx = buildFirestore(rutaConPasos(0));
      const service = await crearService(fx.firestoreMock);

      const result: any = await service.completarPaso('user1', 'ruta1', 'p1');

      expect(fx.pasosRefs['p1'].update).toHaveBeenCalledWith(
        expect.objectContaining({ completado: true }),
      );
      const cargaRuta = fx.rutasRefs['ruta1'].update.mock.calls[0][0];
      expect(cargaRuta.pasosCompletados).toBe(1);
      expect(cargaRuta.porcentajeProgreso).toBe(25);
      expect(cargaRuta.estado).toBe('activa'); // 25% < 100%
      expect(result.completado).toBe(true);
    });

    it('should set estado to completada when progress reaches 100%', async () => {
      const fx = buildFirestore({
        rutas: { ruta1: { ...rutaBase, totalPasos: 1, pasosCompletados: 0 } },
        pasos: [{ id: 'p1', data: { rutaId: 'ruta1', titulo: 'Único', orden: 1, completado: false } }],
      });
      const service = await crearService(fx.firestoreMock);

      await service.completarPaso('user1', 'ruta1', 'p1');

      const cargaRuta = fx.rutasRefs['ruta1'].update.mock.calls[0][0];
      expect(cargaRuta.porcentajeProgreso).toBe(100);
      expect(cargaRuta.estado).toBe('completada');
    });

    it('should return the paso unchanged if it was already completed (no writes)', async () => {
      const fx = buildFirestore({
        rutas: { ruta1: { ...rutaBase } },
        pasos: [{ id: 'p1', data: { rutaId: 'ruta1', titulo: 'Uno', orden: 1, completado: true, fechaCompletado: '2026-01-02' } }],
      });
      const service = await crearService(fx.firestoreMock);

      const result: any = await service.completarPaso('user1', 'ruta1', 'p1');

      expect(fx.pasosRefs['p1'].update).not.toHaveBeenCalled();
      expect(fx.rutasRefs['ruta1'].update).not.toHaveBeenCalled();
      expect(result.completado).toBe(true);
      expect(result.fechaCompletado).toBe('2026-01-02');
    });

    it('should throw BadRequestException when the paso belongs to another ruta', async () => {
      const fx = buildFirestore({
        rutas: { ruta1: { ...rutaBase } },
        pasos: [{ id: 'p1', data: { rutaId: 'otra-ruta', titulo: 'Ajeno', orden: 1 } }],
      });
      const service = await crearService(fx.firestoreMock);

      await expect(service.completarPaso('user1', 'ruta1', 'p1')).rejects.toThrow(BadRequestException);
      expect(fx.pasosRefs['p1'].update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the paso does not exist', async () => {
      const fx = buildFirestore({ rutas: { ruta1: { ...rutaBase } }, pasoInexistente: 'no-existe' });
      const service = await crearService(fx.firestoreMock);

      await expect(service.completarPaso('user1', 'ruta1', 'no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ── descompletarPaso ────────────────────────────────────────────────────

  describe('descompletarPaso', () => {
    it('should unmark the paso, recompute progress and set estado back to activa', async () => {
      const fx = buildFirestore({
        rutas: { ruta1: { ...rutaBase, estado: 'completada', totalPasos: 2, pasosCompletados: 2, porcentajeProgreso: 100 } },
        pasos: [
          { id: 'p1', data: { rutaId: 'ruta1', titulo: 'Uno', orden: 1, completado: true, fechaCompletado: '2026-01-02' } },
          { id: 'p2', data: { rutaId: 'ruta1', titulo: 'Dos', orden: 2, completado: true, fechaCompletado: '2026-01-03' } },
        ],
      });
      const service = await crearService(fx.firestoreMock);

      const result: any = await service.descompletarPaso('user1', 'ruta1', 'p1');

      expect(fx.pasosRefs['p1'].update).toHaveBeenCalledWith({
        completado: false,
        fechaCompletado: null,
      });
      const cargaRuta = fx.rutasRefs['ruta1'].update.mock.calls[0][0];
      expect(cargaRuta.pasosCompletados).toBe(1);
      expect(cargaRuta.porcentajeProgreso).toBe(50);
      expect(cargaRuta.estado).toBe('activa');
      expect(result.completado).toBe(false);
      expect(result.fechaCompletado).toBeNull();
    });

    it('should return the paso unchanged if it was not completed (no writes)', async () => {
      const fx = buildFirestore({
        rutas: { ruta1: { ...rutaBase } },
        pasos: [{ id: 'p1', data: { rutaId: 'ruta1', titulo: 'Uno', orden: 1, completado: false } }],
      });
      const service = await crearService(fx.firestoreMock);

      const result: any = await service.descompletarPaso('user1', 'ruta1', 'p1');

      expect(fx.pasosRefs['p1'].update).not.toHaveBeenCalled();
      expect(result.completado).toBe(false);
    });
  });

  // ── resumenRutas ────────────────────────────────────────────────────────

  describe('resumenRutas', () => {
    it('should count estados and compute average progress', async () => {
      const fx = buildFirestore({
        rutas: {
          'ruta-1': { ...rutaBase, estado: 'activa', porcentajeProgreso: 50 },
          'ruta-2': { ...rutaBase, estado: 'completada', porcentajeProgreso: 100 },
          'ruta-3': { ...rutaBase, estado: 'pausada', porcentajeProgreso: 10 },
        },
      });
      const service = await crearService(fx.firestoreMock);

      const result: any = await service.resumenRutas('user1');

      expect(result).toEqual({
        totalRutas: 3,
        rutasActivas: 1,
        rutasCompletadas: 1,
        rutasPausadas: 1,
        progresoPromedio: 53, // round((50+100+10)/3)
      });
    });

    it('should return zeros when the user has no rutas', async () => {
      const fx = buildFirestore({ rutas: {} });
      const service = await crearService(fx.firestoreMock);

      const result: any = await service.resumenRutas('user1');

      expect(result).toEqual({
        totalRutas: 0,
        rutasActivas: 0,
        rutasCompletadas: 0,
        rutasPausadas: 0,
        progresoPromedio: 0,
      });
    });
  });
});
