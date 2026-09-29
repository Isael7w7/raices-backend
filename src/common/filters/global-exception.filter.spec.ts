import { ArgumentsHost, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { GlobalExceptionFilter, emitirLogEstructurado } from './global-exception.filter';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function mockRequest(opts: { method?: string; url?: string; originalUrl?: string; user?: { id?: string } } = {}) {
  return {
    method: opts.method ?? 'GET',
    url: opts.url ?? '/api/health',
    originalUrl: opts.originalUrl ?? '/api/health',
    user: opts.user,
  };
}

function mockResponse() {
  const res: any = {
    headersSent: false,
    _status: 200,
    _body: undefined as unknown,
  };
  res.status = jest.fn((code: number) => {
    res._status = code;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    res._body = body;
    return res;
  });
  return res;
}

function mockHost(req: any, res: any): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as any;
}

/** Devuelve el último registro JSON emitido por el filtro. */
function ultimoRegistro(logSpy: jest.SpyInstance): any {
  const ultimaLlamada = logSpy.mock.calls[logSpy.mock.calls.length - 1];
  return JSON.parse(ultimaLlamada[0] as string);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    // El filtro escribe una línea JSON en stdout: se captura para las aserciones
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  describe('logs estructurados (5xx → ERROR)', () => {
    it('should emit a structured JSON log with severity ERROR for a 500', () => {
      const req = mockRequest({ method: 'POST', originalUrl: '/api/instituciones?x=1', user: { id: 'usuario-1' } });
      const res = mockResponse();

      filter.catch(new InternalServerErrorException('Fallo en Firestore'), mockHost(req, res));

      const registro = ultimoRegistro(logSpy);
      expect(registro).toMatchObject({
        severity: 'ERROR',
        statusCode: 500,
        path: '/api/instituciones?x=1',
        method: 'POST',
        userId: 'usuario-1',
        context: 'GlobalExceptionFilter',
      });
      expect(typeof registro.message).toBe('string');
      expect(registro.message.length).toBeGreaterThan(0);
      expect(typeof registro.stack).toBe('string');
      expect(registro.stack.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(registro.timestamp))).toBe(false);
    });

    it('should emit exactly one single-line JSON payload (Cloud Logging friendly)', () => {
      const res = mockResponse();

      filter.catch(new Error('boom'), mockHost(mockRequest(), res));

      expect(logSpy).toHaveBeenCalledTimes(1);
      const linea = logSpy.mock.calls[0][0] as string;
      expect(linea).not.toContain('\n');
      expect(() => JSON.parse(linea)).not.toThrow();
    });

    it('should log severity ERROR for unexpected (non-HTTP) exceptions', () => {
      const res = mockResponse();

      filter.catch(new TypeError('x.map is not a function'), mockHost(mockRequest(), res));

      const registro = ultimoRegistro(logSpy);
      expect(registro.severity).toBe('ERROR');
      expect(registro.statusCode).toBe(500);
      expect(registro.message).toBe('x.map is not a function');
      expect(registro.stack).toContain('TypeError');
    });

    it('should respond with a generic body that does not leak the internal error', () => {
      const res = mockResponse();

      filter.catch(new Error('credenciales de servicio inválidas'), mockHost(mockRequest(), res));

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res._body).toEqual({ statusCode: 500, message: 'Error interno del servidor' });
      expect(JSON.stringify(res._body)).not.toContain('credenciales');
    });
  });

  describe('logs estructurados (4xx → WARNING)', () => {
    it('should emit severity WARNING and no stack for a 404', () => {
      const res = mockResponse();

      filter.catch(new NotFoundException('Institución no encontrada'), mockHost(mockRequest(), res));

      const registro = ultimoRegistro(logSpy);
      expect(registro.severity).toBe('WARNING');
      expect(registro.statusCode).toBe(404);
      expect(registro.stack).toBe('');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res._body.message).toBe('Institución no encontrada');
    });

    it('should flatten validation error arrays into a single message', () => {
      const res = mockResponse();

      filter.catch(new BadRequestException(['campo A requerido', 'campo B inválido']), mockHost(mockRequest(), res));

      const registro = ultimoRegistro(logSpy);
      expect(registro.severity).toBe('WARNING');
      expect(registro.statusCode).toBe(400);
      expect(registro.message).toBe('campo A requerido, campo B inválido');
    });
  });

  describe('userId (solo si existe sesión)', () => {
    it('should include userId when the session exists', () => {
      const res = mockResponse();

      filter.catch(new Error('fallo'), mockHost(mockRequest({ user: { id: 'uid-42' } }), res));

      expect(ultimoRegistro(logSpy).userId).toBe('uid-42');
    });

    it('should omit userId when there is no session', () => {
      const res = mockResponse();

      filter.catch(new Error('fallo'), mockHost(mockRequest(), res));

      expect(ultimoRegistro(logSpy)).not.toHaveProperty('userId');
    });
  });

  describe('edge cases', () => {
    it('should not attempt to respond twice when headers were already sent', () => {
      const res = mockResponse();
      res.headersSent = true;

      filter.catch(new Error('fallo'), mockHost(mockRequest(), res));

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      // El log crítico se emite igual: la observabilidad no depende de la respuesta
      expect(ultimoRegistro(logSpy).severity).toBe('ERROR');
    });
  });
});

describe('emitirLogEstructurado', () => {
  it('should write timestamp first followed by the payload fields', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    emitirLogEstructurado({ severity: 'ERROR', message: 'x', statusCode: 500, path: '-', method: '-', stack: '' });

    const registro = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(Object.keys(registro)[0]).toBe('timestamp');
    expect(registro.severity).toBe('ERROR');

    logSpy.mockRestore();
  });
});
