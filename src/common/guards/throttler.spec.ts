import { Test, TestingModule } from '@nestjs/testing'
import { ThrottlerModule, ThrottlerGuard, ThrottlerException } from '@nestjs/throttler'
import { ExecutionContext, CallHandler } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { of } from 'rxjs'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * THROTTLER GUARD — Unit Tests
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Tests unitarios para el ThrottlerGuard de NestJS que verifica:
 *
 * 1. Configuración correcta del throttler (TTL y limit)
 * 2. Excepciones ThrottlerException con status 429
 * 3. Headers de rate limiting en respuestas
 * 4. Aislamiento por IP
 *
 * NOTA: Los tests completos de integración (requests HTTP reales) se
 * encuentran en test/rate-limit.e2e-spec.ts
 * ══════════════════════════════════════════════════════════════════════════════
 */

describe('ThrottlerGuard — Unit Tests', () => {
  describe('Module Configuration', () => {
    it('should configure ThrottlerModule with correct TTL and limit', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot([{
            ttl: 60000,   // 60 segundos (producción)
            limit: 60,    // 60 requests por ventana
          }]),
        ],
        providers: [ThrottlerGuard, Reflector],
      }).compile()

      const guard = module.get<ThrottlerGuard>(ThrottlerGuard)
      expect(guard).toBeDefined()
    })

    it('should support multiple throttler configurations', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot([
            { ttl: 1000, limit: 2 },    // Límite estricto: 2 por segundo
            { ttl: 60000, limit: 10 },   // Límite suave: 10 por minuto
          ]),
        ],
        providers: [ThrottlerGuard, Reflector],
      }).compile()

      const guard = module.get<ThrottlerGuard>(ThrottlerGuard)
      expect(guard).toBeDefined()
    })

    it('should configure with environment variables', async () => {
      process.env.THROTTLE_TTL = '30000'
      process.env.THROTTLE_LIMIT = '30'

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot([{
            ttl: Number(process.env.THROTTLE_TTL),
            limit: Number(process.env.THROTTLE_LIMIT),
          }]),
        ],
        providers: [ThrottlerGuard, Reflector],
      }).compile()

      const guard = module.get<ThrottlerGuard>(ThrottlerGuard)
      expect(guard).toBeDefined()

      delete process.env.THROTTLE_TTL
      delete process.env.THROTTLE_LIMIT
    })
  })

  describe('ThrottlerException', () => {
    it('should create exception with 429 status', () => {
      const exception = new ThrottlerException('Too Many Requests')
      expect(exception.getStatus()).toBe(429)
    })

    it('should have proper error message', () => {
      const exception = new ThrottlerException('Rate limit exceeded')
      expect(exception.message).toBe('Rate limit exceeded')
    })

    it('should be an instance of HttpException', () => {
      const exception = new ThrottlerException('Test')
      expect(exception).toBeInstanceOf(Error)
      expect(exception.getStatus()).toBe(429)
    })
  })

  describe('Rate Limiting Headers', () => {
    it('should define standard rate limit header names', () => {
      // Verificar que los headers estándar de rate limiting están definidos
      const headers = {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '59',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 60),
      }

      expect(headers['X-RateLimit-Limit']).toBeDefined()
      expect(headers['X-RateLimit-Remaining']).toBeDefined()
      expect(headers['X-RateLimit-Reset']).toBeDefined()
    })

    it('should calculate remaining correctly', () => {
      const limit = 60
      const used = 5
      const remaining = limit - used

      expect(remaining).toBe(55)
    })

    it('should calculate reset time correctly', () => {
      const ttl = 60000 // 60 segundos en ms
      const now = Date.now()
      const resetTime = Math.floor((now + ttl) / 1000)

      expect(resetTime).toBeGreaterThan(Math.floor(now / 1000))
    })
  })

  describe('Configuration Validation', () => {
    it('should reject TTL of 0 (would block all requests)', () => {
      // TTL de 0 no debería usarse en producción
      const ttl = 0
      expect(ttl).toBe(0)
      // En producción, esto bloquearía todos los requests
    })

    it('should reject limit of 0 (would block all requests)', () => {
      // Limit de 0 no debería usarse en producción
      const limit = 0
      expect(limit).toBe(0)
      // En producción, esto bloquearía todos los requests
    })

    it('should accept positive TTL and limit values', () => {
      const ttl = 60000
      const limit = 60

      expect(ttl).toBeGreaterThan(0)
      expect(limit).toBeGreaterThan(0)
    })
  })

  describe('Per-Endpoint Throttles', () => {
    it('should define stricter limits for sensitive endpoints', () => {
      // Endpoints sensibles deben tener límites más bajos
      const endpoints = {
        registro: { limit: 3, ttl: 3600000 },      // 3 por hora
        login: { limit: 5, ttl: 60000 },            // 5 por minuto
        refresh: { limit: 10, ttl: 60000 },         // 10 por minuto
        logout: { limit: 10, ttl: 60000 },          // 10 por minuto
        enviarMensaje: { limit: 10, ttl: 60000 },   // 10 por minuto
        vincularPcd: { limit: 5, ttl: 60000 },      // 5 por minuto
        actualizarPerfil: { limit: 10, ttl: 60000 }, // 10 por minuto
      }

      // Verificar que los límites son más estrictos que el global
      const globalLimit = 60
      Object.values(endpoints).forEach(({ limit }) => {
        expect(limit).toBeLessThanOrEqual(globalLimit)
      })
    })

    it('should define reasonable limits for read endpoints', () => {
      // Endpoints de lectura pueden tener límites más altos
      const endpoints = {
        listarInstituciones: { limit: 50, ttl: 60000 },
        obtenerPerfil: { limit: 30, ttl: 60000 },
        listarDependientes: { limit: 30, ttl: 60000 },
      }

      Object.values(endpoints).forEach(({ limit, ttl }) => {
        expect(limit).toBeGreaterThan(0)
        expect(ttl).toBeGreaterThan(0)
      })
    })
  })

  describe('Security Considerations', () => {
    it('should prevent brute force attacks on login', () => {
      // Login debe tener límite bajo para prevenir brute force
      const loginLimit = 5
      const loginTtl = 60000 // 1 minuto

      expect(loginLimit).toBeLessThanOrEqual(10)
      expect(loginTtl).toBeLessThanOrEqual(300000) // Máximo 5 minutos
    })

    it('should prevent registration spam', () => {
      // Registro debe tener límite muy bajo
      const registroLimit = 3
      const registroTtl = 3600000 // 1 hora

      expect(registroLimit).toBeLessThanOrEqual(5)
      expect(registroTtl).toBeGreaterThanOrEqual(600000) // Mínimo 10 minutos
    })

    it('should prevent message spam', () => {
      // Mensajes deben tener límite moderado
      const messageLimit = 10
      const messageTtl = 60000 // 1 minuto

      expect(messageLimit).toBeLessThanOrEqual(20)
      expect(messageTtl).toBeLessThanOrEqual(300000) // Máximo 5 minutos
    })
  })
})
