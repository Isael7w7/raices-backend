import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class UsuarioSesionDto {
  @ApiProperty({ description: 'ID del usuario (UID de Firebase)', example: 'uid-123' })
  id!: string

  @ApiProperty({ description: 'Correo electrónico', example: 'usuario@correo.mx' })
  email!: string

  @ApiProperty({ description: 'Rol del usuario', enum: ['pcd', 'tutor', 'institucion', 'admin'], example: 'pcd' })
  rol!: string

  @ApiProperty({ description: 'Nombre completo', example: 'Juan Pérez' })
  nombreCompleto!: string

  @ApiProperty({ description: 'ID del tutor si la cuenta PCD está vinculada', example: 'tutor-uid', nullable: true })
  tutorId!: string | null

  @ApiProperty({ description: 'ID de la institución asociada', example: 'inst-uid', nullable: true })
  institucionId!: string | null

  @ApiProperty({ description: 'Banderas de funcionalidades', example: { chat: true, postulaciones: true } })
  features!: Record<string, boolean>

  @ApiPropertyOptional({ description: 'Para quién se registró', enum: ['para_mi', 'para_hijo', 'para_familiar', 'para_cuidado'], nullable: true })
  destinatarioRegistro?: string | null

  @ApiPropertyOptional({ description: 'CURP del usuario', nullable: true })
  curp?: string | null

  @ApiPropertyOptional({ description: 'Teléfono de contacto', nullable: true })
  telefonoContacto?: string | null

  @ApiPropertyOptional({ description: 'Preferencia de acompañamiento', enum: ['explorar_solo', 'recomendaciones_paso', 'apoyo_necesite'], nullable: true })
  preferenciasAcompanamiento?: string | null
}

export class RespuestaSesionDto {
  @ApiProperty({ description: 'ID token de Firebase (usar como Bearer)', example: 'eyJhbGciOi...' })
  tokenAcceso!: string

  @ApiProperty({ description: 'Token de refresco', example: 'AMf-vB2...' })
  tokenRefresco!: string

  @ApiProperty({ description: 'Segundos de validez del token', example: 3600 })
  expiraEn!: number

  @ApiProperty({ type: UsuarioSesionDto })
  usuario!: UsuarioSesionDto
}

export class RespuestaRegistroDto {
  @ApiProperty({ type: UsuarioSesionDto })
  usuario!: UsuarioSesionDto

  @ApiProperty({
    description: 'El registro no devuelve tokens: el cliente debe llamar a inicio-sesion para obtenerlos',
    example: true,
  })
  requiereInicioSesion!: boolean
}

export class InstitucionBreveDto {
  @ApiProperty({ example: 'inst-uid' })
  id!: string

  @ApiProperty({ example: 'Centro de Rehabilitación' })
  nombre!: string | null

  @ApiProperty({ example: 'funcional', nullable: true })
  categoria!: string | null

  @ApiProperty({ example: 'Terapias físicas y ocupacionales.', nullable: true })
  descripcion!: string | null

  @ApiProperty({ example: '9999990001', nullable: true })
  telefono!: string | null

  @ApiProperty({ example: ['tea', 'motriz'], type: [String], nullable: true })
  tiposDiscapacidad!: string[] | null

  @ApiProperty({ example: 'Mérida', nullable: true })
  ciudad!: string | null

  @ApiProperty({ example: 'Yucatán', nullable: true })
  estado!: string | null

  @ApiProperty({ example: 'https://storage.../logo.png', nullable: true })
  urlLogo!: string | null

  @ApiProperty({ example: true })
  activa!: boolean

  @ApiProperty({ example: false })
  verificada!: boolean

  @ApiProperty({ example: 4.5 })
  calificacionPromedio!: number

  @ApiProperty({ example: 12 })
  cantidadCalificaciones!: number
}

export class RespuestaPerfilDto {
  @ApiProperty({ example: 'uid-123' })
  id!: string

  @ApiProperty({ example: 'usuario@correo.mx' })
  email!: string

  @ApiProperty({ enum: ['pcd', 'tutor', 'institucion', 'admin'], example: 'pcd' })
  rol!: string

  @ApiProperty({ example: 'Juan Pérez' })
  nombreCompleto!: string

  @ApiProperty({ example: 'Mérida', nullable: true })
  ciudad!: string | null

  @ApiProperty({ example: 'Yucatán', nullable: true })
  estado!: string | null

  @ApiProperty({ example: 'https://storage.../avatar.jpg', nullable: true })
  urlAvatar!: string | null

  @ApiProperty({ example: false })
  verificado!: boolean

  @ApiProperty({ example: 'tutor-uid', nullable: true })
  tutorId!: string | null

  @ApiProperty({ example: 'inst-uid', nullable: true })
  institucionId!: string | null

  @ApiProperty({ example: { chat: true, postulaciones: true } })
  features!: Record<string, boolean>

  @ApiPropertyOptional({ type: InstitucionBreveDto, description: 'Datos de la institución (solo rol institución)' })
  institucion?: InstitucionBreveDto | null

  @ApiPropertyOptional({ description: 'Para quién se registró', enum: ['para_mi', 'para_hijo', 'para_familiar', 'para_cuidado'], nullable: true })
  destinatarioRegistro?: string | null

  @ApiPropertyOptional({ description: 'CURP del usuario', nullable: true })
  curp?: string | null

  @ApiPropertyOptional({ description: 'Teléfono de contacto', nullable: true })
  telefonoContacto?: string | null

  @ApiPropertyOptional({ description: 'Preferencia de acompañamiento', enum: ['explorar_solo', 'recomendaciones_paso', 'apoyo_necesite'], nullable: true })
  preferenciasAcompanamiento?: string | null
}
