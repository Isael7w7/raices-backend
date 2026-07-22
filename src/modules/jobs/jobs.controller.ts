import { Controller, Get, Post, Param, Body, Query, UseGuards, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery, ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, IsNotEmpty, IsBoolean, IsArray } from 'class-validator'
import { JobsService } from './jobs.service'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

export class CreateJobDto {
  @ApiProperty({ description: 'Título de la vacante', example: 'Terapeuta Ocupacional' })
  @IsString() @IsNotEmpty() titulo: string

  @ApiProperty({ description: 'Descripción detallada de la vacante', required: false, example: 'Buscamos terapeuta ocupacional para atención a niños con TEA...' })
  @IsOptional() @IsString() descripcion?: string

  @ApiProperty({ description: 'Requisitos del puesto', required: false, example: 'Título en terapia ocupacional, experiencia mínima de 2 años' })
  @IsOptional() @IsString() requisitos?: string

  @ApiProperty({ description: 'Modalidad de trabajo', required: false, example: 'presencial', enum: ['presencial', 'remoto', 'híbrido'] })
  @IsOptional() @IsString() modalidad?: string

  @ApiProperty({ description: 'Horario laboral', required: false, example: 'Lunes a viernes 8:00 - 15:00' })
  @IsOptional() @IsString() horario?: string

  @ApiProperty({ description: 'Rango salarial', required: false, example: '$15,000 - $20,000 MXN' })
  @IsOptional() @IsString() rangoSalario?: string

  @ApiProperty({ description: 'Ciudad de la vacante', required: false, example: 'Mérida' })
  @IsOptional() @IsString() ciudad?: string

  @ApiProperty({ description: 'Estado/provincia', required: false, example: 'Yucatán' })
  @IsOptional() @IsString() estado?: string

  @ApiProperty({ description: 'Vacante inclusiva para discapacidad', required: false, default: true })
  @IsOptional() @IsBoolean() inclusivaDiscapacidad?: boolean

  @ApiProperty({ description: 'Tipos de discapacidad que la vacante apoya', required: false, example: ['tea', 'motriz'], type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) tiposDiscapacidad?: string[]

  @ApiProperty({ description: 'ID de la institución (solo admin)', required: false })
  @IsOptional() @IsString() institucionId?: string
}

export class PostulacionDto {
  @ApiProperty({ description: 'Carta de presentación', required: false, example: 'Me interesa esta vacante porque...' })
  @IsOptional() @IsString() cartaPresentacion?: string
}

@ApiTags('Empleo')
@Controller('empleo')
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar vacantes', description: 'Retorna vacantes activas de instituciones activas' })
  @ApiQuery({ name: 'ciudad', required: false, description: 'Filtrar por ciudad' })
  @ApiQuery({ name: 'modalidad', required: false, description: 'Filtrar por modalidad: presencial, remoto, híbrido' })
  @ApiResponse({ status: 200, description: 'Lista de vacantes con información de institución' })
  findAll(@Query('ciudad') ciudad?: string, @Query('modalidad') modalidad?: string) {
    return this.svc.findAll({ ciudad, modalidad })
  }

  @Get('postuladas')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'IDs de vacantes postuladas', description: 'Retorna solo los IDs para saber en cuáles ya aplicaste' })
  @ApiResponse({ status: 200, description: 'Arreglo de IDs de vacantes postuladas' })
  appliedIds(@CurrentUser() user: any) {
    return this.svc.getAppliedJobIds(user.id)
  }

  @Get('mis-postulaciones')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Mis postulaciones', description: 'Retorna todas las postulaciones del usuario con estado y detalles' })
  @ApiResponse({ status: 200, description: 'Lista de postulaciones con título, modalidad, institución' })
  myApplications(@CurrentUser() user: any) {
    return this.svc.myApplications(user.id)
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institucion', 'admin')
  @ApiBearerAuth('jwt-auth')
  @HttpCode(201)
  @ApiOperation({ summary: 'Crear vacante', description: 'Crea una nueva vacante. El usuario debe tener rol de institución o administrador. Para instituciones, se vincula automáticamente a su institución. Para admins, se requiere institucionId.' })
  @ApiResponse({ status: 201, description: 'Vacante creada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Rol insuficiente (se requiere institución o admin)' })
  create(@Body() dto: CreateJobDto, @CurrentUser() user: any) {
    return this.svc.createForUser(user, dto)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de vacante' })
  @ApiParam({ name: 'id', description: 'ID de la vacante' })
  @ApiResponse({ status: 200, description: 'Detalle completo de la vacante con información de institución' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  @Post(':id/postularse')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt-auth')
  @ApiOperation({ summary: 'Postularse a vacante', description: 'Envía una solicitud con carta de presentación. Un usuario solo puede postularse una vez por vacante.' })
  @ApiParam({ name: 'id', description: 'ID de la vacante' })
  @ApiResponse({ status: 201, description: 'Postulación enviada con éxito' })
  @ApiResponse({ status: 409, description: 'Ya enviaste una solicitud para esta vacante' })
  @ApiResponse({ status: 404, description: 'Vacante no encontrada o inactiva' })
  apply(@Param('id') id: string, @Body() dto: PostulacionDto, @CurrentUser() user: any) {
    return this.svc.apply(user.id, id, dto.cartaPresentacion ?? '')
  }
}
