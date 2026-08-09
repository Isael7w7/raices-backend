import { ETagInterceptor } from './etag.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { createHash } from 'crypto';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function mockRequest(method = 'GET', headers: Record<string, string> = {}, opts: { url?: string; user?: any } = {}) {
  return {
    method,
    headers,
    url: opts.url ?? '/test',
    originalUrl: opts.url ?? '/test',
    user: opts.user,
  };
}

function mockResponse() {
  const res: any = {
    _status: 200,
    _headers: {} as Record<string, string>,
  };
  res.setHeader = jest.fn((key: string, value: string) => {
    res._headers[key] = value;
  });
  res.status = jest.fn((code: number) => {
    res._status = code;
    return res;
  });
  res.send = jest.fn(() => res);
  Object.defineProperty(res, 'statusCode', {
    get: () => res._status,
  });
  return res;
}

function mockExecutionContext(req: any, res: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as any;
}

function mockCallHandler(body: any): CallHandler {
  return {
    handle: () => of(body),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ETagInterceptor', () => {
  let interceptor: ETagInterceptor;

  beforeEach(() => {
    // La caché es estática y compartida: limpiarla evita fugas entre tests
    ETagInterceptor.clearCache();
    interceptor = new ETagInterceptor();
  });

  describe('GET requests', () => {
    it('should set ETag header on GET response', () => {
      const body = { id: 'user1', name: 'Test User' };
      const req = mockRequest('GET');
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      let result: any;
      interceptor.intercept(ctx, callHandler).subscribe((r) => (result = r));

      // ETag should be set
      expect(res.setHeader).toHaveBeenCalledWith('ETag', expect.stringMatching(/^"[a-f0-9]+"$/));

      // Body should be returned
      expect(result).toEqual(body);
      expect(res._status).toBe(200);
    });

    it('should return 304 Not Modified when If-None-Match matches', () => {
      const body = { id: 'user1', name: 'Test User' };
      const expectedEtag = `"${createHash('md5').update(JSON.stringify(body)).digest('hex')}"`;

      const req = mockRequest('GET', { 'if-none-match': expectedEtag });
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      let result: any;
      interceptor.intercept(ctx, callHandler).subscribe((r) => (result = r));

      // Should return 304
      expect(res.status).toHaveBeenCalledWith(304);
      expect(res.send).toHaveBeenCalled();

      // Body should not be returned
      expect(result).toBeUndefined();
    });

    it('should return 200 with body when If-None-Match does not match', () => {
      const body = { id: 'user1', name: 'Test User' };
      const differentEtag = '"abc123def456"';

      const req = mockRequest('GET', { 'if-none-match': differentEtag });
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      let result: any;
      interceptor.intercept(ctx, callHandler).subscribe((r) => (result = r));

      // Should return 200 with body
      expect(res._status).toBe(200);
      expect(result).toEqual(body);
    });

    it('should generate consistent ETag for same body', () => {
      const body = { id: 'user1', name: 'Test User' };
      const json = JSON.stringify(body);
      const expectedEtag = `"${createHash('md5').update(json).digest('hex')}"`;

      const req = mockRequest('GET');
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      interceptor.intercept(ctx, callHandler).subscribe();

      expect(res.setHeader).toHaveBeenCalledWith('ETag', expectedEtag);
    });

    it('should handle request without If-None-Match header', () => {
      const body = { data: 'test' };
      const req = mockRequest('GET', {}); // no if-none-match
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      let result: any;
      interceptor.intercept(ctx, callHandler).subscribe((r) => (result = r));

      expect(result).toEqual(body);
      expect(res._status).toBe(200);
    });
  });

  describe('In-memory cache (early 304 without executing handler)', () => {
    it('should respond 304 WITHOUT executing the handler when cache is fresh and ETag matches', () => {
      const body = { id: 'user1', name: 'Test User' };
      const expectedEtag = `"${createHash('md5').update(JSON.stringify(body)).digest('hex')}"`;

      // Primera petición: pobla la caché (ejecuta el handler)
      const res1 = mockResponse();
      const ctx1 = mockExecutionContext(mockRequest('GET'), res1);
      const handleSpy1 = jest.fn(() => of(body));
      interceptor.intercept(ctx1, { handle: handleSpy1 } as any).subscribe();

      // Segunda petición con If-None-Match coincidente: NO debe ejecutar el handler
      const res2 = mockResponse();
      const ctx2 = mockExecutionContext(mockRequest('GET', { 'if-none-match': expectedEtag }), res2);
      const handleSpy2 = jest.fn(() => of(body));
      let result: any;
      interceptor.intercept(ctx2, { handle: handleSpy2 } as any).subscribe((r) => (result = r));

      expect(handleSpy1).toHaveBeenCalledTimes(1);
      expect(handleSpy2).not.toHaveBeenCalled();
      expect(res2.status).toHaveBeenCalledWith(304);
      expect(res2.send).toHaveBeenCalled();
      expect(result).toBeUndefined();
      // RFC 7232: el 304 debe incluir el ETag para permitir revalidación
      expect(res2.setHeader).toHaveBeenCalledWith('ETag', expectedEtag);
    });

    it('should execute the handler when the cache entry has expired', () => {
      const body = { id: 'user1', name: 'Test User' };
      const expectedEtag = `"${createHash('md5').update(JSON.stringify(body)).digest('hex')}"`;

      // Poblar la caché
      interceptor.intercept(
        mockExecutionContext(mockRequest('GET'), mockResponse()),
        mockCallHandler(body),
      ).subscribe();

      // Fingir que pasó más tiempo que el TTL (por defecto 30s)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31000);

      const res = mockResponse();
      const ctx = mockExecutionContext(mockRequest('GET', { 'if-none-match': expectedEtag }), res);
      const handleSpy = jest.fn(() => of(body));
      let result: any;
      interceptor.intercept(ctx, { handle: handleSpy } as any).subscribe((r) => (result = r));

      // La caché expiró → el handler SÍ se ejecuta (no se confía en la caché vieja)
      expect(handleSpy).toHaveBeenCalledTimes(1);
      // Pero como el cuerpo no cambió, el ETag recién calculado coincide → 304
      expect(res.status).toHaveBeenCalledWith(304);
      expect(result).toBeUndefined();

      jest.restoreAllMocks();
    });

    it('should not leak cache entries between different users', () => {
      const bodyA = { id: 'user1', name: 'Test User' };
      const etagA = `"${createHash('md5').update(JSON.stringify(bodyA)).digest('hex')}"`;

      // Poblar caché con el usuario A
      interceptor.intercept(
        mockExecutionContext(mockRequest('GET', {}, { user: { id: 'usuario-a' } }), mockResponse()),
        mockCallHandler(bodyA),
      ).subscribe();

      // El usuario B con el mismo If-None-Match NO debe recibir 304: su caché
      // es distinta (clave incluye userId), por lo que el handler se ejecuta.
      const bodyB = { id: 'user2', name: 'Otro User' }; // contenido distinto
      const res = mockResponse();
      const ctx = mockExecutionContext(
        mockRequest('GET', { 'if-none-match': etagA }, { user: { id: 'usuario-b' } }),
        res,
      );
      const handleSpy = jest.fn(() => of(bodyB));
      let result: any;
      interceptor.intercept(ctx, { handle: handleSpy } as any).subscribe((r) => (result = r));

      // Sin fuga de caché: B ejecuta el handler y recibe SU cuerpo (200)
      expect(handleSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual(bodyB);
      expect(res._status).toBe(200);
    });
  });

  describe('Non-GET requests', () => {
    it('should pass through POST requests without ETag logic', () => {
      const body = { created: true };
      const req = mockRequest('POST');
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      let result: any;
      interceptor.intercept(ctx, callHandler).subscribe((r) => (result = r));

      // ETag should NOT be set
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(result).toEqual(body);
    });

    it('should pass through PUT requests without ETag logic', () => {
      const body = { updated: true };
      const req = mockRequest('PUT');
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      let result: any;
      interceptor.intercept(ctx, callHandler).subscribe((r) => (result = r));

      expect(res.setHeader).not.toHaveBeenCalled();
      expect(result).toEqual(body);
    });

    it('should pass through DELETE requests without ETag logic', () => {
      const body = { deleted: true };
      const req = mockRequest('DELETE');
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      let result: any;
      interceptor.intercept(ctx, callHandler).subscribe((r) => (result = r));

      expect(res.setHeader).not.toHaveBeenCalled();
      expect(result).toEqual(body);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty body', () => {
      const body = {};
      const req = mockRequest('GET');
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      let result: any;
      interceptor.intercept(ctx, callHandler).subscribe((r) => (result = r));

      expect(res.setHeader).toHaveBeenCalledWith('ETag', expect.any(String));
      expect(result).toEqual(body);
    });

    it('should handle null body', () => {
      const body: null = null;
      const req = mockRequest('GET');
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      let result: any;
      interceptor.intercept(ctx, callHandler).subscribe((r) => (result = r));

      expect(res.setHeader).toHaveBeenCalledWith('ETag', expect.any(String));
      expect(result).toBeNull();
    });

    it('should not crash when the handler returns undefined', () => {
      const body: undefined = undefined;
      const req = mockRequest('GET');
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      let result: any;
      let error: any;
      interceptor.intercept(ctx, callHandler).subscribe({
        next: (r) => (result = r),
        error: (e) => (error = e),
      });

      expect(error).toBeUndefined();
      expect(result).toBeUndefined();
      // No debe haber intentado calcular ETag sobre undefined
      expect(res.setHeader).not.toHaveBeenCalledWith('ETag', expect.any(String));
    });

    it('should handle complex nested body', () => {
      const body = {
        user: { id: '1', name: 'Test' },
        profiling: { disability_types: ['autismo'], needs: ['comunicacion'] },
        items: [1, 2, 3],
      };
      const req = mockRequest('GET');
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      let result: any;
      interceptor.intercept(ctx, callHandler).subscribe((r) => (result = r));

      const expectedEtag = `"${createHash('md5').update(JSON.stringify(body)).digest('hex')}"`;
      expect(res.setHeader).toHaveBeenCalledWith('ETag', expectedEtag);
      expect(result).toEqual(body);
    });
  });
});
