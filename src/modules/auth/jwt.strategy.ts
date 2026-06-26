import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import * as dotenv from 'dotenv'
dotenv.config()

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: any) => req?.query?.token ?? null,
      ]),
      secretOrKey: process.env.JWT_SECRET ?? 'raices_demo_secret_2026',
    })
  }

  async validate(payload: any) {
    if (!payload.sub) throw new UnauthorizedException()
    return { id: payload.sub, email: payload.email, role: payload.role }
  }
}
