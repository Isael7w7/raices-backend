import { Injectable, Inject, ForbiddenException } from '@nestjs/common'
import { Firestore } from 'firebase-admin/firestore'
import { FIRESTORE } from '../../database/firebase.provider'
import { COLECCIONES } from '../../database/firestore.constants'
import { randomUUID } from 'crypto'

@Injectable()
export class MessagesService {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async getConversations(usuarioId: string) {
    const [enviadosSnap, recibidosSnap] = await Promise.all([
      this.db.collection(COLECCIONES.mensajesDirectos).where('remitenteId', '==', usuarioId).get(),
      this.db.collection(COLECCIONES.mensajesDirectos).where('destinatarioId', '==', usuarioId).get(),
    ])
    const mensajes = [...enviadosSnap.docs, ...recibidosSnap.docs].map(d => ({ id: d.id, ...d.data() } as any))

    const socios = new Map<string, any>()
    for (const msg of mensajes) {
      const socioId = msg.remitenteId === usuarioId ? msg.destinatarioId : msg.remitenteId
      if (!socios.has(socioId)) socios.set(socioId, msg)
    }
    if (socios.size === 0) return []

    const sociosIds = Array.from(socios.keys())
    const lotes: string[][] = []
    for (let i = 0; i < sociosIds.length; i += 30) lotes.push(sociosIds.slice(i, i + 30))

    const perfiles = new Map<string, any>()
    for (const lote of lotes) {
      const snap = await this.db.collection(COLECCIONES.perfiles).where('__name__', 'in', lote).get()
      snap.docs.forEach(d => perfiles.set(d.id, d.data()))
    }

    return sociosIds.map(sid => ({
      socio: perfiles.get(sid) ?? { id: sid },
      ultimoMensaje: socios.get(sid)?.contenido ?? '',
      ultimoEn: socios.get(sid)?.fechaCreacion,
      noLeidos: mensajes.filter(m => m.remitenteId === sid && m.destinatarioId === usuarioId && !m.leido).length,
    })).sort((a: any, b: any) => new Date(b.ultimoEn ?? 0).getTime() - new Date(a.ultimoEn ?? 0).getTime())
  }

  async getMessages(usuarioId: string, socioId: string) {
    const noLeidosSnap = await this.db.collection(COLECCIONES.mensajesDirectos)
      .where('remitenteId', '==', socioId)
      .where('destinatarioId', '==', usuarioId)
      .where('leido', '==', false).get()
    const lote = this.db.batch()
    for (const doc of noLeidosSnap.docs) lote.update(doc.ref, { leido: true })
    if (!noLeidosSnap.empty) await lote.commit()

    const [enviadosSnap, recibidosSnap] = await Promise.all([
      this.db.collection(COLECCIONES.mensajesDirectos)
        .where('remitenteId', '==', usuarioId).where('destinatarioId', '==', socioId).get(),
      this.db.collection(COLECCIONES.mensajesDirectos)
        .where('remitenteId', '==', socioId).where('destinatarioId', '==', usuarioId).get(),
    ])

    return [...enviadosSnap.docs, ...recibidosSnap.docs]
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => new Date(a.fechaCreacion ?? 0).getTime() - new Date(b.fechaCreacion ?? 0).getTime())
  }

  async sendMessage(remitenteId: string, destinatarioId: string, contenido: string) {
    if (remitenteId === destinatarioId) throw new ForbiddenException('No puedes enviarte mensajes a ti mismo')
    const destinatario = await this.db.collection(COLECCIONES.perfiles).doc(destinatarioId).get()
    if (!destinatario.exists || !destinatario.data()?.activo) throw new ForbiddenException('Usuario destinatario no existe')

    const id = randomUUID()
    const msg = { id, remitenteId, destinatarioId, contenido, leido: false, fechaCreacion: new Date().toISOString() }
    await this.db.collection(COLECCIONES.mensajesDirectos).doc(id).set(msg)
    return msg
  }

  async getUnreadCount(usuarioId: string): Promise<number> {
    const snap = await this.db.collection(COLECCIONES.mensajesDirectos)
      .where('destinatarioId', '==', usuarioId).where('leido', '==', false).get()
    return snap.size
  }
}
