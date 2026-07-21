import { Injectable, ConflictException, UnauthorizedException, Inject, Logger, Optional } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE, FIREBASE_AUTH } from '../../database/firebase.provider'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { EmailService } from '../email/email.service'
import { FirebaseAnalyticsService } from '../admin/firebase-analytics.service'
import type { Auth as FirebaseAuth } from 'firebase-admin/auth'

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService')
  private readonly refreshTokenExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN ?? '30d'

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuth,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    @Optional() private readonly analytics?: FirebaseAnalyticsService,
  ) {}

  private generateTokens(payload: { sub: string; email: string; role: string }) {
    const token = this.jwtService.sign(payload)
    const refreshToken = this.jwtService.sign(payload, { expiresIn: this.refreshTokenExpiresIn })
    // expiresIn en segundos (1h = 3600s)
    const expiresIn = 3600
    return { token, refreshToken, expiresIn }
  }

  async register(dto: RegisterDto) {
    const snapshot = await this.db.collection('u_profiles')
      .where('email', '==', dto.email).limit(1).get()
    if (!snapshot.empty) throw new ConflictException('Email ya registrado')

    const id = uuid()
    const password_hash = await bcrypt.hash(dto.password, 10)

    // Create in Firebase Auth for frontend compatibility
    try {
      await this.auth.createUser({
        uid: id,
        email: dto.email,
        password: dto.password,
        displayName: dto.full_name,
      })
    } catch (e: any) {
      this.logger.warn(`Firebase Auth user creation skipped: ${e?.message ?? e}`)
    }

    // Store profile in Firestore
    await this.db.collection('u_profiles').doc(id).set({
      id, email: dto.email, password_hash, full_name: dto.full_name,
      role: dto.role, city: dto.city ?? null, state: dto.state ?? null,
      is_active: true, is_verified: false, created_at: new Date().toISOString(),
    })

    const user = { id, email: dto.email, role: dto.role, full_name: dto.full_name }
    const tokens = this.generateTokens({ sub: id, email: dto.email, role: dto.role })

    // Actualizar contadores en Firestore (escrituras ciegas, mínimo costo)
    await this.analytics?.increment('total_usuarios')
    await this.analytics?.increment('usuarios_activos')

    this.emailService.sendWelcome(dto.email, dto.full_name).catch(() => null)

    return { ...tokens, user }
  }

  async login(dto: LoginDto) {
    const snapshot = await this.db.collection('u_profiles')
      .where('email', '==', dto.email).limit(1).get()
    if (snapshot.empty) throw new UnauthorizedException('Credenciales incorrectas')

    const user = snapshot.docs[0].data()
    if (!user.is_active) throw new UnauthorizedException('Cuenta desactivada')

    const valid = await bcrypt.compare(dto.password, user.password_hash)
    if (!valid) throw new UnauthorizedException('Credenciales incorrectas')

    const tokens = this.generateTokens({ sub: user.id, email: user.email, role: user.role })
    return { ...tokens, user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken)
      if (!payload?.sub) throw new UnauthorizedException('Refresh token inválido')

      // Verificar que el usuario sigue activo
      const doc = await this.db.collection('u_profiles').doc(payload.sub).get()
      if (!doc.exists) throw new UnauthorizedException('Usuario no encontrado')
      const user = doc.data()!
      if (!user.is_active) throw new UnauthorizedException('Cuenta desactivada')

      const tokens = this.generateTokens({ sub: user.id, email: user.email, role: user.role })
      return { ...tokens, user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name } }
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e
      this.logger.warn(`Refresh token verification failed: ${e?.message ?? e}`)
      throw new UnauthorizedException('Refresh token inválido o expirado')
    }
  }

  async me(userId: string) {
    const doc = await this.db.collection('u_profiles').doc(userId).get()
    if (!doc.exists) return null
    const d = doc.data()!
    return {
      id: d.id, email: d.email, role: d.role, full_name: d.full_name,
      city: d.city, state: d.state, avatar_url: d.avatar_url, is_verified: d.is_verified,
    }
  }
}
