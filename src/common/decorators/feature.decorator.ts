import { SetMetadata } from '@nestjs/common'

/**
 * Decorador que marca un endpoint con el nombre de la funcionalidad
 * que requiere permiso. Se usa junto con {@link FeatureGuard}.
 *
 * @example
 * ```ts
 * @Post('postularse')
 * @Feature('postulaciones')
 * apply(@CurrentUser() user) { ... }
 * ```
 */
export const Feature = (feature: string) => SetMetadata('feature', feature)
