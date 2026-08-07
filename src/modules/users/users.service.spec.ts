import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { UsersService } from './users.service';
import { FIRESTORE } from '../../database/firebase.provider';
import { getMaxDependientesPorTutor } from '../../database/firestore.constants';
import { StorageService } from '../storage/storage.service';

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
  let storageMock: { delete: jest.Mock };

  beforeEach(async () => {
    // Create Firestore mock that returns different collections
    firestoreMock = {
      collection: jest.fn(),
    };

    storageMock = {
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: FIRESTORE, useValue: firestoreMock },
        { provide: StorageService, useValue: storageMock },
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
      const profilingData: Record<string, unknown> = {
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
      const profilingData: Record<string, unknown> = {
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

    it('should attach institution data for institution users', async () => {
      const profileData = { id: 'inst1', rol: 'institucion', nombreCompleto: 'Centro Test' }
      const instData = {
        nombre: 'Centro Test', categoria: 'funcional',
        descripcion: 'Terapias físicas', telefono: '9999990001', tiposDiscapacidad: ['tea'],
        verificada: true, activa: true,
      }

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData))) // perfil
        .mockReturnValueOnce(mockCollection(null, true)) // profiling vacío
        .mockReturnValueOnce({ // institución canónica (id = UID)
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: true, id: 'inst1', data: () => instData }),
          }),
        })

      const result: any = await service.getProfile('inst1')

      expect(result.institucionId).toBe('inst1')
      expect(result.institucion).not.toBeNull()
      expect(result.institucion.nombre).toBe('Centro Test')
      expect(result.institucion.categoria).toBe('funcional')
      expect(result.institucion.descripcion).toBe('Terapias físicas')
      expect(result.institucion.telefono).toBe('9999990001')
      expect(result.institucion.tiposDiscapacidad).toEqual(['tea'])
      expect(result.institucion.verificada).toBe(true)
    })

    it('should fall back to the institution created by creadoPor for legacy institution users', async () => {
      const profileData = { id: 'legacy-1', rol: 'institucion', nombreCompleto: 'Centro Legacy' }

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData))) // perfil
        .mockReturnValueOnce(mockCollection(null, true)) // profiling vacío
        .mockReturnValueOnce(mockCollection(mockDoc(null, false))) // doc(uid) no existe
        .mockReturnValueOnce(mockCollection(null, false, [
          { id: 'inst-aleatoria', data: () => ({ nombre: 'Centro Legacy', activa: true }) },
        ])) // where creadoPor

      const result: any = await service.getProfile('legacy-1')

      expect(result.institucionId).toBe('inst-aleatoria')
      expect(result.institucion).not.toBeNull()
      expect(result.institucion.nombre).toBe('Centro Legacy')
    })

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
    it('should delete old avatar from Storage and set new one', async () => {
      const oldUrl = 'https://firebasestorage.googleapis.com/v0/b/raices-499122.appspot.com/o/avatars%2Fold-photo.jpg?alt=media&token=tok'
      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc({ id: 'user1', urlAvatar: oldUrl })),
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

      const newAvatarUrl = 'https://firebasestorage.googleapis.com/v0/b/raices-499122.appspot.com/o/avatars%2Fnew-photo.jpg?alt=media&token=tok2'
      const result = await service.updateAvatar('user1', newAvatarUrl)

      expect(storageMock.delete).toHaveBeenCalledWith('avatars/old-photo.jpg')
      expect(mockDocRef.update).toHaveBeenCalledWith({ urlAvatar: newAvatarUrl })
      expect(result).toEqual({ urlAvatar: newAvatarUrl })
    })

    it('should not call storage.delete when user has no previous avatar', async () => {
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

      const avatarUrl = 'https://firebasestorage.googleapis.com/v0/b/raices-499122.appspot.com/o/avatars%2Ffirst.jpg?alt=media&token=tok'
      await service.updateAvatar('user1', avatarUrl)

      expect(storageMock.delete).not.toHaveBeenCalled()
      expect(mockDocRef.update).toHaveBeenCalledWith({ urlAvatar: avatarUrl })
    })

    it('should continue even if old avatar deletion fails', async () => {
      const oldUrl = 'https://firebasestorage.googleapis.com/v0/b/raices-499122.appspot.com/o/avatars%2Fgone.jpg?alt=media&token=tok'
      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc({ id: 'user1', urlAvatar: oldUrl })),
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

      storageMock.delete.mockRejectedValueOnce(new Error('File not found'))

      const newAvatarUrl = 'https://firebasestorage.googleapis.com/v0/b/raices-499122.appspot.com/o/avatars%2Fnew.jpg?alt=media&token=tok2'
      const result = await service.updateAvatar('user1', newAvatarUrl)

      // Storage failed but new avatar is still saved
      expect(mockDocRef.update).toHaveBeenCalledWith({ urlAvatar: newAvatarUrl })
      expect(result).toEqual({ urlAvatar: newAvatarUrl })
    })

    it('should delete the uploaded file and throw when Firestore fails to save the avatar', async () => {
      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc({ id: 'user1' })),
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

      const avatarUrl = 'https://firebasestorage.googleapis.com/v0/b/raices-499122.appspot.com/o/avatars%2Fabc-123.jpg?alt=media&token=tok'

      await expect(service.updateAvatar('user1', avatarUrl)).rejects.toThrow(ServiceUnavailableException)

      expect(mockDocRef.update).toHaveBeenCalledWith({ urlAvatar: avatarUrl })
      // Rollback: el archivo recién subido se elimina para no dejarlo huérfano
      expect(storageMock.delete).toHaveBeenCalledWith('avatars/abc-123.jpg')
    })

    it('should throw NotFoundException when the user does not exist', async () => {
      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc(null, false)),
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

      await expect(service.updateAvatar('ghost-user', 'https://example.com/avatar.jpg')).rejects.toThrow(NotFoundException)
      expect(mockDocRef.update).not.toHaveBeenCalled()
    })
  })

  // ── getDependent ────────────────────────────────────────────────────────

  describe('getDependent', () => {
    it('should return formatted dependiente when found and owned by user', async () => {
      const docData = {
        id: 'dep1', tutorId: 'user1', nombreCompleto: 'María García',
        parentesco: 'hijo', fechaCreacion: '2024-01-01T00:00:00.000Z',
        datosPerfil: JSON.stringify({
          tiposDiscapacidad: ['tea', 'motriz'],
          rangoEdad: '6-12',
          etapaVida: 'infancia',
          notas: 'Requiere acompañamiento',
        }),
      }

      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc(docData)),
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef),
      })

      const result = await service.getDependent('user1', 'dep1')

      expect(result).toEqual({
        id: 'dep1',
        nombreCompleto: 'María García',
        parentesco: 'hijo',
        tiposDiscapacidad: ['tea', 'motriz'],
        rangoEdad: '6-12',
        etapaVida: 'infancia',
        notas: 'Requiere acompañamiento',
        discapacidad: null,
        esCuentaVinculada: false,
        pcdUserId: null,
        features: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true },
        fechaCreacion: '2024-01-01T00:00:00.000Z',
      })
    })

    it('should throw NotFoundException when dependiente does not exist', async () => {
      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc(null, false)),
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef),
      })

      await expect(service.getDependent('user1', 'nonexistent')).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException when dependiente belongs to another user', async () => {
      const docData = {
        id: 'dep2', tutorId: 'other-user', nombreCompleto: 'Otro Hijo',
        parentesco: 'hijo', fechaCreacion: '2024-01-01T00:00:00.000Z',
        datosPerfil: '{}',
      }

      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc(docData)),
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef),
      })

      await expect(service.getDependent('user1', 'dep2')).rejects.toThrow(NotFoundException)
    })

    it('should enrich features and disability data of a linked account from its real profile', async () => {
      const depData = {
        id: 'pcd1', tutorId: 'user1', esCuentaVinculada: true, pcdUserId: 'pcd1',
        nombreCompleto: 'Ana', parentesco: null as string | null, fechaCreacion: '2024-01-01T00:00:00.000Z', datosPerfil: '{}',
      }
      const perfilData = {
        features: { chat: false, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true },
      }
      const extData = {
        usuarioId: 'pcd1', tiposDiscapacidad: '["tea","motriz"]', severidadDiscapacidad: 'moderada', etapaVida: 'adulto',
      }

      firestoreMock.collection
        .mockReturnValueOnce({ // dependiente doc
          doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(depData)) }),
        })
        .mockReturnValueOnce({ // perfil real de la PCD
          doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(perfilData)) }),
        })
        .mockReturnValueOnce({ // perfil extendido de la PCD
          where: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: false, docs: [{ id: 'ext-1', data: () => extData }] }),
        })

      const result: any = await service.getDependent('user1', 'pcd1')

      expect(result.esCuentaVinculada).toBe(true)
      expect(result.pcdUserId).toBe('pcd1')
      expect(result.features.chat).toBe(false)
      expect(result.features.postulaciones).toBe(true)
      expect(result.tiposDiscapacidad).toEqual(['tea', 'motriz'])
      expect(result.discapacidad).toBe('moderada')
      expect(result.etapaVida).toBe('adulto')
    })
  })

  // ── deleteAvatar ────────────────────────────────────────────────────────

  describe('deleteAvatar', () => {
    it('should delete file from Storage and clear urlAvatar in Firestore', async () => {
      const gcsUrl = 'https://firebasestorage.googleapis.com/v0/b/raices-499122.appspot.com/o/avatars%2Fabc-123.jpg?alt=media&token=tok123'
      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc({ id: 'user1', urlAvatar: gcsUrl })),
        update: jest.fn().mockResolvedValue(undefined),
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef),
      })

      const result = await service.deleteAvatar('user1')

      expect(mockDocRef.get).toHaveBeenCalled()
      expect(storageMock.delete).toHaveBeenCalledWith('avatars/abc-123.jpg')
      expect(mockDocRef.update).toHaveBeenCalledWith({ urlAvatar: null })
      expect(result).toBeUndefined()
    })

    it('should clear urlAvatar even when user has no avatar', async () => {
      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc({ id: 'user2' })),
        update: jest.fn().mockResolvedValue(undefined),
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef),
      })

      const result = await service.deleteAvatar('user2')

      expect(storageMock.delete).not.toHaveBeenCalled()
      expect(mockDocRef.update).toHaveBeenCalledWith({ urlAvatar: null })
      expect(result).toBeUndefined()
    })

    it('should throw NotFoundException if user does not exist', async () => {
      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc(null, false)),
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef),
      })

      await expect(service.deleteAvatar('nonexistent')).rejects.toThrow(NotFoundException)
      expect(storageMock.delete).not.toHaveBeenCalled()
    })

    it('should continue even if Storage delete fails (file already gone)', async () => {
      const gcsUrl = 'https://firebasestorage.googleapis.com/v0/b/raices-499122.appspot.com/o/avatars%2Fdeleted.jpg?alt=media&token=tok456'
      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc({ id: 'user3', urlAvatar: gcsUrl })),
        update: jest.fn().mockResolvedValue(undefined),
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef),
      })

      storageMock.delete.mockRejectedValueOnce(new Error('Not found'))

      const result = await service.deleteAvatar('user3')

      // Storage failed but avatar is still cleared in DB
      expect(mockDocRef.update).toHaveBeenCalledWith({ urlAvatar: null })
      expect(result).toBeUndefined()
    })

    it('should handle local fallback URLs correctly', async () => {
      const localUrl = 'http://localhost:7000/uploads/avatars/local-file.jpg'
      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc({ id: 'user4', urlAvatar: localUrl })),
        update: jest.fn().mockResolvedValue(undefined),
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef),
      })

      const result = await service.deleteAvatar('user4')

      expect(storageMock.delete).toHaveBeenCalledWith('avatars/local-file.jpg')
      expect(mockDocRef.update).toHaveBeenCalledWith({ urlAvatar: null })
      expect(result).toBeUndefined()
    })

    it('should handle empty string urlAvatar as no avatar', async () => {
      const mockDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc({ id: 'user5', urlAvatar: '' })),
        update: jest.fn().mockResolvedValue(undefined),
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef),
      })

      const result = await service.deleteAvatar('user5')

      expect(storageMock.delete).not.toHaveBeenCalled()
      expect(mockDocRef.update).toHaveBeenCalledWith({ urlAvatar: null })
      expect(result).toBeUndefined()
    })
  });

  // ── getDependents ─────────────────────────────────────────────────────

  describe('getDependents', () => {
    it('should return dependents for user', async () => {
      const deps = [
        { id: 'dep1', data: () => ({ id: 'dep1', tutorId: 'user1', nombreCompleto: 'María', parentesco: 'hijo', fechaCreacion: '2024-01-01', datosPerfil: JSON.stringify({ tiposDiscapacidad: ['tea'], rangoEdad: '6-12', etapaVida: 'infancia', notas: 'Test' }) }) },
      ]

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: deps }),
      })

      const result: any[] = await service.getDependents('user1')
      expect(result).toHaveLength(1)
      expect(result[0].nombreCompleto).toBe('María')
      expect(result[0].tiposDiscapacidad).toEqual(['tea'])
    })

    it('should return empty array when no dependents', async () => {
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      })

      const result = await service.getDependents('user1')
      expect(result).toHaveLength(0)
    })

    it('should sort dependents by fechaCreacion ascending', async () => {
      const deps = [
        { id: 'dep2', data: () => ({ id: 'dep2', tutorId: 'user1', nombreCompleto: 'Pedro', parentesco: 'hijo', fechaCreacion: '2024-03-01', datosPerfil: JSON.stringify({ tiposDiscapacidad: ['motriz'], rangoEdad: '0-5', etapaVida: 'infancia', notas: '' }) }) },
        { id: 'dep1', data: () => ({ id: 'dep1', tutorId: 'user1', nombreCompleto: 'María', parentesco: 'hijo', fechaCreacion: '2024-01-01', datosPerfil: JSON.stringify({ tiposDiscapacidad: ['tea'], rangoEdad: '6-12', etapaVida: 'infancia', notas: '' }) }) },
      ]

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: deps }),
      })

      const result: any[] = await service.getDependents('user1')
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('dep1')
      expect(result[1].id).toBe('dep2')
    })

    it('should enrich features and disability data of linked PCD accounts from their real profiles', async () => {
      const deps = [
        { id: 'pcd1', data: () => ({ id: 'pcd1', tutorId: 'user1', esCuentaVinculada: true, pcdUserId: 'pcd1', nombreCompleto: 'Ana', fechaCreacion: '2024-01-01', datosPerfil: '{}' }) },
      ]
      const perfilesSnap = {
        docs: [{
          id: 'pcd1',
          data: () => ({ features: { chat: false, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true } }),
        }],
      }
      const extendidosSnap = {
        docs: [{
          id: 'ext-1',
          data: () => ({ usuarioId: 'pcd1', tiposDiscapacidad: '["tea","motriz"]', severidadDiscapacidad: 'moderada', etapaVida: 'adulto' }),
        }],
      }

      firestoreMock.collection
        .mockReturnValueOnce({ // dependientes query
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: deps }),
        })
        .mockReturnValueOnce({ // perfiles query (features reales)
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(perfilesSnap),
        })
        .mockReturnValueOnce({ // perfilesExtendidos query (discapacidad)
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue(extendidosSnap),
        })

      const result: any[] = await service.getDependents('user1')
      expect(result).toHaveLength(1)
      expect(result[0].esCuentaVinculada).toBe(true)
      expect(result[0].pcdUserId).toBe('pcd1')
      expect(result[0].features.chat).toBe(false)
      expect(result[0].features.postulaciones).toBe(true)
      expect(result[0].tiposDiscapacidad).toEqual(['tea', 'motriz'])
      expect(result[0].discapacidad).toBe('moderada')
      expect(result[0].etapaVida).toBe('adulto')
    })
  })

  // ── getMisPersonas ────────────────────────────────────────────────

  describe('getMisPersonas', () => {
    function setupDocs(flat: any[], linked: any[] = []) {
      const docs = [
        ...flat.map(f => ({
          id: f.id,
          data: () => ({
            id: f.id, tutorId: 'user1', nombreCompleto: f.nombre,
            parentesco: f.parentesco ?? 'hijo', fechaCreacion: f.fecha ?? '2024-01-01',
            datosPerfil: JSON.stringify({
              tiposDiscapacidad: f.tipos ?? [], rangoEdad: f.rango ?? null, etapaVida: f.etapa ?? null, notas: f.notas ?? '',
            }),
          }),
        })),
        ...linked.map(l => ({
          id: l.id,
          data: () => ({
            id: l.id, tutorId: 'user1', esCuentaVinculada: true, pcdUserId: l.id,
            nombreCompleto: l.nombre, parentesco: null, fechaCreacion: l.fecha ?? '2024-01-01', datosPerfil: '{}',
          }),
        })),
      ]
      firestoreMock.collection.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs }),
      })
      return docs
    }

    it('should consolidate flat and linked dependents under the common interface', async () => {
      setupDocs(
        [{ id: 'dep1', nombre: 'María', fecha: '2024-01-01' }],
        [{ id: 'pcd1', nombre: 'Ana', fecha: '2024-02-01' }],
      )
      // Perfiles y perfilesExtendidos de la PCD vinculada
      firestoreMock.collection
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({
            docs: [{ id: 'pcd1', data: () => ({ urlAvatar: 'https://storage/ana.jpg', features: { chat: false } }) }],
          }),
        })
        .mockReturnValueOnce({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        })

      const result: any = await service.getMisPersonas('user1', 1, 20)

      expect(result.total).toBe(2)
      expect(result.datos).toHaveLength(2)
      const ana = result.datos.find((p: any) => p.id === 'pcd1')
      const maria = result.datos.find((p: any) => p.id === 'dep1')
      expect(ana).toMatchObject({
        nombre: 'Ana', esCuentaVinculada: true, fotoUrl: 'https://storage/ana.jpg', pcdUserId: 'pcd1',
      })
      // Features reales del perfil de la PCD (merge con defaults)
      expect(ana.features.chat).toBe(false)
      expect(ana.features.postulaciones).toBe(true)
      expect(maria).toMatchObject({ nombre: 'María', esCuentaVinculada: false, fotoUrl: null, pcdUserId: null })
      expect(maria.features).toEqual({ chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true })
    })

    it('should paginate results', async () => {
      const deps = Array.from({ length: 25 }, (_, i) => ({ id: `dep-${i}`, nombre: `Persona ${i}`, fecha: `2024-01-${String((i % 28) + 1).padStart(2, '0')}` }))
      setupDocs(deps)

      const result: any = await service.getMisPersonas('user1', 2, 10)

      expect(result.total).toBe(25)
      expect(result.pagina).toBe(2)
      expect(result.limite).toBe(10)
      expect(result.totalPaginas).toBe(3)
      expect(result.datos).toHaveLength(10)
    })

    it('should filter by search text on nombre', async () => {
      const deps = [
        { id: 'dep1', nombre: 'María García', fecha: '2024-01-01' },
        { id: 'dep2', nombre: 'Pedro López', fecha: '2024-01-02' },
      ]
      setupDocs(deps)

      const result: any = await service.getMisPersonas('user1', 1, 20, undefined, 'desc', 'maría')

      expect(result.total).toBe(1)
      expect(result.datos[0].id).toBe('dep1')
    })

    it('should sort by fechaCreacion descending by default', async () => {
      const deps = [
        { id: 'dep1', nombre: 'María', fecha: '2024-01-01' },
        { id: 'dep2', nombre: 'Pedro', fecha: '2024-03-01' },
      ]
      setupDocs(deps)

      const result: any = await service.getMisPersonas('user1')

      expect(result.datos[0].id).toBe('dep2')
      expect(result.datos[1].id).toBe('dep1')
    })

    it('should return empty page when there are no dependents', async () => {
      setupDocs([])

      const result: any = await service.getMisPersonas('user1')

      expect(result.total).toBe(0)
      expect(result.datos).toHaveLength(0)
    })
  })

  // ── getDependentsCount ─────────────────────────────────────────────

  describe('getDependentsCount', () => {
    it('should return total, limit and remaining count', async () => {
      // Se usa getMaxDependientesPorTutor() como fuente de verdad para que el
      // test sea inmune al valor de MAX_DEPENDIENTES_POR_TUTOR en el entorno.
      const limite = getMaxDependientesPorTutor()
      const deps = Array.from({ length: 3 }, (_, i) => ({
        id: `dep-${i}`,
        data: () => ({ id: `dep-${i}`, tutorId: 'user1' }),
      }))

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ size: 3, docs: deps }),
      })

      const result: any = await service.getDependentsCount('user1')

      expect(result.total).toBe(3)
      expect(result.limite).toBe(limite)
      expect(result.restantes).toBe(Math.max(0, limite - 3))
    })

    it('should return 0 remaining when at max limit', async () => {
      const limite = getMaxDependientesPorTutor()
      const deps = Array.from({ length: limite }, (_, i) => ({
        id: `dep-${i}`,
        data: () => ({ id: `dep-${i}`, tutorId: 'user1' }),
      }))

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ size: limite, docs: deps }),
      })

      const result: any = await service.getDependentsCount('user1')

      expect(result.total).toBe(limite)
      expect(result.limite).toBe(limite)
      expect(result.restantes).toBe(0)
    })

    it('should return full limit remaining when no dependents', async () => {
      const limite = getMaxDependientesPorTutor()
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ size: 0, docs: [] }),
      })

      const result: any = await service.getDependentsCount('user1')

      expect(result.total).toBe(0)
      expect(result.limite).toBe(limite)
      expect(result.restantes).toBe(limite)
    })
  })

  // ── addDependent ─────────────────────────────────────────────────────

  describe('addDependent', () => {
    it('should create a dependent and return formatted data', async () => {
      const setMock = jest.fn().mockResolvedValue(undefined)
      const docData = {
        id: 'new-id', tutorId: 'user1', nombreCompleto: 'Carlos', parentesco: 'hijo',
        fechaCreacion: '2024-01-01T00:00:00.000Z',
        datosPerfil: JSON.stringify({ tiposDiscapacidad: ['motriz'], rangoEdad: '3-6', etapaVida: 'infancia', notas: 'Nota' }),
      }

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }), // 0 dependientes existentes
        doc: jest.fn().mockReturnValue({
          set: setMock,
          get: jest.fn().mockResolvedValue(mockDoc(docData)),
        }),
      })

      const result: any = await service.addDependent('user1', {
        nombreCompleto: 'Carlos', parentesco: 'hijo',
        tiposDiscapacidad: ['motriz'], rangoEdad: '3-6', etapaVida: 'infancia', notas: 'Nota',
      })

      expect(setMock).toHaveBeenCalled()
      expect(result.nombreCompleto).toBe('Carlos')
      expect(result.tiposDiscapacidad).toEqual(['motriz'])
    })

    it('should use defaults when optional fields are missing', async () => {
      const setMock = jest.fn().mockResolvedValue(undefined)
      const docData = {
        id: 'new-id', tutorId: 'user1', nombreCompleto: 'Sin nombre', parentesco: 'familiar',
        fechaCreacion: '2024-01-01T00:00:00.000Z',
        datosPerfil: JSON.stringify({ tiposDiscapacidad: [], rangoEdad: null, etapaVida: null, notas: '' }),
      }

      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] }), // 0 dependientes existentes
        doc: jest.fn().mockReturnValue({
          set: setMock,
          get: jest.fn().mockResolvedValue(mockDoc(docData)),
        }),
      })

      const result: any = await service.addDependent('user1', {})
      expect(result.nombreCompleto).toBe('Sin nombre')
      expect(result.parentesco).toBe('familiar')
    })

  })

  // ── updateDependent ──────────────────────────────────────────────────

  describe('updateDependent', () => {
    it('should update an existing dependent', async () => {
      const existingDoc = {
        exists: true, id: 'dep1',
        data: () => ({
          id: 'dep1', tutorId: 'user1', nombreCompleto: 'Old Name', parentesco: 'hijo',
          fechaCreacion: '2024-01-01',
          datosPerfil: JSON.stringify({ tiposDiscapacidad: ['tea'], rangoEdad: '6-12', etapaVida: 'infancia', notas: 'Old' }),
        }),
      }
      const updateMock = jest.fn().mockResolvedValue(undefined)
      const updatedDoc = {
        id: 'dep1', tutorId: 'user1', nombreCompleto: 'New Name', parentesco: 'madre',
        fechaCreacion: '2024-01-01',
        datosPerfil: JSON.stringify({ tiposDiscapacidad: ['motriz'], rangoEdad: '3-6', etapaVida: 'infancia', notas: 'New' }),
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn()
            .mockResolvedValueOnce(existingDoc)
            .mockResolvedValueOnce(mockDoc(updatedDoc)),
          update: updateMock,
        }),
      })

      const result: any = await service.updateDependent('user1', 'dep1', {
        nombreCompleto: 'New Name', parentesco: 'madre',
        tiposDiscapacidad: ['motriz'], rangoEdad: '3-6', notas: 'New',
      })

      expect(updateMock).toHaveBeenCalled()
      expect(result.nombreCompleto).toBe('New Name')
    })

    it('should throw NotFoundException when dependent does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }),
      })

      await expect(service.updateDependent('user1', 'nonexistent', {})).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException when dependent belongs to another user', async () => {
      const otherDoc = mockDoc({ id: 'dep1', tutorId: 'other-user' })

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(otherDoc) }),
      })

      await expect(service.updateDependent('user1', 'dep1', {})).rejects.toThrow(NotFoundException)
    })
  })

  // ── deleteDependent ──────────────────────────────────────────────────

  describe('deleteDependent', () => {
    it('should delete a dependent', async () => {
      const deleteMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc({ id: 'dep1', tutorId: 'user1' })),
          delete: deleteMock,
        }),
      })

      await service.deleteDependent('user1', 'dep1')
      expect(deleteMock).toHaveBeenCalled()
    })

    it('should throw NotFoundException when dependent does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }),
      })

      await expect(service.deleteDependent('user1', 'nonexistent')).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException when dependent belongs to another user', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ tutorId: 'other' })) }),
      })

      await expect(service.deleteDependent('user1', 'dep1')).rejects.toThrow(NotFoundException)
    })

    it('should unlink the PCD profile when deleting a linked account', async () => {
      const deleteMock = jest.fn().mockResolvedValue(undefined)
      const updateMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc({ id: 'pcd1', tutorId: 'user1', esCuentaVinculada: true, pcdUserId: 'pcd1' })),
          delete: deleteMock,
          update: updateMock,
        }),
      })

      await service.deleteDependent('user1', 'pcd1')

      expect(updateMock).toHaveBeenCalledWith({ tutorId: null })
      expect(deleteMock).toHaveBeenCalled()
    })
  })

  // ── updateProfile ────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('should update profile fields and return updated profile', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)
      const profileData = { id: 'user1', nombreCompleto: 'Updated', ciudad: 'GDL' }

      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({ update: updateMock }),
        })
        .mockReturnValueOnce(mockCollection(mockDoc(profileData))) // lectura del rol para sincronizar nombre
        .mockReturnValueOnce(mockCollection(mockDoc(profileData)))
        .mockReturnValueOnce(mockCollection(null, true))

      const result: any = await service.updateProfile('user1', { nombreCompleto: 'Updated', ciudad: 'GDL' })

      expect(updateMock).toHaveBeenCalledWith({ nombreCompleto: 'Updated', ciudad: 'GDL' })
      expect(result.nombreCompleto).toBe('Updated')
    })

    it('should propagate the new name to the institution document when updating an institution profile', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)
      const instUpdateMock = jest.fn().mockResolvedValue(undefined)
      const profileData = { id: 'inst1', rol: 'institucion', nombreCompleto: 'Centro Nuevo Nombre' }
      const instDoc = {
        exists: true, id: 'inst1',
        data: () => ({ nombre: 'Centro Viejo' }),
        ref: { update: instUpdateMock },
      }

      const perfilDocRef = {
        get: jest.fn().mockResolvedValue(mockDoc(profileData)),
        update: updateMock,
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      }

      firestoreMock.collection.mockImplementation((name: string) => {
        if (name === 'instituciones') {
          return { doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(instDoc) }) }
        }
        if (name === 'perfiles') {
          return { doc: jest.fn().mockReturnValue(perfilDocRef) }
        }
        if (name === 'perfilesExtendidos') {
          return mockCollection(null, true)
        }
        return mockCollection(mockDoc(profileData))
      })

      await service.updateProfile('inst1', { nombreCompleto: 'Centro Nuevo Nombre' })

      expect(updateMock).toHaveBeenCalledWith({ nombreCompleto: 'Centro Nuevo Nombre' })
      expect(instUpdateMock).toHaveBeenCalledWith({ nombre: 'Centro Nuevo Nombre' })
    })

    it('should return existing profile when no fields to update', async () => {
      const profileData = { id: 'user1', nombreCompleto: 'Original' }

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData)))
        .mockReturnValueOnce(mockCollection(null, true))

      const result: any = await service.updateProfile('user1', {})
      expect(result.nombreCompleto).toBe('Original')
    })
  })

  // ── linkPcdToTutor ───────────────────────────────────────────────────

  describe('linkPcdToTutor', () => {
    it('should link a PCD user to a tutor and create the dependiente relation record', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)
      const setMock = jest.fn().mockResolvedValue(undefined)
      const pcdData = { id: 'pcd1', rol: 'pcd', tutorId: null as string | null, nombreCompleto: 'PCD Uno' }

      const perfilesCol = {
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(pcdData)), update: updateMock }),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: [{ id: 'pcd1', data: () => pcdData }] }),
      }
      // dependientes: canónico no existe, previos vacío → crear
      const dependientesCol = {
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)), set: setMock }),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      }
      firestoreMock.collection.mockImplementation((name: string) => (name === 'dependientes' ? dependientesCol : perfilesCol))

      const result = await service.linkPcdToTutor('tutor1', 'pcd1@example.com')

      expect(updateMock).toHaveBeenCalledWith({ tutorId: 'tutor1' })
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
        id: 'pcd1',
        tutorId: 'tutor1',
        pcdUserId: 'pcd1',
        esCuentaVinculada: true,
      }))
      expect(result).toEqual({ vinculado: true, pcdUserId: 'pcd1', tutorId: 'tutor1' })
    })

    it('should promote an existing flat dependiente of the tutor instead of creating a duplicate', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)
      const setMock = jest.fn().mockResolvedValue(undefined)
      const promoteUpdate = jest.fn().mockResolvedValue(undefined)
      const pcdData = { id: 'pcd1', rol: 'pcd', tutorId: null as string | null, nombreCompleto: 'PCD Uno' }

      const perfilesCol = {
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(pcdData)), update: updateMock }),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: [{ id: 'pcd1', data: () => pcdData }] }),
      }
      const dependientesCol = {
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)), set: setMock }),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{
            id: 'flat-1',
            ref: { update: promoteUpdate },
            data: () => ({ id: 'flat-1', tutorId: 'tutor1', nombreCompleto: 'PCD Uno' }),
          }],
        }),
      }
      firestoreMock.collection.mockImplementation((name: string) => (name === 'dependientes' ? dependientesCol : perfilesCol))

      await service.linkPcdToTutor('tutor1', 'pcd1@example.com')

      expect(promoteUpdate).toHaveBeenCalledWith(expect.objectContaining({
        pcdUserId: 'pcd1',
        esCuentaVinculada: true,
        rol: 'pcd',
      }))
      expect(setMock).not.toHaveBeenCalled()
    })

    it('should throw NotFoundException when PCD user does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      })

      await expect(service.linkPcdToTutor('tutor1', 'nonexistent@example.com')).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException when user exists but is not PCD role', async () => {
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: [{ id: 'inst1', data: () => ({ rol: 'institucion' }) }] }),
      })

      await expect(service.linkPcdToTutor('tutor1', 'inst@example.com')).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException when PCD already has a tutor', async () => {
      firestoreMock.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: [{ id: 'pcd1', data: () => ({ rol: 'pcd', tutorId: 'existing-tutor' }) }] }),
      })

      await expect(service.linkPcdToTutor('tutor1', 'pcd@example.com')).rejects.toThrow(BadRequestException)
    })
  })

  // ── getDependentPermissions ─────────────────────────────────────────

  describe('getDependentPermissions', () => {
    const featuresPorDefecto = { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true }

    it('should return permissions of a flat dependiente owned by the tutor', async () => {
      const depData = {
        id: 'dep1', tutorId: 'user1', nombreCompleto: 'María García',
        features: { ...featuresPorDefecto, chat: false },
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(depData)) }),
      })

      const result = await service.getDependentPermissions('user1', 'dep1', 'tutor')

      expect(result).toEqual({
        dependienteId: 'dep1',
        nombre: 'María García',
        esCuentaVinculada: false,
        pcdUserId: null,
        features: { ...featuresPorDefecto, chat: false },
      })
    })

    it('should return real features from the PCD profile for a linked account', async () => {
      const depData = {
        id: 'pcd1', tutorId: 'user1', esCuentaVinculada: true, pcdUserId: 'pcd1', nombreCompleto: 'Ana',
      }
      const perfilData = { features: { ...featuresPorDefecto, chat: false } }

      firestoreMock.collection
        .mockReturnValueOnce({ // dependiente doc
          doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(depData)) }),
        })
        .mockReturnValueOnce({ // perfil real de la PCD (fuente de verdad de features)
          doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(perfilData)) }),
        })

      const result: any = await service.getDependentPermissions('user1', 'pcd1', 'tutor')

      expect(result.esCuentaVinculada).toBe(true)
      expect(result.pcdUserId).toBe('pcd1')
      expect(result.features.chat).toBe(false)
      expect(result.features.postulaciones).toBe(true)
    })

    it('should fall back to defaults when a linked PCD profile has no features', async () => {
      const depData = { id: 'pcd1', tutorId: 'user1', esCuentaVinculada: true, pcdUserId: 'pcd1', nombreCompleto: 'Ana' }

      firestoreMock.collection
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(depData)) }),
        })
        .mockReturnValueOnce({
          doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }),
        })

      const result: any = await service.getDependentPermissions('user1', 'pcd1', 'tutor')
      expect(result.features).toEqual(featuresPorDefecto)
    })

    it('should allow admin to read permissions of any dependiente', async () => {
      const depData = { id: 'dep2', tutorId: 'other-tutor', nombreCompleto: 'Otro' }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(depData)) }),
      })

      const result = await service.getDependentPermissions('admin1', 'dep2', 'admin')
      expect(result.dependienteId).toBe('dep2')
      expect(result.nombre).toBe('Otro')
    })

    it('should throw NotFoundException when dependiente belongs to another tutor', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ id: 'dep2', tutorId: 'other-tutor' })) }),
      })

      await expect(service.getDependentPermissions('user1', 'dep2', 'tutor')).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException when dependiente does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }),
      })

      await expect(service.getDependentPermissions('user1', 'ghost', 'tutor')).rejects.toThrow(NotFoundException)
    })
  })

  // ── updateDependentFeatures ──────────────────────────────────────────

  describe('updateDependentFeatures', () => {
    it('should update features of a dependent', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)
      const depData = {
        id: 'dep1', tutorId: 'user1',
        features: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true },
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc(depData)),
          update: updateMock,
        }),
      })

      const result = await service.updateDependentFeatures('user1', 'dep1', { postulaciones: false, chat: false })

      expect(updateMock).toHaveBeenCalled()
      expect(result.id).toBe('dep1')
      expect(result.features.postulaciones).toBe(false)
      expect(result.features.chat).toBe(false)
      expect(result.features.comunidad).toBe(true)
    })

    it('should throw NotFoundException when dependent does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc(null, false)),
        }),
      })

      await expect(service.updateDependentFeatures('user1', 'nonexistent', { chat: false })).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException when dependent belongs to another user', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc({ id: 'dep1', tutorId: 'other-user' })),
        }),
      })

      await expect(service.updateDependentFeatures('user1', 'dep1', { chat: false })).rejects.toThrow(NotFoundException)
    })

    it('should use default features when dependent has no existing features', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc({ id: 'dep1', tutorId: 'user1' })), // no features field
          update: updateMock,
        }),
      })

      const result = await service.updateDependentFeatures('user1', 'dep1', { comunidad: false })

      expect(updateMock).toHaveBeenCalled()
      expect(result.features.comunidad).toBe(false)
      expect(result.features.chat).toBe(true) // from defaults
    })

    it('should delegate to the real PCD profile when the dependiente is a linked account', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)
      const linkedDep = {
        id: 'pcd1', tutorId: 'user1', esCuentaVinculada: true, pcdUserId: 'pcd1',
        features: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true },
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc(linkedDep)),
          update: updateMock,
        }),
      })

      const result: any = await service.updateDependentFeatures('user1', 'pcd1', { chat: false })

      // Se actualizó el perfil real de la PCD (no el documento dependiente)
      expect(updateMock).toHaveBeenCalledWith({ features: expect.objectContaining({ chat: false }) })
      expect(result.id).toBe('pcd1')
      expect(result.features.chat).toBe(false)
    })
  })

  // ── unlinkPcdFromTutor ───────────────────────────────────────────────

  describe('unlinkPcdFromTutor', () => {
    function setupBatch() {
      const batchMock = {
        update: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
      }
      firestoreMock.batch = jest.fn().mockReturnValue(batchMock)
      return batchMock
    }

    it('should unlink a PCD from its tutor atomically (profile + dependientes)', async () => {
      const batchMock = setupBatch()
      const relDocs = [{ ref: { id: 'pcd1' } }, { ref: { id: 'flat-1' } }]

      firestoreMock.collection.mockImplementation((name: string) => {
        if (name === 'perfiles') {
          return { doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ id: 'pcd1', rol: 'pcd', tutorId: 'tutor1' })) }) }
        }
        return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: relDocs }) }
      })

      const result = await service.unlinkPcdFromTutor('tutor1', 'tutor', 'pcd1')

      expect(batchMock.update).toHaveBeenCalledWith(expect.anything(), { tutorId: null })
      expect(batchMock.delete).toHaveBeenCalledTimes(2)
      expect(batchMock.commit).toHaveBeenCalled()
      expect(result).toEqual({ desvinculado: true, pcdUserId: 'pcd1', tutorId: 'tutor1' })
    })

    it('should allow an admin to unlink any PCD', async () => {
      const batchMock = setupBatch()

      firestoreMock.collection.mockImplementation((name: string) => {
        if (name === 'perfiles') {
          return { doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ id: 'pcd1', rol: 'pcd', tutorId: 'tutor1' })) }) }
        }
        return { where: jest.fn().mockReturnThis(), get: jest.fn().mockResolvedValue({ docs: [] }) }
      })

      const result = await service.unlinkPcdFromTutor('admin1', 'admin', 'pcd1')

      expect(batchMock.commit).toHaveBeenCalled()
      expect(result.desvinculado).toBe(true)
    })

    it('should throw NotFoundException when PCD user does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc(null, false)) }),
      })

      await expect(service.unlinkPcdFromTutor('tutor1', 'tutor', 'ghost')).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException when the PCD has no tutor', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ id: 'pcd1', rol: 'pcd', tutorId: null })) }),
      })

      await expect(service.unlinkPcdFromTutor('tutor1', 'tutor', 'pcd1')).rejects.toThrow(BadRequestException)
    })

    it('should throw ForbiddenException when a tutor tries to unlink a PCD of another tutor', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc({ id: 'pcd1', rol: 'pcd', tutorId: 'other-tutor' })) }),
      })

      await expect(service.unlinkPcdFromTutor('tutor1', 'tutor', 'pcd1')).rejects.toThrow(ForbiddenException)
    })
  })

  // ── updateLinkedPcdFeatures ──────────────────────────────────────────

  describe('updateLinkedPcdFeatures', () => {
    it('should update features of a linked PCD', async () => {
      const updateMock = jest.fn().mockResolvedValue(undefined)
      const pcdData = {
        id: 'pcd1', tutorId: 'tutor1',
        features: { chat: true, postulaciones: true, comunidad: true, resenas: true, descubrimiento: true, favoritos: true, multimedia: true },
      }

      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc(pcdData)),
          update: updateMock,
        }),
      })

      const result = await service.updateLinkedPcdFeatures('tutor1', 'pcd1', { resenas: false, descubrimiento: false })

      expect(updateMock).toHaveBeenCalled()
      expect(result.id).toBe('pcd1')
      expect(result.features.resenas).toBe(false)
      expect(result.features.descubrimiento).toBe(false)
      expect(result.features.chat).toBe(true)
    })

    it('should throw NotFoundException when PCD user does not exist', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc(null, false)),
        }),
      })

      await expect(service.updateLinkedPcdFeatures('tutor1', 'nonexistent', { chat: false })).rejects.toThrow(NotFoundException)
    })

    it('should throw ForbiddenException when PCD is not linked to the tutor', async () => {
      firestoreMock.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc({ id: 'pcd1', tutorId: 'other-tutor' })),
          update: jest.fn().mockResolvedValue(undefined),
        }),
      })

      await expect(service.updateLinkedPcdFeatures('tutor1', 'pcd1', { chat: false })).rejects.toThrow(ForbiddenException)
    })
  })
});
