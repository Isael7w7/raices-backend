import { Controller, Get, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiOkResponse, ApiResponse } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { OnboardingService } from './onboarding.service'
import { SaveDraftOnboardingDto } from './dto/save-draft-onboarding.dto'
import { EstadoOnboardingDto, BorradorOnboardingDto, OnboardingCompletadoDto } from './dto/respuestas-onboarding.dto'
import { JwtAuthGuard } from '../../common/guards/jwt.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CurrentUserPayload } from '../../common/interfaces/current-user.interface'
import { UseETag } from '../../common/decorators/use-etag.decorator'

@ApiTags('Onboarding')
@ApiBearerAuth('jwt-auth')
@UseGuards(JwtAuthGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}

  // ─── GET /onboarding/estado ───────────────────────────────────────
  @Get('estado')
  @UseETag()
  @ApiOperation({
    summary: 'Estado del onboarding (Diapositiva 1)',
    description:
      'Retorna porcentaje de progreso, último paso completado, secciones pendientes y las variables de contexto ' +
      '(destinatarioPerfil: PARA_MI | PARA_MI_HIJO y nombrePcd) que el Frontend usa para personalizar las preguntas. ' +
      'Los contextos se derivan de datos ya existentes (destinatarioRegistro, perfil o dependiente del tutor). ' +
      'Usar `seccionesFaltantes` (con `etiqueta` amigable) para mostrar lo que falta en la UI, no las claves técnicas de `pasosPendientes`.',
  })
  @ApiOkResponse({ type: EstadoOnboardingDto, description: 'Estado del onboarding' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  estado(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.obtenerEstado(user.id)
  }

  // ─── POST /onboarding/borrador ────────────────────────────────────
  @Post('borrador')
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // guardados de formulario (frecuentes pero acotados)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Guardar borrador del onboarding (guardado parcial)',
    description:
      'Guarda cualquier subconjunto de preguntas respondidas sin exigir los campos faltantes (nunca 400 por incompletitud). ' +
      'Fusiona con el borrador previo sin sobrescribir con null/undefined y recalcula el progreso. ' +
      'Permite interrumpir el onboarding y continuar después sin perder lo respondido.',
  })
  @ApiBody({ type: SaveDraftOnboardingDto })
  @ApiOkResponse({ type: BorradorOnboardingDto, description: 'Borrador actualizado con progreso recalculado (200 OK)' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos (formato, no incompletitud)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  guardarBorrador(@CurrentUser() user: CurrentUserPayload, @Body() dto: SaveDraftOnboardingDto) {
    return this.svc.saveDraft(user.id, dto)
  }

  // ─── POST /onboarding/completar · consolidación ───────────────────

  @Post('completar')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // cierres de formulario (frecuentes pero acotados)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Consolidar y cerrar el onboarding',
    description:
      'Cierre explícito del formulario (confirmación del último paso). Promueve las respuestas de borradoresOnboarding ' +
      'a perfilesExtendidos y marca el perfil con onboardingCompleto=true y porcentajeProgreso=100, cerrando el bucle ' +
      'del modal "Completa tu perfil". Para roles Tutor/Padre se registra la acreditación sin exigir documentos ' +
      '(nunca es bloqueante). Es idempotente y devuelve el estado final ya calculado.',
  })
  @ApiOkResponse({ type: OnboardingCompletadoDto, description: 'Onboarding consolidado al 100% (200 OK)' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  completar(@CurrentUser() user: CurrentUserPayload) {
    return this.svc.completar(user.id)
  }
}
