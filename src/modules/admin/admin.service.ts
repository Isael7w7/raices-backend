import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { NotificationsService } from '../notifications/notifications.service'
import { EmailService } from '../email/email.service'

const ETIQUETAS_DISCAPACIDAD: Record<string, string> = {
  tea: 'TEA / Autismo', motriz: 'Motriz', intelectual: 'Intelectual',
  visual: 'Visual', auditiva: 'Auditiva', multiple: 'Múltiple', psicosocial: 'Psicosocial',
}

const ETIQUETAS_CATEGORIA: Record<string, string> = {
  funcional: 'Salud y terapias', educativo: 'Educación',
  laboral: 'Empleo', social: 'Comunidad y social',
}

const CONFIGURACION_POR_DEFECTO: Record<string, string> = {
  nombrePlataforma: 'Raíces para Florecer', emailSoporte: 'soporte@raices.mx',
  permitirRegistro: 'true', aprobacionInstitucionRequerida: 'true',
  iaHabilitada: 'true', modoMantenimiento: 'false',
  maxResenasPorUsuario: '10', ciudadPorDefecto: 'Mérida',
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly notificaciones: NotificationsService,
    private readonly email: EmailService,
  ) {}

  private col(nombre: string) { return this.db.collection(nombre) }

  /* ───────────────────────── Stats y analytics ───────────────────────── */

  async getStats() {
    const [usuarios, usuariosActivos, instituciones, verificadas, pendientes, resenas, publicaciones, grupos, perfilesCompletados] = await Promise.all([
      this.col(COLECCIONES.perfiles).get(),
      this.col(COLECCIONES.perfiles).where('activo', '==', true).get(),
      this.col(COLECCIONES.instituciones).get(),
      this.col(COLECCIONES.instituciones).where('verificada', '==', true).get(),
      this.col(COLECCIONES.instituciones).where('activa', '==', false).get(),
      this.col(COLECCIONES.resenas).get(),
      this.col(COLECCIONES.publicaciones).get(),
      this.col(COLECCIONES.grupos).get(),
      this.col(COLECCIONES.perfilesExtendidos).get(),
    ])

    const calificacionProm = resenas.empty ? null : (() => {
      const suma = resenas.docs.reduce((s, d) => s + (d.data().calificacion ?? 0), 0)
      return parseFloat((suma / resenas.size).toFixed(2))
    })()

    return {
      totalUsuarios: usuarios.size,
      usuariosActivos: usuariosActivos.size,
      totalInstituciones: instituciones.size,
      institucionesVerificadas: verificadas.size,
      aprobacionPendiente: pendientes.size,
      totalResenas: resenas.size,
      totalPublicaciones: publicaciones.size,
      totalGrupos: grupos.size,
      calificacionPromedio: calificacionProm,
      perfilesCompletados: perfilesCompletados.size,
    }
  }

  async getAnalytics() {
    const [usuariosSnap, institucionesSnap, resenasSnap, publicacionesSnap] = await Promise.all([
      this.col(COLECCIONES.perfiles).get(),
      this.col(COLECCIONES.instituciones).where('activa', '==', true).get(),
      this.col(COLECCIONES.resenas).get(),
      this.col(COLECCIONES.publicaciones).get(),
    ])

    const usuarios = usuariosSnap.docs.map(d => d.data())
    const instituciones = institucionesSnap.docs.map(d => d.data())
    const resenas = resenasSnap.docs.map(d => d.data())
    const publicaciones = publicacionesSnap.docs.map(d => d.data())

    const registrosPorMes: Record<string, number> = {}
    for (const u of usuarios) {
      const m = (u.fechaCreacion ?? '').substring(0, 7)
      if (m) registrosPorMes[m] = (registrosPorMes[m] ?? 0) + 1
    }
    const registros = Object.entries(registrosPorMes).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
      .map(([mes, cantidad]) => ({ mes, cantidad }))

    const mapaRoles: Record<string, number> = {}
    for (const u of usuarios) { const r = u.rol ?? 'desconocido'; mapaRoles[r] = (mapaRoles[r] ?? 0) + 1 }
    const roles = Object.entries(mapaRoles).map(([rol, cantidad]) => ({ rol, cantidad }))

    const mapaCategorias: Record<string, number> = {}
    for (const i of instituciones) { const c = i.categoria ?? 'desconocido'; mapaCategorias[c] = (mapaCategorias[c] ?? 0) + 1 }
    const categorias = Object.entries(mapaCategorias).map(([categoria, cantidad]) => ({
      categoria, etiqueta: ETIQUETAS_CATEGORIA[categoria] ?? categoria, cantidad,
    }))

    const mapaCalificaciones: Record<number, number> = {}
    for (const r of resenas) { const rt = r.calificacion ?? 0; mapaCalificaciones[rt] = (mapaCalificaciones[rt] ?? 0) + 1 }
    const calificaciones = Object.entries(mapaCalificaciones).map(([calificacion, cantidad]) => ({ calificacion: Number(calificacion), cantidad }))

    const mejoresInstituciones = instituciones
      .filter(i => i.verificada)
      .sort((a: any, b: any) => (b.calificacionPromedio ?? 0) - (a.calificacionPromedio ?? 0) || (b.cantidadCalificaciones ?? 0) - (a.cantidadCalificaciones ?? 0))
      .slice(0, 5)
      .map(i => ({ id: i.id, nombre: i.nombre, categoria: i.categoria, calificacionPromedio: i.calificacionPromedio, cantidadCalificaciones: i.cantidadCalificaciones, verificada: i.verificada }))

    const publicacionesPorMes: Record<string, number> = {}
    for (const p of publicaciones) { const m = (p.fechaCreacion ?? '').substring(0, 7); if (m) publicacionesPorMes[m] = (publicacionesPorMes[m] ?? 0) + 1 }
    const actividadComunitaria = Object.entries(publicacionesPorMes).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
      .map(([mes, cantidad]) => ({ mes, cantidad }))

    const mapaCiudades: Record<string, number> = {}
    for (const i of instituciones) { const c = i.ciudad ?? 'Sin ciudad'; mapaCiudades[c] = (mapaCiudades[c] ?? 0) + 1 }
    const ciudades = Object.entries(mapaCiudades).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([ciudad, cantidad]) => ({ ciudad, cantidad }))

    return {
      registrosPorMes: registros,
      distribucionRoles: roles,
      institucionesPorCategoria: categorias,
      distribucionCalificaciones: calificaciones,
      mejoresInstituciones,
      actividadComunitaria,
      institucionesPorCiudad: ciudades,
    }
  }

  /* ─────────────────── Inteligencia de necesidades ─────────────────── */

  async getNeedsIntelligence() {
    const [perfilesSnap, institucionesSnap] = await Promise.all([
      this.col(COLECCIONES.perfilesExtendidos).get(),
      this.col(COLECCIONES.instituciones).where('activa', '==', true).get(),
    ])
    const perfiles = perfilesSnap.docs.map(d => d.data())
    const instituciones = institucionesSnap.docs.map(d => d.data())

    const parsear = (v: any): any[] => {
      if (!v) return []
      try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
    }

    const demandaPorDiscapacidad: Record<string, number> = {}
    const necesidadesCount: Record<string, number> = {}
    const metasCount: Record<string, number> = {}
    const etapasCount: Record<string, number> = {}
    const areasApoyo: Record<string, number> = {}

    for (const p of perfiles) {
      for (const d of parsear(p.tiposDiscapacidad)) demandaPorDiscapacidad[d] = (demandaPorDiscapacidad[d] ?? 0) + 1
      for (const n of parsear(p.necesidades)) necesidadesCount[n] = (necesidadesCount[n] ?? 0) + 1
      for (const g of parsear(p.metasActuales)) metasCount[g] = (metasCount[g] ?? 0) + 1
      for (const s of parsear(p.areasApoyo)) areasApoyo[s] = (areasApoyo[s] ?? 0) + 1
      if (p.etapaVida) etapasCount[p.etapaVida] = (etapasCount[p.etapaVida] ?? 0) + 1
    }

    const ofertaPorDiscapacidad: Record<string, number> = {}
    for (const inst of instituciones) {
      for (const d of parsear(inst.tiposDiscapacidad)) ofertaPorDiscapacidad[d] = (ofertaPorDiscapacidad[d] ?? 0) + 1
    }

    const todosTipos = new Set([...Object.keys(demandaPorDiscapacidad), ...Object.keys(ofertaPorDiscapacidad)])
    const cobertura = [...todosTipos].map((tipo) => {
      const demanda = demandaPorDiscapacidad[tipo] ?? 0
      const oferta = ofertaPorDiscapacidad[tipo] ?? 0
      const relacion = demanda > 0 ? oferta / demanda : oferta > 0 ? Infinity : 0
      let estado: string
      if (demanda === 0) estado = 'sin_demanda'
      else if (relacion >= 3) estado = 'adecuada'
      else if (relacion >= 1) estado = 'media'
      else estado = 'critica'
      return { tipo, etiqueta: ETIQUETAS_DISCAPACIDAD[tipo] ?? tipo, demanda, oferta, relacion: relacion === Infinity ? null : Number(relacion.toFixed(2)), estado }
    }).sort((a, b) => b.demanda - a.demanda)

    const percepciones: { tipo: string; severidad: string; texto: string }[] = []
    const totalPerfiles = perfiles.length

    const criticos = cobertura.filter((c) => c.estado === 'critica')
    for (const c of criticos) {
      percepciones.push({ tipo: 'brecha_cobertura', severidad: 'alta',
        texto: `Cobertura crítica en ${c.etiqueta}: ${c.demanda} usuario(s) con esta necesidad pero solo ${c.oferta} institución(es) activa(s).` })
    }

    const mejores = cobertura.filter((c) => c.estado === 'adecuada' && c.demanda > 0)
    if (mejores.length > 0) {
      percepciones.push({ tipo: 'fortaleza', severidad: 'info',
        texto: `Mayor fortaleza: ${mejores.map((b) => b.etiqueta).join(', ')}.` })
    }

    const necesidadPrincipal = Object.entries(necesidadesCount).sort((a, b) => b[1] - a[1])[0]
    if (necesidadPrincipal) {
      percepciones.push({ tipo: 'demanda_principal', severidad: 'media',
        texto: `Necesidad más reportada: "${necesidadPrincipal[0]}" (${necesidadPrincipal[1]} de ${totalPerfiles}).` })
    }

    const etapaPrincipal = Object.entries(etapasCount).sort((a, b) => b[1] - a[1])[0]
    if (etapaPrincipal) {
      const rangos: Record<string, [number, number]> = {
        infancia: [0, 12], adolescencia: [13, 17], adulto_joven: [18, 29], adulto: [30, 59], mayor: [60, 99],
      }
      const r = rangos[etapaPrincipal[0]]
      const instEnEtapa = instituciones.filter((i) => !r || ((i.edadMaxima ?? 99) >= r[0] && (i.edadMinima ?? 0) <= r[1])).length
      percepciones.push({ tipo: 'etapa_vida', severidad: 'info',
        texto: `Etapa predominante: ${etapaPrincipal[0]} (${etapaPrincipal[1]} usuarios). ${instEnEtapa} de ${instituciones.length} instituciones atienden ese rango.` })
    }

    const todosUsuariosSnap = await this.col(COLECCIONES.perfiles).where('rol', '==', 'pcd').get()
    const idsConPerfil = new Set(perfiles.map(p => p.usuarioId))
    const sinCompletar = todosUsuariosSnap.docs.filter(d => !idsConPerfil.has(d.id)).length
    if (sinCompletar > 0) {
      percepciones.push({ tipo: 'datos_incompletos', severidad: 'media',
        texto: `${sinCompletar} usuario(s) con rol PCD sin perfil de necesidades.` })
    }

    const sinVerificar = instituciones.filter(i => !i.verificada).length
    if (sinVerificar > 0) {
      percepciones.push({ tipo: 'confianza', severidad: 'media',
        texto: `${sinVerificar} institución(es) sin verificar.` })
    }

    return {
      generadoEn: new Date().toISOString(),
      totalPerfiles,
      totalInstituciones: instituciones.length,
      cobertura,
      demanda: {
        necesidades: Object.entries(necesidadesCount).map(([k, v]) => ({ necesidad: k, cantidad: v })).sort((a, b) => b.cantidad - a.cantidad),
        metas: Object.entries(metasCount).map(([k, v]) => ({ meta: k, cantidad: v })).sort((a, b) => b.cantidad - a.cantidad),
        etapasVida: Object.entries(etapasCount).map(([k, v]) => ({ etapa: k, cantidad: v })).sort((a, b) => b.cantidad - a.cantidad),
        areasApoyo: Object.entries(areasApoyo).map(([k, v]) => ({ area: k, cantidad: v })).sort((a, b) => b.cantidad - a.cantidad),
      },
      percepciones,
    }
  }

  /* ───────────────────────── Instituciones ───────────────────────── */

  async getAllInstitutions() {
    const snap = await this.col(COLECCIONES.instituciones).orderBy('fechaCreacion', 'desc').get()
    return snap.docs.map(d => {
      const data = d.data()
      return { id: d.id, nombre: data.nombre, categoria: data.categoria, ciudad: data.ciudad,
        activa: data.activa, verificada: data.verificada, calificacionPromedio: data.calificacionPromedio,
        cantidadCalificaciones: data.cantidadCalificaciones, fechaCreacion: data.fechaCreacion }
    })
  }

  async getPendingInstitutions() {
    const snap = await this.col(COLECCIONES.instituciones).where('activa', '==', false).orderBy('fechaCreacion', 'asc').get()
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }

  async approveInstitution(id: string) {
    await this.col(COLECCIONES.instituciones).doc(id).update({ activa: true })
    const doc = await this.col(COLECCIONES.instituciones).doc(id).get()
    if (doc.exists) {
      const inst = doc.data()!
      await this.email.sendInstitutionApproved(inst.emailContacto ?? inst.email ?? '', inst.nombre)
    }
    return { ok: true }
  }

  async rejectInstitution(id: string) {
    await this.col(COLECCIONES.instituciones).doc(id).delete()
    return { ok: true }
  }

  async toggleVerifyInstitution(id: string) {
    const doc = await this.col(COLECCIONES.instituciones).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Institución no encontrada')
    const nuevoVerificado = !doc.data()!.verificada
    await doc.ref.update({ verificada: nuevoVerificado })
    return { ok: true, verificada: nuevoVerificado }
  }

  /* ───────────────────────── Usuarios ───────────────────────── */

  async getUsers() {
    const snap = await this.col(COLECCIONES.perfiles).orderBy('fechaCreacion', 'desc').get()
    return snap.docs.map(d => {
      const data = d.data()
      return { id: d.id, email: data.email, nombreCompleto: data.nombreCompleto, rol: data.rol,
        ciudad: data.ciudad, activo: data.activo, verificado: data.verificado, fechaCreacion: data.fechaCreacion }
    })
  }

  async toggleUserActive(id: string, adminId: string) {
    if (id === adminId) throw new BadRequestException('No puedes desactivar tu propia cuenta')
    const doc = await this.col(COLECCIONES.perfiles).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Usuario no encontrado')
    const nuevoActivo = !doc.data()!.activo
    await doc.ref.update({ activo: nuevoActivo })
    return { ok: true, activo: nuevoActivo }
  }

  async changeUserRole(id: string, rol: string, adminId: string) {
    if (id === adminId) throw new BadRequestException('No puedes cambiar tu propio rol')
    const permitidos = ['pcd', 'tutor', 'institution', 'admin']
    if (!permitidos.includes(rol)) throw new BadRequestException('Rol inválido')
    const doc = await this.col(COLECCIONES.perfiles).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Usuario no encontrado')
    await doc.ref.update({ rol })
    return { ok: true, rol }
  }

  /* ───────────────────────── Reseñas (moderación) ───────────────────────── */

  async getReviews() {
    const revSnap = await this.col(COLECCIONES.resenas).orderBy('fechaCreacion', 'desc').limit(100).get()
    const resenas = revSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    const usuariosIds = [...new Set(resenas.map(r => r.usuarioId))]
    const instIds = [...new Set(resenas.map(r => r.institucionId))]

    const mapaUsuarios = new Map<string, any>()
    for (const uid of usuariosIds) {
      const doc = await this.col(COLECCIONES.perfiles).doc(uid).get()
      if (doc.exists) mapaUsuarios.set(uid, doc.data())
    }
    const mapaInst = new Map<string, any>()
    for (const iid of instIds) {
      const doc = await this.col(COLECCIONES.instituciones).doc(iid).get()
      if (doc.exists) mapaInst.set(iid, doc.data())
    }

    return resenas.map(r => ({
      id: r.id, calificacion: r.calificacion, comentario: r.comentario, fechaCreacion: r.fechaCreacion,
      nombreUsuario: mapaUsuarios.get(r.usuarioId)?.nombreCompleto ?? null,
      emailUsuario: mapaUsuarios.get(r.usuarioId)?.email ?? null,
      nombreInstitucion: mapaInst.get(r.institucionId)?.nombre ?? null,
    }))
  }

  async deleteReview(id: string) {
    const doc = await this.col(COLECCIONES.resenas).doc(id).get()
    if (!doc.exists) throw new NotFoundException('Reseña no encontrada')
    const resena = doc.data()!
    await doc.ref.delete()

    const todasRev = await this.col(COLECCIONES.resenas)
      .where('institucionId', '==', resena.institucionId).get()
    if (todasRev.empty) {
      await this.col(COLECCIONES.instituciones).doc(resena.institucionId).update({ calificacionPromedio: 0, cantidadCalificaciones: 0 })
    } else {
      const suma = todasRev.docs.reduce((s, d) => s + (d.data().calificacion ?? 0), 0)
      await this.col(COLECCIONES.instituciones).doc(resena.institucionId).update({
        calificacionPromedio: parseFloat((suma / todasRev.size).toFixed(2)),
        cantidadCalificaciones: todasRev.size,
      })
    }
    return { ok: true }
  }

  /* ───────────────────────── Configuración ───────────────────────── */

  async getSettings() {
    const snap = await this.col(COLECCIONES.configuraciones).get()
    const almacenadas: Record<string, string> = {}
    for (const doc of snap.docs) almacenadas[doc.data().clave] = doc.data().valor
    return { ...CONFIGURACION_POR_DEFECTO, ...almacenadas }
  }

  async updateSettings(configuracion: Record<string, string>) {
    for (const [clave, valor] of Object.entries(configuracion)) {
      if (!(clave in CONFIGURACION_POR_DEFECTO)) continue
      const snap = await this.col(COLECCIONES.configuraciones).where('clave', '==', clave).limit(1).get()
      if (!snap.empty) {
        await snap.docs[0].ref.update({ valor: String(valor), fechaActualizacion: new Date().toISOString() })
      } else {
        await this.col(COLECCIONES.configuraciones).doc(clave).set({ clave, valor: String(valor), fechaActualizacion: new Date().toISOString() })
      }
    }
    return this.getSettings()
  }

  /* ─────────────────────────── Alertas de riesgo ─────────────────────────── */

  async getAlerts() {
    const alertas: any[] = []
    const ahora = new Date()
    const hace7Dias = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const hace48Horas = new Date(ahora.getTime() - 48 * 60 * 60 * 1000).toISOString()

    const [todasInstsSnap, todosUsuariosSnap, todasResenasSnap] = await Promise.all([
      this.col(COLECCIONES.instituciones).get(),
      this.col(COLECCIONES.perfiles).get(),
      this.col(COLECCIONES.resenas).get(),
    ])
    const todasInsts = todasInstsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    const todosUsuarios = todosUsuariosSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    const todasResenas = todasResenasSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))

    const instsActivas = todasInsts.filter(i => i.activa)

    for (const inst of instsActivas) {
      if ((inst.calificacionPromedio ?? 0) < 2.5 && (inst.cantidadCalificaciones ?? 0) >= 3) {
        alertas.push({
          id: `rating-risk-${inst.id}`, severidad: 'critica', tipo: 'rating_risk',
          titulo: `Calificación crítica: ${inst.nombre}`,
          descripcion: `Promedio de ${Number(inst.calificacionPromedio).toFixed(1)}/5 con ${inst.cantidadCalificaciones} reseñas.`,
          accion: 'Ver institución', tipoEntidad: 'institution', idEntidad: inst.id,
        })
      }
    }

    const verificadasCount = instsActivas.filter(i => i.verificada).length
    if (verificadasCount === 0 && instsActivas.length > 0) {
      alertas.push({
        id: 'no-verified-institutions', severidad: 'critica', tipo: 'trust_risk',
        titulo: 'Sin instituciones verificadas',
        descripcion: `Hay ${instsActivas.length} institución(es) activa(s) sin verificación.`,
        accion: 'Verificar ahora', tipoEntidad: 'institutions',
      })
    }

    const pendientesViejas = todasInsts.filter(i => !i.activa && (i.fechaCreacion ?? '') < hace48Horas).length
    if (pendientesViejas > 0) {
      alertas.push({
        id: 'pending-institutions-delayed', severidad: 'media', tipo: 'pending_approval',
        titulo: `${pendientesViejas} institución(es) pendiente(s) >48 h`,
        descripcion: `Llevan más de 48 horas sin revisión.`, accion: 'Aprobar', tipoEntidad: 'institutions_pending',
      })
    }

    const bajasRecientes = todasResenas.filter(r => r.calificacion === 1 && (r.fechaCreacion ?? '') >= hace7Dias).length
    if (bajasRecientes > 0) {
      alertas.push({
        id: 'low-reviews-recent', severidad: 'media', tipo: 'review_quality',
        titulo: `${bajasRecientes} reseña(s) de 1 estrella esta semana`,
        descripcion: `Calificaciones muy bajas recientes.`, accion: 'Moderar reseñas', tipoEntidad: 'reviews',
      })
    }

    const total = todosUsuarios.length
    const inactivos = todosUsuarios.filter(u => !u.activo).length
    if (total >= 10 && inactivos / total > 0.25) {
      alertas.push({
        id: 'high-inactive-rate', severidad: 'media', tipo: 'retention_risk',
        titulo: `${Math.round((inactivos / total) * 100)}% de usuarios inactivos`,
        descripcion: `${inactivos} de ${total} usuarios desactivados.`, accion: 'Ver usuarios', tipoEntidad: 'users',
      })
    }

    const cubiertas = new Set<string>()
    for (const inst of instsActivas) {
      try { (JSON.parse(inst.tiposDiscapacidad ?? '[]') as string[]).forEach(t => cubiertas.add(t.toLowerCase().trim())) } catch {}
    }
    const TODOS_TIPOS = ['motriz', 'visual', 'auditiva', 'intelectual', 'psicosocial', 'tea', 'múltiple', 'lenguaje']
    const sinCubrir = TODOS_TIPOS.filter(t => !cubiertas.has(t))
    if (sinCubrir.length > 0) {
      alertas.push({
        id: 'disability-coverage-gap', severidad: sinCubrir.length >= 4 ? 'critica' : 'media', tipo: 'coverage_gap',
        titulo: `Sin cobertura para ${sinCubrir.length} tipo(s) de discapacidad`,
        descripcion: `Sin instituciones para: ${sinCubrir.join(', ')}.`, accion: 'Ver inteligencia', tipoEntidad: 'intelligence',
      })
    }

    const perfilesHechosSnap = await this.col(COLECCIONES.perfilesExtendidos).get()
    const pctHechos = total > 0 ? (perfilesHechosSnap.size / total) * 100 : 100
    if (total >= 5 && pctHechos < 30) {
      alertas.push({
        id: 'low-profile-completion', severidad: 'media', tipo: 'engagement',
        titulo: `Solo ${Math.round(pctHechos)}% de usuarios completaron su perfil`,
        descripcion: `Perfiles incompletos reducen la calidad de recomendaciones.`, accion: 'Ver usuarios', tipoEntidad: 'users',
      })
    }

    const nuevosSemana = todosUsuarios.filter(u => (u.fechaCreacion ?? '') >= hace7Dias).length
    if (nuevosSemana > 0) {
      alertas.push({
        id: 'new-registrations-week', severidad: 'info', tipo: 'growth',
        titulo: `${nuevosSemana} nuevo(s) usuario(s) esta semana`,
        descripcion: `La plataforma está creciendo.`, tipoEntidad: 'users',
      })
    }

    const mantSnap = await this.col(COLECCIONES.configuraciones).where('clave', '==', 'modoMantenimiento').limit(1).get()
    if (!mantSnap.empty && mantSnap.docs[0].data().valor === 'true') {
      alertas.push({
        id: 'maintenance-mode-active', severidad: 'media', tipo: 'platform',
        titulo: 'Modo mantenimiento activado',
        descripcion: 'La plataforma está en modo mantenimiento.', accion: 'Desactivar', tipoEntidad: 'settings',
      })
    }

    const orden: Record<string, number> = { critica: 0, media: 1, info: 2 }
    return alertas.sort((a, b) => (orden[a.severidad] ?? 9) - (orden[b.severidad] ?? 9))
  }
}
