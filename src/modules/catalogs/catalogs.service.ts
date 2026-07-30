import { Injectable } from '@nestjs/common'

export interface CatalogoEtapaVida {
  id: string
  label: string
}

export interface CatalogoFeature {
  id: string
  label: string
  description: string
}

export interface CatalogoCategoria {
  id: string
  label: string
  color: string
}

@Injectable()
export class CatalogsService {
  /**
   * Retorna todos los catálogos combinados en un solo objeto.
   * Útil para el frontend cuando necesita cargar todos los catálogos de una vez.
   */
  getAll() {
    return {
      parentescos: this.getParentescos(),
      discapacidades: this.getDiscapacidades(),
      etapasVida: this.getEtapasVida(),
      features: this.getFeatures(),
      categorias: this.getCategorias(),
    }
  }

  getParentescos(): string[] {
    return [
      'Hijo/a',
      'Hermano/a',
      'Nieto/a',
      'Sobrino/a',
      'Cónyuge',
      'Tutor legal',
      'Otro familiar',
    ]
  }

  getDiscapacidades(): string[] {
    return [
      'Motriz',
      'Visual',
      'Auditiva',
      'Intelectual',
      'Psicosocial',
      'TEA / Autismo',
      'Síndrome de Down',
      'Lenguaje',
      'Múltiple',
      'Otra',
    ]
  }

  getEtapasVida(): CatalogoEtapaVida[] {
    return [
      { id: 'infancia', label: 'Infancia (0-12)' },
      { id: 'adolescencia', label: 'Adolescencia (13-17)' },
      { id: 'adultoJoven', label: 'Adulto joven (18-29)' },
      { id: 'adulto', label: 'Adulto (30-59)' },
      { id: 'mayor', label: 'Adulto mayor (60+)' },
    ]
  }

  getFeatures(): CatalogoFeature[] {
    return [
      { id: 'instituciones', label: 'Instituciones', description: 'Explorar y buscar instituciones' },
      { id: 'empleo', label: 'Empleo', description: 'Ver y postularse a vacantes laborales' },
      { id: 'comunidad', label: 'Comunidad', description: 'Publicar y comentar en la comunidad' },
      { id: 'mensajes', label: 'Mensajes', description: 'Enviar y recibir mensajes' },
      { id: 'favoritos', label: 'Favoritos', description: 'Guardar instituciones favoritas' },
      { id: 'asistenteIa', label: 'Asistente IA', description: 'Usar el asistente de inteligencia artificial' },
      { id: 'notificaciones', label: 'Notificaciones', description: 'Recibir notificaciones' },
    ]
  }

  getCategorias(): CatalogoCategoria[] {
    return [
      { id: 'funcional', label: 'Funcional', color: '#01ADFF' },
      { id: 'educativo', label: 'Educativo', color: '#8B6BAE' },
      { id: 'laboral', label: 'Laboral', color: '#D4944C' },
      { id: 'social', label: 'Social', color: '#4BA3A3' },
    ]
  }
}
