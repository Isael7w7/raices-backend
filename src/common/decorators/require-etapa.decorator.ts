import { SetMetadata } from '@nestjs/common'

/**
 * Marca un endpoint con la etapa que el usuario debe tener COMPLETADA
 * para poder consumirlo. Se usa junto con {@link EtapaGuard}.
 *
 * Ejemplo: un endpoint perteneciente a la Etapa 2 exige haber completado
 * la Etapa 1 → `@RequireEtapa(1)`. Si no está completada, el guard responde
 * 403 con "Debes completar la Etapa 1 para acceder a este módulo".
 *
 * Sin metadata, el acceso queda libre (mismo patrón que @Roles y @Feature).
 *
 * @example
 * ```ts
 * @Post('rutinas')
 * @UseGuards(JwtAuthGuard, EtapaGuard)
 * @RequireEtapa(1)
 * crearRutina() { ... }
 * ```
 */
export const RequireEtapa = (etapa: number) => SetMetadata('etapa', etapa)
