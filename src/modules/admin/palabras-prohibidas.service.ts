import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common'
import { Firestore, Timestamp } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import {
  CATEGORIA_PALABRA_PROHIBIDA_POR_DEFECTO,
  CrearPalabraProhibidaDto,
} from './dto/crear-palabra-prohibida.dto'

/** Palabra prohibida tal como se expone al panel de administración y a la moderación. */
export interface PalabraProhibida {
  id: string
  /** Término normalizado (minúsculas, sin acentos) usado para comparar textos. */
  palabra: string
  categoria: string
  activa: boolean
  creadoPor: string | null
  fechaCreacion: string
}

/** Documento crudo de Firestore: se valida campo por campo antes de tiparlo. */
interface PalabraProhibidaDoc {
  palabra?: unknown
  categoria?: unknown
  activa?: unknown
  creadoPor?: unknown
  fechaCreacion?: unknown
}

/**
 * Sustituto temporal de la ñ mientras se eliminan los diacríticos: en NFD la
 * ñ se separa en "n" + U+0303 y se perdería, dejando "coño" idéntica a "cono".
 * Se usa un carácter de la zona privada de Unicode, que no aparece en texto real.
 */
const MARCA_ENIE = '\uE000'

/**
 * Normaliza un término para comparación: minúsculas, sin acentos, sin
 * espacios sobrantes, conservando la ñ como letra distinta de la n.
 *
 * El texto se compone a NFC (por si llega con la tilde suelta, `n` + U+0303),
 * la ñ se aparta, y luego se descompone en NFD para eliminar los diacríticos
 * combinantes del resto de las vocales.
 *
 * Nota: las palabras guardadas antes de este cambio quedaron sin ñ (por
 * ejemplo "coño" como "cono"); hay que volver a capturarlas desde el panel
 * para que recuperen la tilde.
 */
export function normalizarPalabra(texto: string): string {
  return texto
    .normalize('NFC')
    .toLowerCase()
    .replace(/ñ/g, MARCA_ENIE)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(MARCA_ENIE)
    .join('ñ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Gestión de la lista dinámica de insultos locales / modismos prohibidos.
 *
 * La lista se mantiene en un `Map` en memoria cargado en `onModuleInit`, de
 * modo que cada publicación moderada se evalúe contra el caché y no contra
 * Firestore. Toda escritura (alta o baja) actualiza Firestore y el `Map` en
 * la misma operación, así que el caché permanece consistente con la base.
 */
@Injectable()
export class PalabrasProhibidasService implements OnModuleInit {
  private readonly logger = new Logger(PalabrasProhibidasService.name)
  private readonly cache = new Map<string, PalabraProhibida>()

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async onModuleInit(): Promise<void> {
    await this.cargarCache()
  }

  /**
   * Precarga la colección completa en memoria. Si Firestore no responde, la
   * app sigue arrancando con la lista vacía (la moderación aplica entonces
   * solo sus reglas base) en lugar de fallar en el bootstrap.
   */
  private async cargarCache(): Promise<void> {
    try {
      const snap = await this.db.collection(COLECCIONES.palabrasProhibidas).get()
      this.cache.clear()
      for (const doc of snap.docs) {
        const palabra = this.aPalabraProhibida(doc.id, doc.data() as PalabraProhibidaDoc)
        if (palabra) this.cache.set(doc.id, palabra)
      }
      this.logger.log(`Palabras prohibidas en caché: ${this.cache.size}`)
    } catch (e: unknown) {
      this.logger.warn(
        `No se pudo cargar la caché de palabras prohibidas (${this.mensajeError(e)}) — la lista iniciará vacía`,
      )
    }
  }

  /**
   * Agrega una palabra a la lista. La normaliza antes de comparar duplicados,
   * la guarda en Firestore y actualiza el caché.
   */
  async agregar(dto: CrearPalabraProhibidaDto, adminId: string): Promise<PalabraProhibida> {
    const palabra = normalizarPalabra(dto.palabra)
    if (!palabra) throw new BadRequestException('La palabra no puede estar vacía')
    if (this.estaRegistrada(palabra)) {
      throw new ConflictException(`La palabra "${palabra}" ya está registrada`)
    }

    const categoria = dto.categoria?.trim() || CATEGORIA_PALABRA_PROHIBIDA_POR_DEFECTO
    const datos: Omit<PalabraProhibida, 'id'> = {
      palabra,
      categoria,
      activa: true,
      creadoPor: adminId,
      fechaCreacion: new Date().toISOString(),
    }

    const ref = await this.db.collection(COLECCIONES.palabrasProhibidas).add({ ...datos })
    const creada: PalabraProhibida = { id: ref.id, ...datos }
    this.cache.set(creada.id, creada)
    return creada
  }

  /** Lista completa de palabras (activas e inactivas) desde el caché. */
  obtenerTodas(): PalabraProhibida[] {
    return Array.from(this.cache.values()).sort((a, b) => a.palabra.localeCompare(b.palabra))
  }

  /** Elimina la palabra de Firestore y del caché. */
  async eliminar(id: string): Promise<void> {
    const ref = this.db.collection(COLECCIONES.palabrasProhibidas).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      this.cache.delete(id)
      throw new NotFoundException('Palabra prohibida no encontrada')
    }
    await ref.delete()
    this.cache.delete(id)
  }

  /** Palabras activas en formato `string[]`, listas para inyectar en el prompt de moderación. */
  obtenerListaParaPrompt(): string[] {
    return Array.from(this.cache.values())
      .filter(p => p.activa)
      .map(p => p.palabra)
      .sort((a, b) => a.localeCompare(b))
  }

  // ─── Utilidades internas ────────────────────────────────────────────

  private estaRegistrada(palabraNormalizada: string): boolean {
    for (const p of this.cache.values()) {
      if (p.palabra === palabraNormalizada) return true
    }
    return false
  }

  /** Convierte un documento crudo al contrato tipado; `null` si no tiene palabra válida. */
  private aPalabraProhibida(id: string, datos: PalabraProhibidaDoc): PalabraProhibida | null {
    const palabra = normalizarPalabra(this.esTexto(datos.palabra) ? datos.palabra : '')
    if (!palabra) return null

    return {
      id,
      palabra,
      categoria: this.esTexto(datos.categoria) && datos.categoria.trim()
        ? datos.categoria.trim()
        : CATEGORIA_PALABRA_PROHIBIDA_POR_DEFECTO,
      // Un documento antiguo sin el campo se considera activo.
      activa: datos.activa !== false,
      creadoPor: this.esTexto(datos.creadoPor) ? datos.creadoPor : null,
      fechaCreacion: this.aIso(datos.fechaCreacion),
    }
  }

  /** Acepta Timestamp de Firestore, Date o string ISO; cualquier otro valor usa la fecha actual. */
  private aIso(valor: unknown): string {
    if (valor instanceof Timestamp) return valor.toDate().toISOString()
    if (valor instanceof Date) return valor.toISOString()
    return typeof valor === 'string' ? valor : new Date().toISOString()
  }

  private esTexto(valor: unknown): valor is string {
    return typeof valor === 'string'
  }

  private mensajeError(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
  }
}
