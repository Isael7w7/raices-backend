import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsIn } from 'class-validator'
import { IsCurpValida } from '../../../common/decorators/is-curp-valida.decorator'

export class ActualizarPerfilDto {
  @ApiPropertyOptional({
    description: 'Nombre completo del usuario',
    example: 'Juan Pérez López',
  })
  @IsOptional()
  @IsString()
  nombreCompleto?: string

  @ApiPropertyOptional({
    description: 'Ciudad de residencia',
    example: 'Mérida',
  })
  @IsOptional()
  @IsString()
  ciudad?: string

  @ApiPropertyOptional({
    description: 'Estado o provincia',
    example: 'Yucatán',
  })
  @IsOptional()
  @IsString()
  estado?: string

  @ApiPropertyOptional({
    description: 'URL del avatar (se actualiza con POST /avatar)',
    example: 'https://storage.googleapis.com/.../avatar.jpg',
  })
  @IsOptional()
  @IsString()
  urlAvatar?: string

  @ApiPropertyOptional({
    description: 'Profesión o rol descriptivo que se muestra en la tarjeta de comunidad',
    example: 'Madre de familia',
  })
  @IsOptional()
  @IsString()
  profesion?: string

  @ApiPropertyOptional({
    description: 'Biografía corta del usuario (se muestra en la sección de miembros de la comunidad)',
    example: 'Mamá de Santiago (8 años, TEA). Comparte experiencias sobre terapia ABA y escuela inclusiva.',
  })
  @IsOptional()
  @IsString()
  bio?: string

  // ═══════════════════════════════════════════════════════════════════
  // Campos requeridos por el Especificación Funcional MVP Raíces
  // ═══════════════════════════════════════════════════════════════════

  @ApiPropertyOptional({
    description: 'CURP del usuario (18 caracteres, formato oficial mexicano)',
    example: 'GAPL800101MCYRL093',
  })
  @IsOptional()
  @IsString()
  @IsCurpValida({ message: 'La CURP no tiene un formato válido. Debe ser una CURP oficial mexicana de 18 caracteres' })
  curp?: string

  @ApiPropertyOptional({
    description: 'Teléfono o WhatsApp de contacto',
    example: '9991234567',
  })
  @IsOptional()
  @IsString()
  telefonoContacto?: string

  @ApiPropertyOptional({
    description: 'Para quién se realizó el registro',
    enum: ['para_mi', 'para_hijo', 'para_familiar', 'para_cuidado'],
  })
  @IsOptional()
  @IsIn(['para_mi', 'para_hijo', 'para_familiar', 'para_cuidado'])
  destinatarioRegistro?: string

  @ApiPropertyOptional({
    description: 'Preferencia de acompañamiento',
    enum: ['explorar_solo', 'recomendaciones_paso', 'apoyo_necesite'],
  })
  @IsOptional()
  @IsIn(['explorar_solo', 'recomendaciones_paso', 'apoyo_necesite'])
  preferenciasAcompanamiento?: string
}
