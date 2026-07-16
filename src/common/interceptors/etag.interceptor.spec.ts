import { ETagInterceptor } from './etag.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { createHash } from 'crypto';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function mockRequest(method = 'GET', headers: Record<string, string> = {}) {
  return {
    method,
    headers,
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
      const body = null;
      const req = mockRequest('GET');
      const res = mockResponse();
      const ctx = mockExecutionContext(req, res);
      const callHandler = mockCallHandler(body);

      let result: any;
      interceptor.intercept(ctx, callHandler).subscribe((r) => (result = r));

      expect(res.setHeader).toHaveBeenCalledWith('ETag', expect.any(String));
      expect(result).toBeNull();
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
