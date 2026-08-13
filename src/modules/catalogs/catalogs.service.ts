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
      temporalidadOrigen: this.getTemporalidadOrigen(),
      preferenciaFormato: this.getPreferenciaFormato(),
      areasInteres: this.getAreasInteres(),
      viabilidadEconomica: this.getViabilidadEconomica(),
      subcategoriasComunidad: this.getSubcategoriasComunidad(),
      tonoContextual: this.getTonoContextual(),
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
      'Intelectual/Cognitiva',
      'Motriz',
      'Visual',
      'Auditiva',
      'Habla/Comunicación',
      // Neurodivergencia (con subtipos)
      'TEA / Autismo',
      'TDAH',
      'Dislexia',
      'Dispraxia',
      'Tourette',
      'Altas capacidades',
      'Otra neurodivergencia',
      // Otros
      'Psicosocial',
      'Múltiple',
      'Prefiero no responder',
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

  // ═══════════════════════════════════════════════════════════════════
  // Catálogos requeridos por Spec MVP Raíces
  // ═══════════════════════════════════════════════════════════════════

  /** Temporalidad/Origen de la condición */
  getTemporalidadOrigen(): CatalogoEtapaVida[] {
    return [
      { id: 'nacimiento', label: 'Desde nacimiento' },
      { id: 'infancia', label: 'En infancia' },
      { id: 'adolescencia', label: 'En adolescencia' },
      { id: 'vida_adulta', label: 'En vida adulta' },
      { id: 'progresiva', label: 'Adquisición progresiva' },
      { id: 'en_evaluacion', label: 'En evaluación' },
    ]
  }

  /** Preferencias de formato de contenido */
  getPreferenciaFormato(): CatalogoFeature[] {
    return [
      { id: 'texto', label: 'Texto', description: 'Contenido en texto escrito' },
      { id: 'imagenes', label: 'Imágenes', description: 'Contenido visual con imágenes' },
      { id: 'audio', label: 'Audio', description: 'Contenido en formato de audio' },
      { id: 'video', label: 'Video', description: 'Contenido en formato de video' },
      { id: 'presencial', label: 'Apoyo presencial', description: 'Acompañamiento en persona' },
    ]
  }

  /** Áreas de interés del usuario (Spec: Rutas y Caminos de Desarrollo) */
  getAreasInteres(): { id: string; label: string; subcategorias?: CatalogoFeature[] }[] {
    return [
      {
        id: 'educacion', label: 'Educación',
        subcategorias: [
          { id: 'basica', label: 'Básica', description: 'Educación primaria/secundaria' },
          { id: 'media_superior', label: 'Media/Superior', description: 'Bachillerato y universidad' },
          { id: 'especializada', label: 'Especializada', description: 'Educación especial' },
          { id: 'habilidades_vida', label: 'Habilidades de vida', description: 'Autocuidado, vida diaria' },
          { id: 'cursos', label: 'Cursos', description: 'Cursos extracurriculares' },
        ],
      },
      {
        id: 'comunidad', label: 'Comunidad',
        subcategorias: [
          { id: 'por_tema', label: 'Por tema', description: 'Grupos por tema específico' },
          { id: 'etapa_vida', label: 'Etapa de vida', description: 'Grupos por edad' },
          { id: 'condicion', label: 'Por condición', description: 'Grupos por tipo de discapacidad' },
          { id: 'familias', label: 'Familias', description: 'Grupos para familias' },
          { id: 'intereses', label: 'Intereses', description: 'Grupos por interés común' },
        ],
      },
      { id: 'deporte_arte_bienestar', label: 'Deporte / Arte / Bienestar', subcategorias: [] },
      { id: 'especialistas', label: 'Especialistas', subcategorias: [] },
      { id: 'empleo', label: 'Empleo', subcategorias: [] },
      { id: 'autoempleo', label: 'Autoempleo', subcategorias: [] },
      { id: 'independencia', label: 'Independencia', subcategorias: [] },
      { id: 'vida_social', label: 'Vida Social', subcategorias: [] },
      { id: 'explorar', label: 'Explorar', subcategorias: [] },
    ]
  }

  /** Viabilidad económica */
  getViabilidadEconomica(): CatalogoFeature[] {
    return [
      { id: 'gratuita_becas', label: 'Gratuita/Becas', description: 'Servicios gratuitos o con beca' },
      { id: 'bajo_costo', label: 'Bajo costo', description: 'Costo accesible' },
      { id: 'moderada', label: 'Inversión moderada', description: 'Costo intermedio' },
      { id: 'sin_restricciones', label: 'Sin restricciones', description: 'Sin limitación económica' },
    ]
  }

  // ═══════════════════════════════════════════════════════════════════
  // Subcategorías de comunidad (Spec MVP Raíces)
  // ═══════════════════════════════════════════════════════════════════

  /** Subcategorías de grupos de comunidad */
  getSubcategoriasComunidad(): { id: string; label: string; subcategorias: CatalogoFeature[] }[] {
    return [
      {
        id: 'por_tema', label: 'Por tema',
        subcategorias: [
          { id: 'terapia', label: 'Terapia', description: 'Grupos sobre terapias y tratamientos' },
          { id: 'educacion', label: 'Educación', description: 'Grupos sobre procesos educativos' },
          { id: 'empleo', label: 'Empleo', description: 'Grupos sobre oportunidades laborales' },
          { id: 'legal', label: 'Legal/Derechos', description: 'Grupos sobre derechos y trámites' },
          { id: 'tecnologia', label: 'Tecnología', description: 'Grupos sobre ayudas tecnológicas' },
          { id: 'salud', label: 'Salud', description: 'Grupos sobre salud y bienestar' },
        ],
      },
      {
        id: 'etapa_vida', label: 'Etapa de vida',
        subcategorias: [
          { id: 'bebes', label: 'Bebés (0-3)', description: 'Grupos para padres de bebés' },
          { id: 'infantil', label: 'Infantil (4-12)', description: 'Grupos para familias con niños' },
          { id: 'adolescentes', label: 'Adolescentes (13-17)', description: 'Grupos para adolescentes' },
          { id: 'jovenes', label: 'Jóvenes (18-29)', description: 'Grupos para jóvenes adultos' },
          { id: 'adultos', label: 'Adultos (30+)', description: 'Grupos para adultos' },
          { id: 'adultos_mayores', label: 'Adultos mayores (60+)', description: 'Grupos para adultos mayores' },
        ],
      },
      {
        id: 'condicion', label: 'Por condición',
        subcategorias: [
          { id: 'tea', label: 'TEA / Autismo', description: 'Grupos de autismo' },
          { id: 'tdah', label: 'TDAH', description: 'Grupos de TDAH' },
          { id: 'discapacidad_intelectual', label: 'Discapacidad intelectual', description: 'Grupos de discapacidad intelectual' },
          { id: 'discapacidad_motriz', label: 'Discapacidad motriz', description: 'Grupos de discapacidad motriz' },
          { id: 'discapacidad_visual', label: 'Discapacidad visual', description: 'Grupos de discapacidad visual' },
          { id: 'discapacidad_auditiva', label: 'Discapacidad auditiva', description: 'Grupos de discapacidad auditiva' },
          { id: 'psicosocial', label: 'Psicosocial', description: 'Grupos de salud mental' },
          { id: 'multiple', label: 'Múltiple', description: 'Grupos de discapacidad múltiple' },
        ],
      },
      {
        id: 'familias', label: 'Familias',
        subcategorias: [
          { id: 'padres', label: 'Padres/Madres', description: 'Grupos de padres y madres' },
          { id: 'hermanos', label: 'Hermanos', description: 'Grupos de hermanos de PCD' },
          { id: 'cuidadores', label: 'Cuidadores', description: 'Grupos de cuidadores formales' },
          { id: 'abuelos', label: 'Abuelos', description: 'Grupos de abuelos cuidadores' },
        ],
      },
      {
        id: 'intereses', label: 'Intereses',
        subcategorias: [
          { id: 'deporte', label: 'Deporte', description: 'Grupos deportivos inclusivos' },
          { id: 'arte', label: 'Arte y cultura', description: 'Grupos artísticos y culturales' },
          { id: 'naturaleza', label: 'Naturaleza', description: 'Grupos de contacto con la naturaleza' },
          { id: 'musica', label: 'Música', description: 'Grupos musicales' },
          { id: 'tecnologia_grupo', label: 'Tecnología', description: 'Grupos de tecnología y gadgets' },
          { id: 'cocina', label: 'Cocina', description: 'Grupos de cocina inclusiva' },
        ],
      },
    ]
  }

  /** Tono contextual de la plataforma */
  getTonoContextual(): CatalogoFeature[] {
    return [
      { id: 'formal', label: 'Formal', description: 'Tono profesional y respetuoso' },
      { id: 'cercano', label: 'Cercano', description: 'Tono amigable y cercano' },
      { id: 'empatico', label: 'Empático', description: 'Tono comprensivo y de apoyo' },
      { id: 'directo', label: 'Directo', description: 'Tono claro y conciso' },
      { id: 'infantil', label: 'Infantil', description: 'Tono sencillo y accesible para niños' },
    ]
  }
}
