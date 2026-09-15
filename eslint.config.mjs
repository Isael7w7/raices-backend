// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ESLint — configuración plana (flat config)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Regla clave: @typescript-eslint/no-explicit-any en 'error' para TODO src,
 * con dos excepciones documentadas:
 *
 *  1. *.spec.ts — los mocks de pruebas usan objetos dinámicos (convención del
 *     repo); se permite `any` ahí.
 *
 *  2. Lista de archivos legados (ratchet): la regla baja a 'warn' SOLO en esos
 *     archivos para no bloquear el desarrollo mientras se migran. La deuda es
 *     visible (aparece en `pnpm lint`) y acotada. Cuando se migre un archivo a
 *     tipos reales, se retira de la lista y la regla vuelve a 'error' para él.
 *     NO se deben añadir archivos nuevos a esta lista.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'docs/**', 'scripts/**'] },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // Convención del repo: los parámetros intencionalmente sin usar llevan prefijo _
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    // ═══ DEUDA TÉCNICA — ratchet de no-explicit-any ═══
    files: [
      'src/common/audit/audit.service.ts',
      'src/common/decorators/audit.decorator.ts',
      'src/common/decorators/is-curp-valida.decorator.ts',
      'src/common/dto/paginacion.dto.ts',
      'src/common/guards/feature.guard.ts',
      'src/common/guards/firebase-auth.guard.ts',
      'src/common/interceptors/audit.interceptor.ts',
      'src/common/interceptors/etag.interceptor.ts',
      'src/common/utils/image-filter.ts',
      'src/database/firebase.provider.ts',
      'src/modules/admin/admin.service.ts',
      'src/modules/auth/auth.service.ts',
      'src/modules/community/community.service.ts',
      'src/modules/favorites/favorites.service.ts',
      'src/modules/health/health.service.ts',
      'src/modules/institutions/csf-qr.service.ts',
      'src/modules/institutions/institutions.service.ts',
      'src/modules/jobs/jobs.service.ts',
      'src/modules/messages/messages.service.ts',
      'src/modules/notifications/notifications.controller.ts',
      'src/modules/notifications/notifications.service.ts',
      'src/modules/recommendations/recommendations.controller.ts',
      'src/modules/recommendations/recommendations.service.ts',
      'src/modules/reviews/reviews.service.ts',
      'src/modules/routes/routes.service.ts',
      'src/modules/storage/storage.service.ts',
      'src/modules/users/users.service.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
)
