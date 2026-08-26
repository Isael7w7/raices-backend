import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiOkResponse, ApiCreatedResponse, ApiResponse } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { RecommendationsService } from './recommendations.service'
import { RegistrarInteraccionDto } from './dto/registrar-interaccion.dto'
import { RecomendacionesQueryDto, InteraccionRegistradaDto, PaginaRecomendacionesDto, PesosInteraccionDto } from './dto/respuestas-recomendaciones.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'

@ApiTags('Recomendaciones')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('usuarios')
export class RecommendationsController {
  constructor(private readonly svc: RecommendationsService) {}

  // ─── POST /usuarios/interacciones ──────────────────────────────────
  @Post('interacciones')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // interacciones frecuentes (clicks)
  @ApiOperation({
    summary: 'Registrar interacción con una institución',
    description: 'Registra un evento de comportamiento (guardar, ver_detalle o click_card) para calcular los pesos de recomendación por categoría.',
  })
  @ApiBody({ type: RegistrarInteraccionDto })
  @ApiCreatedResponse({ type: InteraccionRegistradaDto, description: 'Interacción registrada' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  registrar(@CurrentUser() user: CurrentUserPayload, @Body() dto: RegistrarInteraccionDto) {
    return this.svc.registrar(user.id, dto)
  }

  // ─── GET /usuarios/interacciones/pesos ─────────────────────────────
  @Get('interacciones/pesos')
  @ApiOperation({
    summary: 'Pesos de comportamiento por categoría',
    description: 'Calcula los puntos acumulados por categoría en los últimos 30 días. Puntos por interacción: guardar=10, ver_detalle=5, click_card=2.',
  })
  @ApiOkResponse({ type: PesosInteraccionDto, description: 'Pesos agrupados por categoría' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  async pesos(@CurrentUser() user: CurrentUserPayload) {
    return { pesos: await this.svc.pesos(user.id) }
  }

  // ─── GET /usuarios/recomendaciones ─────────────────────────────────
  @Get('recomendaciones')
  @ApiOperation({
    summary: 'Recomendaciones personalizadas',
    description: 'Cruza los intereses/metas del perfil extendido (60% del score) con los pesos de comportamiento de los últimos 30 días (40%) y devuelve instituciones activas ordenadas por final_score descendente.',
  })
  @ApiOkResponse({ type: PaginaRecomendacionesDto, description: 'Listado paginado ordenado por final_score descendente' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  recomendaciones(@CurrentUser() user: CurrentUserPayload, @Query() q: RecomendacionesQueryDto) {
    return this.svc.recomendaciones(user.id, q.pagina, q.limite)
  }
}
