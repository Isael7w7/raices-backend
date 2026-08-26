import { Injectable, Inject } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { parsearCampoJson } from '../../common/utils/firestore-helpers'
import { InstitucionDoc, InteraccionDoc, PerfilExtendidoDoc } from '../../common/interfaces/firestore-documents.interface'
import { RegistrarInteraccionDto, TipoInteraccion } from './dto/registrar-interaccion.dto'
import { InstitucionRecomendadaDto } from './dto/respuestas-recomendaciones.dto'

/** Ventana de comportamiento para los pesos (días) */
const VENTANA_DIAS = 30

/** Puntos por tipo de interacción */
const PUNTOS_POR_TIPO: Record<TipoInteraccion, number> = {
  guardar: 10,
  ver_detalle: 5,
  click_card: 2,
}

/** Ponderadores del score final */
const PESO_INTERESES = 0.6
const PESO_COMPORTAMIENTO = 0.4

/** Resultado con scores de una institución para el usuario */
type Recomendacion = InstitucionDoc & {
  id: string
  score_intereses: number
  score_comportamiento: number
  final_score: number
}

@Injectable()
export class RecommendationsService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  // ─── FASE 1: registrar interacción ─────────────────────────────────
  async registrar(usuarioId: string, dto: RegistrarInteraccionDto) {
    const ref = this.col(COLECCIONES.interacciones).doc()
    const documento: Omit<InteraccionDoc, 'id'> & { id: string } = {
      id: ref.id,
      usuarioId,
      institucionId: dto.institucionId,
      tipo: dto.tipo,
      categoria: dto.categoria ?? null,
      // ISO string por consistencia con el resto del proyecto (fechaCreacion):
      // comparable lexicográficamente y serializable sin pérdida.
      createdAt: new Date().toISOString(),
    }
    await ref.set(documento)
    return { exito: true, id: ref.id, mensaje: 'Interacción registrada' }
  }

  // ─── FASE 2: pesos de comportamiento por categoría (30 días) ───────
  async pesos(usuarioId: string): Promise<Record<string, number>> {
    const limite = new Date(Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000).toISOString()

    const snap = await this.col(COLECCIONES.interacciones)
      .where('usuarioId', '==', usuarioId)
      .where('createdAt', '>=', limite)
      .get()

    return this.calcularPesos(snap.docs.map(d => d.data() as InteraccionDoc))
  }

  /** Agrupa en memoria los puntos por categoría. Privado: reutilizado por `recomendaciones`. */
  private calcularPesos(interacciones: InteraccionDoc[]): Record<string, number> {
    const pesos: Record<string, number> = {}
    for (const inter of interacciones) {
      if (!inter.categoria) continue
      const puntos = PUNTOS_POR_TIPO[inter.tipo as TipoInteraccion] ?? 0
      pesos[inter.categoria] = (pesos[inter.categoria] ?? 0) + puntos
    }
    return pesos
  }

  // ─── FASE 2: recomendaciones personalizadas ────────────────────────
  async recomendaciones(usuarioId: string, pagina = 1, limite = 20) {
    const [perfilSnap, pesos, instituciones] = await Promise.all([
      this.col(COLECCIONES.perfilesExtendidos).where('usuarioId', '==', usuarioId).limit(1).get(),
      this.pesos(usuarioId),
      this.col(COLECCIONES.instituciones).where('activa', '==', true).get(),
    ])

    const perfil = (perfilSnap.empty ? {} : perfilSnap.docs[0].data()) as PerfilExtendidoDoc
    const metas: string[] = parsearCampoJson(perfil.metasActuales) ?? []
    const areasInteres: string[] = parsearCampoJson(perfil.areasInteres) ?? []

    const maxPeso = Math.max(0, ...Object.values(pesos))

    const puntuadas: Recomendacion[] = (instituciones.docs.map(d => ({ id: d.id, ...d.data() })) as (InstitucionDoc & { id: string })[])
      .map(inst => {
        const scoreIntereses = this.scoreDeIntereses(metas, areasInteres, inst)
        const scoreComportamiento = maxPeso > 0 ? ((pesos[inst.categoria ?? ''] ?? 0)) / maxPeso : 0
        return {
          ...inst,
          score_intereses: redondear(scoreIntereses),
          score_comportamiento: redondear(scoreComportamiento),
          final_score: redondear(scoreIntereses * PESO_INTERESES + scoreComportamiento * PESO_COMPORTAMIENTO),
        }
      })

    puntuadas.sort((a, b) => b.final_score - a.final_score)

    pagina = Math.max(1, Number(pagina) || 1)
    limite = Math.min(50, Math.max(1, Number(limite) || 20))
    const total = puntuadas.length
    const inicio = (pagina - 1) * limite

    return {
      datos: puntuadas.slice(inicio, inicio + limite),
      paginacion: {
        total,
        pagina,
        limite,
        totalPaginas: Math.ceil(total / limite),
      },
    }
  }

  /**
   * Score de coincidencia entre los intereses/metas del perfil y una institución.
   * Cada token de interés/meta presente en el texto de la institución suma;
   * se normaliza dividiendo entre el número de tokens.
   */
  private scoreDeIntereses(metas: string[], areasInteres: string[], inst: InstitucionDoc): number {
    const tokens = [...metas, ...areasInteres]
      .filter(t => typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim().toLowerCase())

    if (tokens.length === 0) return 0

    const textoInstitucion = [
      inst.nombre,
      inst.descripcion,
      inst.categoria,
      ...(Array.isArray(inst.servicios) ? inst.servicios : parsearCampoJson(inst.servicios as any) ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    const coincidencias = tokens.filter(token => textoInstitucion.includes(token)).length
    return coincidencias / tokens.length
  }
}

function redondear(valor: number): number {
  return Math.round(valor * 1000) / 1000
}
