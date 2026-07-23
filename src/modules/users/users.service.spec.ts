import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { FIRESTORE } from '../../database/firebase.provider';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function mockDoc(data: Record<string, any> | null, exists = true) {
  return {
    exists,
    id: 'mock-doc-id',
    data: () => data,
  };
}

function mockCollection(docResult: any, empty = false, docs: any[] = []) {
  return {
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(docResult),
      set: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    }),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ empty, docs, size: docs.length }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;
  let firestoreMock: Record<string, any>;

  beforeEach(async () => {
    // Create Firestore mock that returns different collections
    firestoreMock = {
      collection: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: FIRESTORE, useValue: firestoreMock },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ── parseJsonField (tested via getProfile) ──────────────────────────────

  describe('parseJsonField behavior (tested through getProfile)', () => {
    it('should parse valid JSON strings into arrays', async () => {
      const profileData = { id: 'user1', nombreCompleto: 'Test User', email: 'test@test.com' };
      const profilingData = {
        tiposDiscapacidad: '["autismo","discapacidad_visual"]',
        necesidades: '["comunicacion","movilidad"]',
        historialEducacion: '["escuela_regular","educacion_especial"]',
        historialTerapia: '["terapia_ocupacional","fonoaudiologia"]',
        metasActuales: '["mejorar_comunicacion"]',
        areasApoyo: '["familia","terapeutas"]',
        modosComunicacion: '["lenguaje_señas","aac"]',
        necesidadesMovilidad: '["silla_ruedas"]',
        accesoTecnologia: '["tablet","computadora"]',
        zonasPreferidas: '["centro","norte"]',
        severidadDiscapacidad: 'moderada',
        etapaVida: 'adulto',
        preocupacionesActuales: 'some concerns',
        nivelApoyo: 'medio',
      };

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData)))
        .mockReturnValueOnce(mockCollection(null, false, [{ data: () => profilingData }]));

      const result: any = await service.getProfile('user1');

      // All array fields should be parsed from JSON strings to actual arrays
      expect(result.perfilNecesidades.tiposDiscapacidad).toEqual(['autismo', 'discapacidad_visual']);
      expect(result.perfilNecesidades.necesidades).toEqual(['comunicacion', 'movilidad']);
      expect(result.perfilNecesidades.historialEducacion).toEqual(['escuela_regular', 'educacion_especial']);
      expect(result.perfilNecesidades.historialTerapia).toEqual(['terapia_ocupacional', 'fonoaudiologia']);
      expect(result.perfilNecesidades.metasActuales).toEqual(['mejorar_comunicacion']);
      expect(result.perfilNecesidades.areasApoyo).toEqual(['familia', 'terapeutas']);
      expect(result.perfilNecesidades.modosComunicacion).toEqual(['lenguaje_señas', 'aac']);
      expect(result.perfilNecesidades.necesidadesMovilidad).toEqual(['silla_ruedas']);
      expect(result.perfilNecesidades.accesoTecnologia).toEqual(['tablet', 'computadora']);
      expect(result.perfilNecesidades.zonasPreferidas).toEqual(['centro', 'norte']);
    });

    it('should return original string if JSON is malformed (not crash)', async () => {
      const profileData = { id: 'user2', nombreCompleto: 'Bad Data User' };
      const profilingData = {
        tiposDiscapacidad: 'not-valid-json[[',
        necesidades: '{broken',
        historialEducacion: undefined,
        historialTerapia: null,
        metasActuales: '[]',
        areasApoyo: '',
        modosComunicacion: undefined,
        necesidadesMovilidad: null,
        accesoTecnologia: '[]',
        zonasPreferidas: undefined,
      };

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData)))
        .mockReturnValueOnce(mockCollection(null, false, [{ data: () => profilingData }]));

      const result: any = await service.getProfile('user2');

      // Malformed JSON strings should be returned as-is (not crash)
      expect(result.perfilNecesidades.tiposDiscapacidad).toBe('not-valid-json[[');
      expect(result.perfilNecesidades.necesidades).toBe('{broken');

      // Already-parsed values (undefined, null) should pass through
      expect(result.perfilNecesidades.historialEducacion).toBeUndefined();
      expect(result.perfilNecesidades.historialTerapia).toBeNull();
      expect(result.perfilNecesidades.modosComunicacion).toBeUndefined();
      expect(result.perfilNecesidades.zonasPreferidas).toBeUndefined();

      // Valid JSON strings should still be parsed
      expect(result.perfilNecesidades.metasActuales).toEqual([]);
      expect(result.perfilNecesidades.accesoTecnologia).toEqual([]);

      // Empty string is not valid JSON, should be returned as-is
      expect(result.perfilNecesidades.areasApoyo).toBe('');
    });

    it('should handle already-parsed arrays (not strings) gracefully', async () => {
      const profileData = { id: 'user3', nombreCompleto: 'Array User' };
      const profilingData = {
        tiposDiscapacidad: ['autismo', 'discapacidad_visual'], // already array
        necesidades: ['comunicacion'], // already array
        historialEducacion: ['escuela'], // already array
        historialTerapia: [], // empty array
        metasActuales: ['meta1'],
        areasApoyo: ['area1'],
        modosComunicacion: ['señas'],
        necesidadesMovilidad: ['silla'],
        accesoTecnologia: ['tablet'],
        zonasPreferidas: ['centro'],
      };

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData)))
        .mockReturnValueOnce(mockCollection(null, false, [{ data: () => profilingData }]));

      const result: any = await service.getProfile('user3');

      // Already arrays should pass through unchanged
      expect(result.perfilNecesidades.tiposDiscapacidad).toEqual(['autismo', 'discapacidad_visual']);
      expect(result.perfilNecesidades.necesidades).toEqual(['comunicacion']);
      expect(result.perfilNecesidades.historialEducacion).toEqual(['escuela']);
      expect(result.perfilNecesidades.historialTerapia).toEqual([]);
      expect(result.perfilNecesidades.metasActuales).toEqual(['meta1']);
      expect(result.perfilNecesidades.areasApoyo).toEqual(['area1']);
      expect(result.perfilNecesidades.modosComunicacion).toEqual(['señas']);
      expect(result.perfilNecesidades.necesidadesMovilidad).toEqual(['silla']);
      expect(result.perfilNecesidades.accesoTecnologia).toEqual(['tablet']);
      expect(result.perfilNecesidades.zonasPreferidas).toEqual(['centro']);
    });
  });

  // ── getProfile ──────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('should throw NotFoundException if user profile does not exist', async () => {
      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(null, false)));

      await expect(service.getProfile('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should return profiling as null if no profiling data exists', async () => {
      const profileData = { id: 'user4', nombreCompleto: 'No Profiling' };

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData)))
        .mockReturnValueOnce(mockCollection(null, true)); // empty profiling

      const result: any = await service.getProfile('user4');

      // Note: profileData.id ('user4') overwrites doc.id via spread
      expect(result.id).toBe('user4');
      expect(result.nombreCompleto).toBe('No Profiling');
      expect(result.perfilNecesidades).toBeNull();
    });

    it('should return full profile with parsed profiling data', async () => {
      const profileData = {
        id: 'user5', nombreCompleto: 'Full User', email: 'full@test.com',
        ciudad: 'CDMX', estado: 'Mexico', rol: 'user',
      };
      const profilingData = {
        tiposDiscapacidad: '["autismo"]',
        severidadDiscapacidad: 'leve',
        modosComunicacion: '["verbal"]',
        necesidadesMovilidad: '[]',
        accesoTecnologia: '["celular"]',
        zonasPreferidas: '["sur"]',
        necesidades: '["apoyo_emocional"]',
        metasActuales: '["integracion_social"]',
        areasApoyo: '["trabajo"]',
        historialEducacion: '["preescolar"]',
        historialTerapia: '["psicologia"]',
        etapaVida: 'adulto',
        preocupacionesActuales: 'ansiedad',
        nivelApoyo: 'alto',
      };

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData)))
        .mockReturnValueOnce(mockCollection(null, false, [{ data: () => profilingData }]));

      const result: any = await service.getProfile('user5');

      // Profile fields
      expect(result.nombreCompleto).toBe('Full User');
      expect(result.email).toBe('full@test.com');
      expect(result.ciudad).toBe('CDMX');

      // Profiling fields parsed correctly
      expect(result.perfilNecesidades.tiposDiscapacidad).toEqual(['autismo']);
      expect(result.perfilNecesidades.severidadDiscapacidad).toBe('leve');
      expect(result.perfilNecesidades.modosComunicacion).toEqual(['verbal']);
      expect(result.perfilNecesidades.necesidades).toEqual(['apoyo_emocional']);
      expect(result.perfilNecesidades.metasActuales).toEqual(['integracion_social']);
      expect(result.perfilNecesidades.areasApoyo).toEqual(['trabajo']);
      expect(result.perfilNecesidades.historialEducacion).toEqual(['preescolar']);
      expect(result.perfilNecesidades.historialTerapia).toEqual(['psicologia']);
      expect(result.perfilNecesidades.etapaVida).toBe('adulto');
      expect(result.perfilNecesidades.preocupacionesActuales).toBe('ansiedad');
      expect(result.perfilNecesidades.nivelApoyo).toBe('alto');
    });
  });

  // ── saveProfilingData ──────────────────────────────────────────────────

  describe('saveProfilingData', () => {
    it('should save all fields including new ones (historialEducacion, historialTerapia)', async () => {
      const mockDocRef = {
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      };

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        doc: jest.fn().mockReturnValue(mockDocRef),
      });

      const data = {
        tiposDiscapacidad: ['autismo'],
        modosComunicacion: ['señas'],
        necesidadesMovilidad: ['silla'],
        accesoTecnologia: ['tablet'],
        zonasPreferidas: ['centro'],
        necesidades: ['comunicacion'],
        metasActuales: ['integracion'],
        areasApoyo: ['familia'],
        historialEducacion: ['escuela_regular'],
        historialTerapia: ['terapia_ocupacional'],
        etapaVida: 'adulto',
        preocupacionesActuales: 'ansiedad',
        nivelApoyo: 'medio',
      };

      await service.saveProfilingData('user1', data);

      // Verify doc.set was called (new record)
      expect(mockDocRef.set).toHaveBeenCalledTimes(1);
      const payload = mockDocRef.set.mock.calls[0][0];

      // Verify all array fields are JSON stringified
      expect(JSON.parse(payload.tiposDiscapacidad)).toEqual(['autismo']);
      expect(JSON.parse(payload.necesidades)).toEqual(['comunicacion']);
      expect(JSON.parse(payload.historialEducacion)).toEqual(['escuela_regular']);
      expect(JSON.parse(payload.historialTerapia)).toEqual(['terapia_ocupacional']);
      expect(JSON.parse(payload.metasActuales)).toEqual(['integracion']);
      expect(JSON.parse(payload.areasApoyo)).toEqual(['familia']);

      // Verify string fields are passed as-is
      expect(payload.etapaVida).toBe('adulto');
      expect(payload.preocupacionesActuales).toBe('ansiedad');
      expect(payload.nivelApoyo).toBe('medio');
    });

    it('should update existing profiling record', async () => {
      const existingDoc = { id: 'existing-id', data: () => ({ usuarioId: 'user1' }) };
      const mockDocRef = {
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      };

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: [existingDoc] }),
        doc: jest.fn().mockReturnValue(mockDocRef),
      });

      const data = {
        tiposDiscapacidad: ['nuevo_tipo'],
        historialEducacion: ['universidad'],
        historialTerapia: ['nueva_terapia'],
      };

      await service.saveProfilingData('user1', data);

      // Should call update instead of set
      expect(mockDocRef.update).toHaveBeenCalledTimes(1);
      expect(mockDocRef.set).not.toHaveBeenCalled();

      const payload = mockDocRef.update.mock.calls[0][0];
      expect(JSON.parse(payload.historialEducacion)).toEqual(['universidad']);
      expect(JSON.parse(payload.historialTerapia)).toEqual(['nueva_terapia']);
    });
  });

  // ── updateAvatar ────────────────────────────────────────────────────────

  describe('updateAvatar', () => {
    it('should update Firestore and return success message when DB write succeeds', async () => {
      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc({ id: 'user1' })),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      })

      const avatarUrl = 'https://storage.googleapis.com/raices-499122.appspot.com/avatars/abc-123.jpg'
      const result = await service.updateAvatar('user1', avatarUrl)

      expect(firestoreMock.collection).toHaveBeenCalledWith('perfiles')
      expect(mockDocRef.update).toHaveBeenCalledWith({ urlAvatar: avatarUrl })
      expect(result).toEqual({
        mensaje: 'Avatar actualizado correctamente',
        urlAvatar: avatarUrl,
      })
    })

    it('should catch Firestore error and return partial success with URL', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc(null)),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockRejectedValue(new Error('Firestore write denied')),
        delete: jest.fn().mockResolvedValue(undefined),
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      })

      const avatarUrl = 'https://storage.googleapis.com/raices-499122.appspot.com/avatars/abc-123.jpg'
      const result = await service.updateAvatar('user1', avatarUrl)

      expect(mockDocRef.update).toHaveBeenCalledWith({ urlAvatar: avatarUrl })
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error al guardar avatarUrl en Firestore:',
        expect.any(Error),
      )
      expect(result).toEqual({
        exito: true,
        urlAvatar: avatarUrl,
        mensaje: 'Imagen subida, fallo actualización en BD',
      })

      consoleSpy.mockRestore()
    })
  })
});
