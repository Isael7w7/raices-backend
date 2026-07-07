import { Injectable, UnauthorizedException, Logger } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import * as dotenv from 'dotenv'
import { JwksClient } from 'jwks-rsa'
dotenv.config()

/** Allowed algorithms — validated manually since passport-jwt ignores `algorithms` with secretOrKeyProvider */
const ALLOWED_ALGORITHMS = ['RS256']

function decodeJwtHeader(token: string): { alg?: string; kid?: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    return JSON.parse(Buffer.from(parts[0], 'base64url').toString())
  } catch {
    return null
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger('JwtStrategy')

  constructor() {
    const jwksUri = process.env.JWKS_URI
    const localSecret = process.env.JWT_SECRET ?? 'raices_demo_secret_2026'

    console.log('🔑 [JwtStrategy] ─── CONSTRUCTOR ───')

    let strategyOptions: any

    if (jwksUri) {
      console.log('🔑 [JwtStrategy] JWKS_URI:', jwksUri.substring(0, 60) + '...')
      console.log('🔑 [JwtStrategy] Mode: RS256 (JWKS) — manual algorithm validation')

      const client = new JwksClient({
        jwksUri,
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
      })

      strategyOptions = {
        jwtFromRequest: ExtractJwt.fromExtractors([
          ExtractJwt.fromAuthHeaderAsBearerToken(),
          (req: any) => req?.query?.token ?? null,
        ]),
        secretOrKeyProvider: (
          request: any,
          jwtToken: any,
          done: (err: Error | null, secretOrKey?: string | Buffer) => void,
        ) => {
          // 1. Decode the JWT header to get alg and kid
          const header = decodeJwtHeader(jwtToken)
          if (!header) {
            console.error('❌ [JwtStrategy] Could not decode JWT header')
            return done(new Error('Invalid JWT format'))
          }

          console.log('🔑 [JwtStrategy] JWT header alg:', header.alg, '| kid:', header.kid)

          // 2. Validate algorithm manually (passport-jwt ignores `algorithms` with secretOrKeyProvider)
          if (!header.alg || !ALLOWED_ALGORITHMS.includes(header.alg)) {
            console.error('❌ [JwtStrategy] Rejected algorithm:', header.alg, '| allowed:', ALLOWED_ALGORITHMS)
            return done(new Error(`Invalid algorithm: ${header.alg}. Allowed: ${ALLOWED_ALGORITHMS.join(', ')}`))
          }

          // 3. Fetch the signing key from JWKS
          const kid = header.kid || '1'
          console.log('🔑 [JwtStrategy] Fetching signing key for kid:', kid)

          client.getSigningKey(kid, (err, key) => {
            if (err) {
              console.error('❌ [JwtStrategy] Error fetching signing key:', err.message)
              return done(err)
            }
            const publicKey = key?.getPublicKey()
            if (!publicKey) {
              console.error('❌ [JwtStrategy] No public key found for kid:', kid)
              return done(new Error('No public key found'))
            }
            console.log('✅ [JwtStrategy] Got public key for kid:', kid)
            done(null, publicKey)
          })
        },
        // NOTE: `algorithms` is NOT passed here because passport-jwt ignores it
        // when secretOrKeyProvider is used. Algorithm validation is done manually above.
      }
    } else {
      console.log('🔑 [JwtStrategy] Mode: HS256 (local secret)')
      console.log('🔑 [JwtStrategy] Secret from env:', process.env.JWT_SECRET ? 'YES' : 'NO (using fallback)')

      strategyOptions = {
        jwtFromRequest: ExtractJwt.fromExtractors([
          ExtractJwt.fromAuthHeaderAsBearerToken(),
          (req: any) => req?.query?.token ?? null,
        ]),
        secretOrKey: localSecret,
      }
    }

    super(strategyOptions)
    console.log('🔑 [JwtStrategy] Strategy initialized successfully')
  }

  async validate(payload: any) {
    console.log('🔍 [JwtStrategy] ─── VALIDATE() ───')
    console.log('🔍 [JwtStrategy] Payload:', JSON.stringify(payload, null, 2))

    if (payload) {
      console.log('🔍 [JwtStrategy] Payload keys:', Object.keys(payload))
      console.log('🔍 [JwtStrategy] sub:', payload.sub)
      console.log('🔍 [JwtStrategy] email:', payload.email)
      console.log('🔍 [JwtStrategy] role:', payload.role)
      console.log('🔍 [JwtStrategy] iat:', payload.iat, '→', new Date((payload.iat ?? 0) * 1000).toISOString())
      console.log('🔍 [JwtStrategy] exp:', payload.exp, '→', new Date((payload.exp ?? 0) * 1000).toISOString())
    }

    if (!payload) {
      console.log('❌ [JwtStrategy] validate() - payload is null/undefined')
      throw new UnauthorizedException('Token payload is empty')
    }

    if (!payload.sub) {
      console.log('❌ [JwtStrategy] validate() - payload.sub is MISSING. Keys:', Object.keys(payload))
      throw new UnauthorizedException('Token missing subject (sub)')
    }

    const user = { id: payload.sub, email: payload.email, role: payload.role }
    console.log('✅ [JwtStrategy] validate() - SUCCESS →', JSON.stringify(user))
    return user
  }
}
