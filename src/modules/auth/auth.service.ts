import { Injectable, ConflictException, UnauthorizedException, BadRequestException, Inject, Logger, Optional } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import axios from 'axios'
import { FIRESTORE, FIREBASE_AUTH } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { FEATURES_POR_DEFECTO } from '../../common/interfaces/feature-flags.interface'
import { registrarDependienteVinculado } from '../../common/utils/firestore-helpers'
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
    // Si se indica un tutor, validar que la relación sea coherente:
    // solo cuentas PCD pueden vincularse y el tutor debe existir y estar activo.
    if (dto.tutorId) {
      if (dto.rol !== 'pcd') {
        throw new BadRequestException('Solo las cuentas con rol PCD pueden estar vinculadas a un tutor')
      }
      const tutorDoc = await this.db.collection(COLECCIONES.perfiles).doc(dto.tutorId).get()
      const tutor = tutorDoc.exists ? tutorDoc.data() : null
      if (!tutor || tutor.rol !== 'tutor' || tutor.activo === false) {
        throw new BadRequestException('El tutor indicado no existe o no está activo')
      }
    }

    const snapshot = await this.db.collection(COLECCIONES.perfiles)
      .where('email', '==', dto.email).limit(1).get()
    if (!snapshot.empty) throw new ConflictException('Email ya registrado')

    let firebaseUser
    try {
      firebaseUser = await this.auth.createUser({
        email: dto.email,
        password: dto.password,
        displayName: dto.nombreCompleto,
      })
    } catch (e: any) {
      this.logger.error(`Firebase Auth user creation failed: ${e?.message ?? e}`)
      if (e?.code === 'auth/email-already-exists') {
        throw new ConflictException('Email ya registrado en Firebase Auth')
      }
      throw new UnauthorizedException('Error al crear usuario')
    }

    const uid = firebaseUser.uid

    const features = dto.features ?? { ...FEATURES_POR_DEFECTO }

    const perfilData: Record<string, any> = {
      id: uid,
      email: dto.email,
      nombreCompleto: dto.nombreCompleto,
      rol: dto.rol,
      activo: true,
      verificado: false,
      features,
      fechaCreacion: new Date().toISOString(),
      ...(dto.ciudad && { ciudad: dto.ciudad }),
      ...(dto.estado && { estado: dto.estado }),
      ...(dto.tutorId && { tutorId: dto.tutorId }),
      ...(dto.profesion && { profesion: dto.profesion }),
      ...(dto.bio && { bio: dto.bio }),
      // Vínculo explícito institución ↔ usuario: el perfil guarda el ID de su institución
      ...(dto.rol === 'institucion' && { institucionId: uid }),
    }

    // Si el rol es 'institucion', crear también el documento en la colección
    // 'instituciones' (mismo ID que el UID) para que aparezca en el directorio.
    let institucionData: Record<string, any> | null = null
    if (dto.rol === 'institucion') {
      institucionData = {
        id: uid,
        nombre: dto.nombreCompleto,
        emailContacto: dto.email,
        ciudad: dto.ciudad ?? null,
        estado: dto.estado ?? null,
        activa: true,
        verificada: false,
        calificacionPromedio: 0,
        cantidadCalificaciones: 0,
        // Vínculo explícito institución ↔ usuario (permite buscar por dueño)
        creadoPor: uid,
        usuarioId: uid,
        fechaCreacion: new Date().toISOString(),
      }
    }

    // Escritura atómica de perfil (+ institución) con un solo batch:
    // si falla cualquiera de los documentos, se revierte el usuario de Firebase Auth.
    const batch = this.db.batch()
    batch.set(this.db.collection(COLECCIONES.perfiles).doc(uid), perfilData)
    if (institucionData) {
      batch.set(this.db.collection(COLECCIONES.instituciones).doc(uid), institucionData)
    }
    try {
      await batch.commit()
    } catch (e) {
      this.logger.error(`Firestore batch commit failed: ${e?.message ?? e}. Reverting Firebase user ${uid}`)
      try {
        await this.auth.deleteUser(uid)
      } catch (rollbackError: any) {
        this.logger.warn(`No se pudo revertir el usuario de Firebase Auth: ${rollbackError?.message ?? rollbackError}`)
      }
      throw e
    }

    // Si es una PCD dada de alta por un tutor, registrar la relación en 'dependientes'
    // para que la persona aparezca en la lista de personas bajo cuidado del tutor.
    // Se promueve un dependiente plano previo del tutor si coincide el nombre.
    if (dto.rol === 'pcd' && dto.tutorId) {
      await registrarDependienteVinculado(this.db, COLECCIONES.dependientes, dto.tutorId, uid, dto.nombreCompleto)
    }

    let idToken: string
    let tokenRefresco: string
    try {
      const signInResponse = await axios.post(this.identityToolkitUrl, {
        email: dto.email,
        password: dto.password,
        returnSecureToken: true,
      })
      idToken = signInResponse.data.idToken
      tokenRefresco = signInResponse.data.refreshToken
    } catch (e: any) {
      this.logger.warn(`Sign-in after register failed: ${e?.message ?? e}. Generating custom token.`)
      const customToken = await this.auth.createCustomToken(uid)
      idToken = customToken
      tokenRefresco = ''
    }

    const usuario = {
      id: uid,
      email: dto.email,
      rol: dto.rol,
      nombreCompleto: dto.nombreCompleto,
      tutorId: dto.tutorId ?? null,
      institucionId: dto.rol === 'institucion' ? uid : null,
      features,
    }

    await this.analytics?.incrementar('totalUsuarios')
    await this.analytics?.incrementar('usuariosActivos')

    this.emailService.sendWelcome(dto.email, dto.nombreCompleto).catch(() => null)

    return {
      tokenAcceso: idToken,
      tokenRefresco,
      expiraEn: this.defaultExpiresIn,
      usuario,
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

    const { idToken, refreshToken: tokenRefresco } = signInResponse.data

    const decodedToken = await this.auth.verifyIdToken(idToken)

    const doc = await this.db.collection(COLECCIONES.perfiles).doc(decodedToken.uid).get()
    if (!doc.exists) {
      throw new UnauthorizedException('Usuario no encontrado')
    }

    const datosUsuario = doc.data()!
    if (!datosUsuario.activo) {
      throw new UnauthorizedException('Cuenta desactivada')
    }

    return {
      tokenAcceso: idToken,
      tokenRefresco,
      expiraEn: this.defaultExpiresIn,
      usuario: {
        id: datosUsuario.id,
        email: datosUsuario.email,
        rol: datosUsuario.rol,
        nombreCompleto: datosUsuario.nombreCompleto,
        tutorId: datosUsuario.tutorId ?? null,
        institucionId: datosUsuario.institucionId ?? (datosUsuario.rol === 'institucion' ? datosUsuario.id : null),
        features: datosUsuario.features ?? { ...FEATURES_POR_DEFECTO },
      },
    }
  }

  async refresh(tokenRefresco: string) {
    try {
      const response = await axios.post(this.secureTokenUrl, {
        grant_type: 'refresh_token',
        refresh_token: tokenRefresco,
      })

      const { id_token, refresh_token, user_id } = response.data

      const doc = await this.db.collection(COLECCIONES.perfiles).doc(user_id).get()
      if (!doc.exists) {
        throw new UnauthorizedException('Usuario no encontrado')
      }

      const datosUsuario = doc.data()!
      if (!datosUsuario.activo) {
        throw new UnauthorizedException('Cuenta desactivada')
      }

      return {
        tokenAcceso: id_token,
        tokenRefresco: refresh_token,
        expiraEn: this.defaultExpiresIn,
        usuario: {
          id: datosUsuario.id,
          email: datosUsuario.email,
          rol: datosUsuario.rol,
          nombreCompleto: datosUsuario.nombreCompleto,
          tutorId: datosUsuario.tutorId ?? null,
          institucionId: datosUsuario.institucionId ?? (datosUsuario.rol === 'institucion' ? datosUsuario.id : null),
          features: datosUsuario.features ?? { ...FEATURES_POR_DEFECTO },
        },
      }
    } catch (e: any) {
      if (e instanceof UnauthorizedException) throw e
      this.logger.warn(`Refresh token verification failed: ${e?.message ?? e}`)
      throw new UnauthorizedException('Refresh token inválido o expirado')
    }
  }

  async me(userId: string) {
    const doc = await this.db.collection(COLECCIONES.perfiles).doc(userId).get()
    if (!doc.exists) return null
    const d = doc.data()!

    const base: Record<string, any> = {
      id: d.id,
      email: d.email,
      rol: d.rol,
      nombreCompleto: d.nombreCompleto,
      ciudad: d.ciudad ?? null,
      estado: d.estado ?? null,
      urlAvatar: d.urlAvatar ?? null,
      verificado: d.verificado,
      tutorId: d.tutorId ?? null,
      institucionId: d.institucionId ?? null,
      features: d.features ?? { ...FEATURES_POR_DEFECTO },
    }

    // Para usuarios institución, adjuntar los datos básicos de su institución.
    // Se busca primero el documento canónico (id = UID) y, si no existe,
    // se cae a 'creadoPor' (instituciones legacy creadas con ID aleatorio).
    if (d.rol === 'institucion') {
      let instDoc = await this.db.collection(COLECCIONES.instituciones).doc(userId).get()
      if (!instDoc.exists) {
        const porCreador = await this.db.collection(COLECCIONES.instituciones)
          .where('creadoPor', '==', userId).limit(1).get()
        instDoc = porCreador.empty ? null : porCreador.docs[0]
      }
      if (instDoc) {
        const i = instDoc.data()!
        base.institucionId = instDoc.id
        base.institucion = {
          id: instDoc.id,
          nombre: i.nombre ?? null,
          categoria: i.categoria ?? null,
          ciudad: i.ciudad ?? null,
          estado: i.estado ?? null,
          urlLogo: i.urlLogo ?? null,
          activa: i.activa ?? false,
          verificada: i.verificada ?? false,
          calificacionPromedio: i.calificacionPromedio ?? 0,
          cantidadCalificaciones: i.cantidadCalificaciones ?? 0,
        }
      } else {
        base.institucion = null
      }
    }

    return base
  }
}
