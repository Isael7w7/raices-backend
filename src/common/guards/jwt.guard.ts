// Re-export FirebaseAuthGuard as JwtAuthGuard for backward compatibility
// All usage of JwtAuthGuard across the codebase now delegates to Firebase Auth.
export { FirebaseAuthGuard as JwtAuthGuard } from './firebase-auth.guard'

