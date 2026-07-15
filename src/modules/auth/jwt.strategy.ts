import { Injectable, UnauthorizedException, Logger } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger('JwtStrategy')

  constructor() {
    const secret = process.env.JWT_SECRET

    if (!secret) {
      throw new Error(
        'JWT_SECRET is not defined in environment variables. ' +
        'Set JWT_SECRET in your .env file or environment before starting the server.'
      )
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: any) => req?.query?.token ?? null,
      ]),
      secretOrKey: secret,
      algorithms: ['HS256'],
    })

    this.logger.log('Strategy initialized (HS256)')
  }

  async validate(payload: any) {
    if (!payload) {
      throw new UnauthorizedException('Token payload is empty')
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Token missing subject (sub)')
    }

    return { id: payload.sub, email: payload.email, role: payload.role }
  }
}
