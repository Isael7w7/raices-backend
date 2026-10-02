import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional } from 'class-validator'

/**
 * Guardado de los modales de tutor: "Configurar opciones" (casillas de
 * módulos) y "Permisos de acceso" (interruptores de acciones). Todos los
 * campos son opcionales y booleanos: solo se modifican los enviados.
 *
 * Los módulos/acciones con equivalente funcional también actualizan `features`
 * (`instituciones`→`descubrimiento`, `empleo`→`postulaciones`,
 * `comunidad`→`comunidad`, `accesoChat`→`chat`,
 * `accesoMultimedia`→`multimedia`); se conservan los nombres clásicos
 * (`chat`, `postulaciones`, ...) por compatibilidad con clientes anteriores.
 */
export class ActualizarPermisosDependienteDto {
  // ── Módulos (casillas del modal "Configurar opciones") ──────────────

  @ApiPropertyOptional({ description: 'Módulo Instituciones (descubrimiento y favoritos de instituciones)', example: true })
  @IsOptional() @IsBoolean()
  instituciones?: boolean

  @ApiPropertyOptional({ description: 'Módulo Empleo (postulaciones a vacantes)', example: true })
  @IsOptional() @IsBoolean()
  empleo?: boolean

  @ApiPropertyOptional({ description: 'Módulo Comunidad (publicaciones, eventos, foros)', example: true })
  @IsOptional() @IsBoolean()
  comunidad?: boolean

  // ── Acciones (interruptores del modal "Permisos de acceso") ─────────

  @ApiPropertyOptional({ description: 'Puede comentar publicaciones', example: false })
  @IsOptional() @IsBoolean()
  puedeComentar?: boolean

  @ApiPropertyOptional({ description: 'Puede interactuar (me gusta, asistencia a eventos, unirse a grupos)', example: true })
  @IsOptional() @IsBoolean()
  puedeInteractuar?: boolean

  @ApiPropertyOptional({ description: 'Acceso a contenido multimedia (fotos, videos, audios)', example: true })
  @IsOptional() @IsBoolean()
  accesoMultimedia?: boolean

  @ApiPropertyOptional({ description: 'Acceso al chat / mensajería directa', example: true })
  @IsOptional() @IsBoolean()
  accesoChat?: boolean

  // ── Compatibilidad: nombres clásicos de features ────────────────────

  @ApiPropertyOptional({ description: 'Alias clásico de features.chat (usar accesoChat)', example: true })
  @IsOptional() @IsBoolean()
  chat?: boolean

  @ApiPropertyOptional({ description: 'Alias clásico de features.postulaciones (usar empleo)', example: true })
  @IsOptional() @IsBoolean()
  postulaciones?: boolean

  @ApiPropertyOptional({ description: 'Permitir escribir reseñas', example: true })
  @IsOptional() @IsBoolean()
  resenas?: boolean

  @ApiPropertyOptional({ description: 'Alias clásico de features.descubrimiento (usar instituciones)', example: true })
  @IsOptional() @IsBoolean()
  descubrimiento?: boolean

  @ApiPropertyOptional({ description: 'Permitir guardar instituciones como favoritas', example: true })
  @IsOptional() @IsBoolean()
  favoritos?: boolean

  @ApiPropertyOptional({ description: 'Alias clásico de features.multimedia (usar accesoMultimedia)', example: true })
  @IsOptional() @IsBoolean()
  multimedia?: boolean
}
