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
      const profileData = { id: 'user1', full_name: 'Test User', email: 'test@test.com' };
      const profilingData = {
        disability_types: '["autismo","discapacidad_visual"]',
        needs: '["comunicacion","movilidad"]',
        education_history: '["escuela_regular","educacion_especial"]',
        therapy_history: '["terapia_ocupacional","fonoaudiologia"]',
        current_goals: '["mejorar_comunicacion"]',
        support_areas: '["familia","terapeutas"]',
        communication_modes: '["lenguaje_señas","aac"]',
        mobility_needs: '["silla_ruedas"]',
        tech_access: '["tablet","computadora"]',
        preferred_zones: '["centro","norte"]',
        disability_severity: 'moderada',
        life_stage: 'adulthood',
        current_concerns: 'some concerns',
        support_level: 'medio',
      };

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData)))
        .mockReturnValueOnce(mockCollection(null, false, [{ data: () => profilingData }]));

      const result: any = await service.getProfile('user1');

      // All array fields should be parsed from JSON strings to actual arrays
      expect(result.profiling.disability_types).toEqual(['autismo', 'discapacidad_visual']);
      expect(result.profiling.needs).toEqual(['comunicacion', 'movilidad']);
      expect(result.profiling.education_history).toEqual(['escuela_regular', 'educacion_especial']);
      expect(result.profiling.therapy_history).toEqual(['terapia_ocupacional', 'fonoaudiologia']);
      expect(result.profiling.current_goals).toEqual(['mejorar_comunicacion']);
      expect(result.profiling.support_areas).toEqual(['familia', 'terapeutas']);
      expect(result.profiling.communication_modes).toEqual(['lenguaje_señas', 'aac']);
      expect(result.profiling.mobility_needs).toEqual(['silla_ruedas']);
      expect(result.profiling.tech_access).toEqual(['tablet', 'computadora']);
      expect(result.profiling.preferred_zones).toEqual(['centro', 'norte']);
    });

    it('should return original string if JSON is malformed (not crash)', async () => {
      const profileData = { id: 'user2', full_name: 'Bad Data User' };
      const profilingData = {
        disability_types: 'not-valid-json[[',
        needs: '{broken',
        education_history: undefined,
        therapy_history: null,
        current_goals: '[]',
        support_areas: '',
        communication_modes: undefined,
        mobility_needs: null,
        tech_access: '[]',
        preferred_zones: undefined,
      };

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData)))
        .mockReturnValueOnce(mockCollection(null, false, [{ data: () => profilingData }]));

      const result: any = await service.getProfile('user2');

      // Malformed JSON strings should be returned as-is (not crash)
      expect(result.profiling.disability_types).toBe('not-valid-json[[');
      expect(result.profiling.needs).toBe('{broken');

      // Already-parsed values (undefined, null) should pass through
      expect(result.profiling.education_history).toBeUndefined();
      expect(result.profiling.therapy_history).toBeNull();
      expect(result.profiling.communication_modes).toBeUndefined();
      expect(result.profiling.preferred_zones).toBeUndefined();

      // Valid JSON strings should still be parsed
      expect(result.profiling.current_goals).toEqual([]);
      expect(result.profiling.tech_access).toEqual([]);

      // Empty string is not valid JSON, should be returned as-is
      expect(result.profiling.support_areas).toBe('');
    });

    it('should handle already-parsed arrays (not strings) gracefully', async () => {
      const profileData = { id: 'user3', full_name: 'Array User' };
      const profilingData = {
        disability_types: ['autismo', 'discapacidad_visual'], // already array
        needs: ['comunicacion'], // already array
        education_history: ['escuela'], // already array
        therapy_history: [], // empty array
        current_goals: ['meta1'],
        support_areas: ['area1'],
        communication_modes: ['señas'],
        mobility_needs: ['silla'],
        tech_access: ['tablet'],
        preferred_zones: ['centro'],
      };

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData)))
        .mockReturnValueOnce(mockCollection(null, false, [{ data: () => profilingData }]));

      const result: any = await service.getProfile('user3');

      // Already arrays should pass through unchanged
      expect(result.profiling.disability_types).toEqual(['autismo', 'discapacidad_visual']);
      expect(result.profiling.needs).toEqual(['comunicacion']);
      expect(result.profiling.education_history).toEqual(['escuela']);
      expect(result.profiling.therapy_history).toEqual([]);
      expect(result.profiling.current_goals).toEqual(['meta1']);
      expect(result.profiling.support_areas).toEqual(['area1']);
      expect(result.profiling.communication_modes).toEqual(['señas']);
      expect(result.profiling.mobility_needs).toEqual(['silla']);
      expect(result.profiling.tech_access).toEqual(['tablet']);
      expect(result.profiling.preferred_zones).toEqual(['centro']);
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
      const profileData = { id: 'user4', full_name: 'No Profiling' };

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData)))
        .mockReturnValueOnce(mockCollection(null, true)); // empty profiling

      const result: any = await service.getProfile('user4');

      // Note: profileData.id ('user4') overwrites doc.id via spread
      expect(result.id).toBe('user4');
      expect(result.full_name).toBe('No Profiling');
      expect(result.profiling).toBeNull();
    });

    it('should return full profile with parsed profiling data', async () => {
      const profileData = {
        id: 'user5', full_name: 'Full User', email: 'full@test.com',
        city: 'CDMX', state: 'Mexico', role: 'user',
      };
      const profilingData = {
        disability_types: '["autismo"]',
        disability_severity: 'leve',
        communication_modes: '["verbal"]',
        mobility_needs: '[]',
        tech_access: '["celular"]',
        preferred_zones: '["sur"]',
        needs: '["apoyo_emocional"]',
        current_goals: '["integracion_social"]',
        support_areas: '["trabajo"]',
        education_history: '["preescolar"]',
        therapy_history: '["psicologia"]',
        life_stage: 'adult',
        current_concerns: 'ansiedad',
        support_level: 'alto',
      };

      firestoreMock.collection
        .mockReturnValueOnce(mockCollection(mockDoc(profileData)))
        .mockReturnValueOnce(mockCollection(null, false, [{ data: () => profilingData }]));

      const result: any = await service.getProfile('user5');

      // Profile fields
      expect(result.full_name).toBe('Full User');
      expect(result.email).toBe('full@test.com');
      expect(result.city).toBe('CDMX');

      // Profiling fields parsed correctly
      expect(result.profiling.disability_types).toEqual(['autismo']);
      expect(result.profiling.disability_severity).toBe('leve');
      expect(result.profiling.communication_modes).toEqual(['verbal']);
      expect(result.profiling.needs).toEqual(['apoyo_emocional']);
      expect(result.profiling.current_goals).toEqual(['integracion_social']);
      expect(result.profiling.support_areas).toEqual(['trabajo']);
      expect(result.profiling.education_history).toEqual(['preescolar']);
      expect(result.profiling.therapy_history).toEqual(['psicologia']);
      expect(result.profiling.life_stage).toBe('adult');
      expect(result.profiling.current_concerns).toBe('ansiedad');
      expect(result.profiling.support_level).toBe('alto');
    });
  });

  // ── saveProfilingData ──────────────────────────────────────────────────

  describe('saveProfilingData', () => {
    it('should save all fields including new ones (education_history, therapy_history)', async () => {
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
        disability_types: ['autismo'],
        communication_modes: ['señas'],
        mobility_needs: ['silla'],
        tech_access: ['tablet'],
        preferred_zones: ['centro'],
        needs: ['comunicacion'],
        current_goals: ['integracion'],
        support_areas: ['familia'],
        education_history: ['escuela_regular'],
        therapy_history: ['terapia_ocupacional'],
        life_stage: 'adulthood',
        current_concerns: 'ansiedad',
        support_level: 'medio',
      };

      await service.saveProfilingData('user1', data);

      // Verify doc.set was called (new record)
      expect(mockDocRef.set).toHaveBeenCalledTimes(1);
      const payload = mockDocRef.set.mock.calls[0][0];

      // Verify all array fields are JSON stringified
      expect(JSON.parse(payload.disability_types)).toEqual(['autismo']);
      expect(JSON.parse(payload.needs)).toEqual(['comunicacion']);
      expect(JSON.parse(payload.education_history)).toEqual(['escuela_regular']);
      expect(JSON.parse(payload.therapy_history)).toEqual(['terapia_ocupacional']);
      expect(JSON.parse(payload.current_goals)).toEqual(['integracion']);
      expect(JSON.parse(payload.support_areas)).toEqual(['familia']);

      // Verify string fields are passed as-is
      expect(payload.life_stage).toBe('adulthood');
      expect(payload.current_concerns).toBe('ansiedad');
      expect(payload.support_level).toBe('medio');
    });

    it('should update existing profiling record', async () => {
      const existingDoc = { id: 'existing-id', data: () => ({ user_id: 'user1' }) };
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
        disability_types: ['nuevo_tipo'],
        education_history: ['universidad'],
        therapy_history: ['nueva_terapia'],
      };

      await service.saveProfilingData('user1', data);

      // Should call update instead of set
      expect(mockDocRef.update).toHaveBeenCalledTimes(1);
      expect(mockDocRef.set).not.toHaveBeenCalled();

      const payload = mockDocRef.update.mock.calls[0][0];
      expect(JSON.parse(payload.education_history)).toEqual(['universidad']);
      expect(JSON.parse(payload.therapy_history)).toEqual(['nueva_terapia']);
    });
  });
});
