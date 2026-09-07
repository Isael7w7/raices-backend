import { Controller, Post, Patch, Get, Body, Param, Req, HttpCode, UseGuards } from '@nestjs/common'
import { Request } from 'express'
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AiService } from './ai.service'
import { ValidationService } from './validation.service'
import { ChatIaDto } from './dto/chat-ia.dto'
import { RecomendacionIaDto } from './dto/recomendacion-ia.dto'
import { RespuestaResumenDto } from './dto/resumen-ia.dto'
import { RespuestaChatDto, RespuestaRecomendacionDto } from './dto/respuestas-ia.dto'
import { ResultadoValidacionIaDto, OverrideValidacionDto } from './dto/validacion-ia.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { DependientePropietarioGuard } from '../../common/guards/dependiente-propietario.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import type { DependienteDoc } from '../../common/interfaces/firestore-documents.interface'

@ApiTags('Inteligencia Artificial')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('ia')
export class AiController {
  constructor(
    private readonly svc: AiService,
    private readonly validacion: ValidationService,
  ) {}

  @Post('conversacion')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 3600000 } }) // 20 chats por hora
  @ApiOperation({ summary: 'Conversación con asistente IA', description: 'Conversa con el asistente de Raíces. Usa el perfil del usuario para dar respuestas contextualizadas. Máximo 150 palabras por respuesta.' })
  @ApiOkResponse({ type: RespuestaChatDto, description: 'Respuesta del asistente' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  chat(@Body() dto: ChatIaDto, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.chat(user.id, dto.mensaje, dto.historial ?? [])
  }

  @Post('recomendaciones')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, DependientePropietarioGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } }) // 10 recomendaciones por hora
  @ApiOperation({ summary: 'Recomendaciones personalizadas', description: 'Genera 3 próximos pasos concretos basados en el perfil del usuario o de un dependiente. Incluye sugerencias de instituciones. Si se envía dependienteId, se valida que el dependiente pertenezca al tutor autenticado.' })
  @ApiOkResponse({ type: RespuestaRecomendacionDto, description: 'Próximos pasos, razonamiento y sugerencias de instituciones' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Dependiente no encontrado o no pertenece al tutor' })
  recommend(@Body() dto: RecomendacionIaDto, @CurrentUser() user: CurrentUserPayload, @Req() req: Request) {
    if (dto?.dependienteId) {
      // DependientePropietarioGuard ya validó la autoría y adjuntó el documento en request.dependiente
      const { dependiente } = req as Request & { dependiente?: DependienteDoc }
      return this.svc.recommendForDependent(user.id, dto.dependienteId, dependiente)
    }
    return this.svc.recommend(user.id)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Resúmenes narrativos (Spec MVP Raíces)
  // ═══════════════════════════════════════════════════════════════════

  @Post('resumen')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 resúmenes por hora
  @ApiOperation({
    summary: 'Resumen narrativo del perfil',
    description: 'Genera un resumen de 1 párrafo (historia interpretativa) y 3 párrafos (quién eres, contexto, intereses/aspiraciones) basado estrictamente en los datos del usuario. NO inventa información no proporcionada.',
  })
  @ApiOkResponse({ type: RespuestaResumenDto, description: 'Resumen narrativo personalizado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  generarResumen(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.generarResumen(user.id)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Validación automática de usuarios por IA (solo administradores)
  // ═══════════════════════════════════════════════════════════════════

  @Post('validar-usuario/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Throttle({ default: { limit: 20, ttl: 3600000 } }) // 20 validaciones manuales por hora
  @ApiOperation({
    summary: 'Ejecutar validación manual por IA',
    description: 'Analiza con Gemini la coherencia de nombre, email, CURP, rol, datos de institución y documentos de identidad del usuario. Confianza >= 80% con criterios clave → verificación inmediata; 50-79% → revisión manual del admin (último recurso); < 50% o problemas graves → rechazo. Si Vertex AI no está disponible, valida con reglas de código.',
  })
  @ApiParam({ name: 'id', description: 'ID del usuario a validar' })
  @ApiOkResponse({ type: ResultadoValidacionIaDto, description: 'Resultado de la validación' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo administradores' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  validarUsuario(@Param('id') id: string) {
    return this.validacion.validarUsuario(id)
  }

  @Patch('validar-usuario/:id/override')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Override manual de validación (admin)',
    description: 'Permite a un administrador aprobar o rechazar manualmente la verificación de una cuenta, sin pasar por la IA. La decisión queda registrada en el historial de validaciones.',
  })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  @ApiBody({ type: OverrideValidacionDto })
  @ApiOkResponse({ type: ResultadoValidacionIaDto, description: 'Registro del override aplicado' })
  @ApiResponse({ status: 400, description: 'Cuerpo inválido (falta aprobado)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo administradores' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  overrideValidacion(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: OverrideValidacionDto) {
    return this.validacion.overrideValidacion(id, dto.aprobado, user.id, dto.motivo)
  }

  @Get('validar-usuario/:id/historial')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Historial de validaciones por IA',
    description: 'Devuelve todas las validaciones (automáticas, fallback por reglas y overrides de admin) del usuario, ordenadas de la más reciente a la más antigua.',
  })
  @ApiParam({ name: 'id', description: 'ID del usuario' })
  @ApiOkResponse({ type: [ResultadoValidacionIaDto], description: 'Historial de validaciones' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Solo administradores' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  historialValidaciones(@Param('id') id: string) {
    return this.validacion.obtenerHistorial(id)
  }
}
