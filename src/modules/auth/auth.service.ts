import { Injectable, ConflictException, UnauthorizedException, Inject } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { Knex } from 'knex'
import { KNEX_CONNECTION } from '../../database/knex.provider'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { EmailService } from '../email/email.service'

@Injectable()
export class AuthService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly db: Knex,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.db('u_profiles').where({ email: dto.email }).first()
    if (exists) throw new ConflictException('Email ya registrado')

    const id = uuid()
    const password_hash = await bcrypt.hash(dto.password, 10)

    await this.db('u_profiles').insert({
      id, email: dto.email, password_hash, full_name: dto.full_name,
      role: dto.role, city: dto.city ?? null, state: dto.state ?? null,
    })

    const user = { id, email: dto.email, role: dto.role, full_name: dto.full_name }
    const token = this.jwtService.sign({ sub: id, email: dto.email, role: dto.role })

    this.emailService.sendWelcome(dto.email, dto.full_name).catch(() => null)

    return { token, user }
  }

  async login(dto: LoginDto) {
    const user = await this.db('u_profiles').where({ email: dto.email }).first()
    if (!user) throw new UnauthorizedException('Credenciales incorrectas')
    if (!user.is_active) throw new UnauthorizedException('Cuenta desactivada')

    const valid = await bcrypt.compare(dto.password, user.password_hash)
    if (!valid) throw new UnauthorizedException('Credenciales incorrectas')

    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role })
    return { token, user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } }
  }

  async me(userId: string) {
    const user = await this.db('u_profiles')
      .where({ id: userId })
      .select('id', 'email', 'role', 'full_name', 'city', 'state', 'avatar_url', 'is_verified')
      .first()
    return user
  }
}
