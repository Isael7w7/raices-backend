import { Injectable, Inject, Logger } from '@nestjs/common'
import { Firestore, FieldValue } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { CrearMensajeContactoDto } from './dto/crear-mensaje-contacto.dto'

/** Respuesta del servicio al controller (id del documento y estado inicial). */
export interface ResultadoMensajeContacto {
  id: string
  estado: 'pendiente'
}

@Injectable()
export class ContactoService {
  private readonly logger = new Logger('ContactoService')

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  /**
   * Persiste el mensaje de contacto en Firestore.
   * La IP se anonimiza antes de guardar (auditoría anti-spam sin PII completa)
   * y cualquier error se re-lanza para que el filtro global lo registre con
   * severidad ERROR y dispare las alertas de 5xx en Cloud Logging.
   */
  async guardarMensaje(
    dto: CrearMensajeContactoDto,
    meta: { ip: string; userAgent?: string },
  ): Promise<ResultadoMensajeContacto> {
    const email = dto.email.trim().toLowerCase()
    const ipAnon = anonimizarIp(meta.ip)

    try {
      const ref = await this.db.collection(COLECCIONES.mensajesContacto).add({
        email,
        nombre: dto.nombre.trim(),
        asunto: dto.asunto,
        mensaje: dto.mensaje.trim(),
        origen: 'landing-contacto',
        ipAnonimizada: ipAnon,
        userAgent: meta.userAgent?.slice(0, 200),
        aceptoContacto: dto.aceptoContacto === true || dto.aceptoContacto === 'true',
        estado: 'pendiente' as const,
        fechaCreacion: FieldValue.serverTimestamp(),
      })

      this.logger.log(`Mensaje de contacto guardado (${dto.asunto}) desde ${ipAnon} → id ${ref.id}`)

      return { id: ref.id, estado: 'pendiente' }
    } catch (e: unknown) {
      this.logger.error(`Error al guardar mensaje de contacto: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
  }
}

/** Anonimiza la IP: conserva los primeros tres octetos (IPv4) o el prefijo /64 (IPv6). */
function anonimizarIp(ip: string): string {
  if (!ip) return 'desconocida'
  if (ip.includes(':')) {
    const grupos = ip.split(':').slice(0, 4).join(':')
    return `${grupos}::`
  }
  const octetos = ip.split('.')
  if (octetos.length === 4) return `${octetos[0]}.${octetos[1]}.${octetos[2]}.0`
  return 'desconocida'
}
