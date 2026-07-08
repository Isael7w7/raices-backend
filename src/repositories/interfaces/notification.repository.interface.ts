// ─── Notificación (u_notifications) ──────────────────────────────────────
export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  ref_id: string | null
  is_read: boolean
  created_at: string
}

// ─── DTOs ────────────────────────────────────────────────────────────────
export interface CreateNotificationData {
  user_id: string
  type: string
  title: string
  body: string
  ref_id?: string | null
}

// ─── Token de inyección ──────────────────────────────────────────────────
export const NOTIFICATION_REPOSITORY = 'NOTIFICATION_REPOSITORY'

// ─── Interfaz del repositorio ────────────────────────────────────────────
export interface INotificationRepository {
  /** Crea una nueva notificación */
  create(data: CreateNotificationData): Promise<Notification>

  /** Lista las últimas notificaciones de un usuario (máx. 50) */
  findByUser(userId: string): Promise<Notification[]>

  /** Cuenta notificaciones no leídas de un usuario */
  getUnreadCount(userId: string): Promise<number>

  /** Marca una notificación como leída (verifica que pertenezca al usuario) */
  markAsRead(userId: string, notifId: string): Promise<void>

  /** Marca todas las notificaciones no leídas de un usuario como leídas */
  markAllAsRead(userId: string): Promise<void>

  /** Elimina una notificación por ID */
  delete(notifId: string): Promise<void>
}
