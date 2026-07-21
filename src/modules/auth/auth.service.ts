import { Injectable, ConflictException, UnauthorizedException, Inject, Logger, Optional } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE, FIREBASE_AUTH } from '../../database/firebase.provider'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { EmailService } from '../email/email.service'
import { FirebaseAnalyticsService } from '../admin/firebase-analytics.service'
import type { Auth as FirebaseAuth } from 'firebase-admin/auth'

/** Firebase Identity Toolkit REST API base URLs */
const FIREBASE_AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts'
const FIREBASE_TOKEN_URL = 'https://securetoken.googleapis.com/v1/token'

/** Expected response shape from the frontend's perspective */
interface AuthTokensResponse {
  token: string
  refreshToken: string
  expiresIn: number
  user: { id: string; email: string; role: string; full_name: string }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService')

  /** Firebase Web API Key required by the Identity Toolkit REST API */
  private get apiKey(): string {
    const key = process.env.FIREBASE_API_KEY
    if (!key) {
      throw new UnauthorizedException('FIREBASE_API_KEY no está configurado en el servidor')
    }
    return key
  }

  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    @Inject(FIREBASE_AUTH) private readonly auth: FirebaseAuth,
    private readonly emailService: EmailService,
    @Optional() private readonly analytics?: FirebaseAnalyticsService,
  ) {}

  // ── Firebase REST API helpers ───────────────────────────────────────────

  /**
   * Calls Firebase Identity Toolkit signInWithPassword endpoint.
   * Returns the raw Firebase response containing idToken, refreshToken, etc.
   */
  private async firebaseSignIn(email: string, password: string) {
    const url = `${FIREBASE_AUTH_URL}:signInWithPassword?key=${this.apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    })

    const data = await res.json() as any

    if (!res.ok) {
      // Map Firebase error codes to friendly messages
      const code: string = data?.error?.message ?? 'UNKNOWN'
      if (code === 'EMAIL_NOT_FOUND' || code === 'INVALID_PASSWORD' || code === 'INVALID_LOGIN_CREDENTIALS') {
        throw new UnauthorizedException('Credenciales incorrectas')
      }
      if (code === 'USER_DISABLED') {
        throw new UnauthorizedException('Cuenta desactivada')
      }
      this.logger.warn(`Firebase signIn error: ${code}`)
      throw new UnauthorizedException('Error al autenticar con Firebase')
    }

    return data as {
      idToken: string
      refreshToken: string
      expiresIn: string // seconds as string e.g. "3600"
      localId: string
      email: string
      registered: boolean
    }
  }

  /**
   * Calls Firebase token endpoint to exchange a refresh token for a new ID token.
   * Returns the raw Firebase response.
   */
  private async firebaseRefreshToken(refreshToken: string) {
    const url = `${FIREBASE_TOKEN_URL}?key=${this.apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    })

    const data = await res.json() as any

    if (!res.ok) {
      const code: string = data?.error?.message ?? 'UNKNOWN'
      this.logger.warn(`Firebase token refresh error: ${code}`)
      throw new UnauthorizedException('Refresh token inválido o expirado')
    }

    return data as {
      access_token: string   // new ID token
      expires_in: string     // seconds as string
      token_type: string     // "Bearer"
      refresh_token: string  // may be same or rotated
      user_id: string
      project_id: string
    }
  }

  // ── Firestore profile helpers ───────────────────────────────────────────

  /**
   * Fetches the user profile from Firestore and returns the shape expected by the frontend.
   * Throws if the user is not found or is deactivated.
   */
  private async getUserProfile(uid: string): Promise<{ id: string; email: string; role: string; full_name: string }> {
    const doc = await this.db.collection('u_profiles').doc(uid).get()
    if (!doc.exists) {
      throw new UnauthorizedException('Usuario no encontrado')
    }
    const d = doc.data()!
    if (d.is_active === false) {
      throw new UnauthorizedException('Cuenta desactivada')
    }
    return {
      id: d.id ?? uid,
      email: d.email,
      role: d.role ?? 'pcd',
      full_name: d.full_name ?? '',
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * POST /auth/register
   * Creates the user in Firebase Auth + Firestore, then signs in via REST API
   * to return the same token structure the frontend expects.
   */
  async register(dto: RegisterDto): Promise<AuthTokensResponse> {
    // Check for duplicate email in Firestore
    const snapshot = await this.db.collection('u_profiles')
      .where('email', '==', dto.email).limit(1).get()
    if (!snapshot.empty) {
      throw new ConflictException('Email ya registrado')
    }

    // Create user in Firebase Auth (password managed entirely by Firebase)
    let uid: string
    try {
      const userRecord = await this.auth.createUser({
        email: dto.email,
        password: dto.password,
        displayName: dto.full_name,
      })
      uid = userRecord.uid
    } catch (e: any) {
      // If the user already exists in Firebase Auth (race condition), try to get them
      if (e?.code === 'auth/email-already-exists') {
        const existing = await this.auth.getUserByEmail(dto.email).catch(() => null)
        if (existing) {
          uid = existing.uid
        } else {
          throw new ConflictException('Email ya registrado')
        }
      } else {
        this.logger.error(`Firebase Auth createUser failed: ${e?.message ?? e}`)
        throw new UnauthorizedException('Error al crear usuario en Firebase')
      }
    }

    // Store profile in Firestore (no password_hash — Firebase handles auth)
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

    // Sign in via Firebase REST API to get ID token + refresh token
    const firebaseRes = await this.firebaseSignIn(dto.email, dto.password)

    const user = {
      id: uid,
      email: dto.email,
      role: dto.role,
      full_name: dto.full_name,
    }

    // Fire-and-forget side effects
    this.analytics?.increment('total_usuarios').catch(() => null)
    this.analytics?.increment('usuarios_activos').catch(() => null)
    this.emailService.sendWelcome(dto.email, dto.full_name).catch(() => null)

    return {
      token: firebaseRes.idToken,
      refreshToken: firebaseRes.refreshToken,
      expiresIn: Number(firebaseRes.expiresIn),
      user,
    }
  }

  /**
   * POST /auth/login
   * Authenticates via Firebase Identity Toolkit REST API.
   * Returns the same JSON shape the frontend already consumes.
   */
  async login(dto: LoginDto): Promise<AuthTokensResponse> {
    // Firebase REST API validates email+password directly — no local bcrypt needed
    const firebaseRes = await this.firebaseSignIn(dto.email, dto.password)

    // Fetch the profile from Firestore to include role and full_name in the response
    const user = await this.getUserProfile(firebaseRes.localId)

    return {
      token: firebaseRes.idToken,
      refreshToken: firebaseRes.refreshToken,
      expiresIn: Number(firebaseRes.expiresIn),
      user,
    }
  }

  /**
   * POST /auth/refresh
   * Exchanges a Firebase refresh token for a new ID token.
   * Maintains the exact response shape the frontend expects.
   */
  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    // Exchange refresh token via Firebase token endpoint
    const firebaseRes = await this.firebaseRefreshToken(refreshToken)

    // Fetch profile from Firestore to include role and full_name
    const user = await this.getUserProfile(firebaseRes.user_id)

    return {
      token: firebaseRes.access_token,
      refreshToken: firebaseRes.refresh_token,
      expiresIn: Number(firebaseRes.expires_in),
      user,
    }
  }

  /**
   * GET /auth/me
   * Returns the profile for the authenticated user (resolved by JwtGuard from the Firebase ID token).
   */
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
