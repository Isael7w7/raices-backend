import { Injectable, ConflictException, UnauthorizedException, Inject, Logger, Optional } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { v4 as uuid } from 'uuid'
import axios from 'axios'
import { FIRESTORE, FIREBASE_AUTH } from '../../database/firebase.provider'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { EmailService } from '../email/email.service'
import { FirebaseAnalyticsService } from '../admin/firebase-analytics.service'
import type { Auth as FirebaseAuth } from 'firebase-admin/auth'

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService')
  private readonly firebaseApiKey: string
  private readonly identityToolkitUrl: string
  private readonly secureTokenUrl: string
  private readonly defaultExpiresIn = 3600

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuth,
    private readonly emailService: EmailService,
    @Optional() private readonly analytics?: FirebaseAnalyticsService,
  ) {
    this.firebaseApiKey = process.env.FIREBASE_API_KEY ?? ''
    if (!this.firebaseApiKey) {
      this.logger.warn('FIREBASE_API_KEY is not set. Auth REST API calls will fail.')
    }
    this.identityToolkitUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.firebaseApiKey}`
    this.secureTokenUrl = `https://securetoken.googleapis.com/v1/token?key=${this.firebaseApiKey}`
  }

  async register(dto: RegisterDto) {
    const snapshot = await this.db.collection('u_profiles')
      .where('email', '==', dto.email).limit(1).get()
    if (!snapshot.empty) throw new ConflictException('Email ya registrado')

    let firebaseUser
    try {
      firebaseUser = await this.auth.createUser({
        email: dto.email,
        password: dto.password,
        displayName: dto.full_name,
      })
    } catch (e: any) {
      this.logger.error(`Firebase Auth user creation failed: ${e?.message ?? e}`)
      if (e?.code === 'auth/email-already-exists') {
        throw new ConflictException('Email ya registrado en Firebase Auth')
      }
      throw new UnauthorizedException('Error al crear usuario')
    }

    const uid = firebaseUser.uid

    await this.db.collection('u_profiles').doc(uid).set({
      id: uid,
      email: dto.email,
      full_name: dto.full_name,
      role: dto.role,
      city: dto.city ?? null,
      state: dto.state ?? null,
      is_active: true,
      is_verified: false,
      created_at: new Date().toISOString(),
    })

    let idToken: string
    let refreshToken: string
    try {
      const signInResponse = await axios.post(this.identityToolkitUrl, {
        email: dto.email,
        password: dto.password,
        returnSecureToken: true,
      })
      idToken = signInResponse.data.idToken
      refreshToken = signInResponse.data.refreshToken
    } catch (e: any) {
      this.logger.warn(`Sign-in after register failed: ${e?.message ?? e}. Generating custom token.`)
      const customToken = await this.auth.createCustomToken(uid)
      idToken = customToken
      refreshToken = ''
    }

    const user = {
      id: uid,
      email: dto.email,
      role: dto.role,
      full_name: dto.full_name,
    }

    await this.analytics?.increment('total_usuarios')
    await this.analytics?.increment('usuarios_activos')

    this.emailService.sendWelcome(dto.email, dto.full_name).catch(() => null)

    return {
      token: idToken,
      refreshToken,
      expiresIn: this.defaultExpiresIn,
      user,
    }
  }

  async login(dto: LoginDto) {
    let signInResponse
    try {
      signInResponse = await axios.post(this.identityToolkitUrl, {
        email: dto.email,
        password: dto.password,
        returnSecureToken: true,
      })
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e
      const status = e?.response?.status
      if (status === 400) {
        const errorMsg = e?.response?.data?.error?.message
        if (errorMsg === 'EMAIL_NOT_FOUND' || errorMsg === 'INVALID_PASSWORD') {
          throw new UnauthorizedException('Credenciales incorrectas')
        }
        if (errorMsg === 'USER_DISABLED') {
          throw new UnauthorizedException('Cuenta desactivada')
        }
      }
      this.logger.error(`Login failed: ${e?.message ?? e}`)
      throw new UnauthorizedException('Credenciales incorrectas')
    }

    const { idToken, refreshToken } = signInResponse.data

    const decodedToken = await this.auth.verifyIdToken(idToken)

    const doc = await this.db.collection('u_profiles').doc(decodedToken.uid).get()
    if (!doc.exists) {
      throw new UnauthorizedException('Usuario no encontrado')
    }

    const user = doc.data()!
    if (!user.is_active) {
      throw new UnauthorizedException('Cuenta desactivada')
    }

    return {
      token: idToken,
      refreshToken,
      expiresIn: this.defaultExpiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
      },
    }
  }

  async refresh(refreshToken: string) {
    try {
      const response = await axios.post(this.secureTokenUrl, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })

      const { id_token, refresh_token, user_id } = response.data

      const doc = await this.db.collection('u_profiles').doc(user_id).get()
      if (!doc.exists) {
        throw new UnauthorizedException('Usuario no encontrado')
      }

      const user = doc.data()!
      if (!user.is_active) {
        throw new UnauthorizedException('Cuenta desactivada')
      }

      return {
        token: id_token,
        refreshToken: refresh_token,
        expiresIn: this.defaultExpiresIn,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          full_name: user.full_name,
        },
      }
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
      id: d.id,
      email: d.email,
      role: d.role,
      full_name: d.full_name,
      city: d.city,
      state: d.state,
      avatar_url: d.avatar_url,
      is_verified: d.is_verified,
    }
  }
}
