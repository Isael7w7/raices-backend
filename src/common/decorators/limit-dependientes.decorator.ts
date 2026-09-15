import { SetMetadata } from '@nestjs/common'

/**
 * Decorador que marca un endpoint para que el {@link LimitDependientesGuard}
 * valide que el tutor no haya alcanzado el límite máximo de dependientes
 * antes de ejecutar el handler.
 *
 * @example
 * ```ts
 * @Post('dependientes')
 * @LimitDependientes()
 * addDependent(@CurrentUser() user, @Body() dto) { ... }
 * ```
 */
export const LIMIT_DEPENDIENTES_KEY = 'limitDependientes'
export const LimitDependientes = () => SetMetadata(LIMIT_DEPENDIENTES_KEY, true)
