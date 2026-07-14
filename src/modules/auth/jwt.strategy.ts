import { Injectable, UnauthorizedException, Logger } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import * as dotenv from 'dotenv'
dotenv.config()

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger('JwtStrategy')

  constructor() {
    const secret = process.env.JWT_SECRET ?? 'raices_demo_secret_2026'

    console.log('🔑 [JwtStrategy] ─── CONSTRUCTOR ───')
    console.log('🔑 [JwtStrategy] Mode: HS256 (local secret)')
    console.log('🔑 [JwtStrategy] Secret from env:', process.env.JWT_SECRET ? 'YES' : 'NO (using fallback)')

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: any) => req?.query?.token ?? null,
      ]),
      secretOrKey: secret,
      algorithms: ['HS256'],
    })

    console.log('🔑 [JwtStrategy] Strategy initialized successfully')
  }

  async validate(payload: any) {
    console.log('🔍 [JwtStrategy] ─── VALIDATE() ───')

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
