// ─── Mensaje directo (u_direct_messages) ─────────────────────────────────
export interface Message {
  id: string
  from_id: string
  to_id: string
  content: string
  is_read: boolean
  created_at: string
}

// ─── DTOs ────────────────────────────────────────────────────────────────
export interface CreateMessageData {
  from_id: string
  to_id: string
  content: string
}

// ─── Token de inyección ──────────────────────────────────────────────────
export const MESSAGE_REPOSITORY = 'MESSAGE_REPOSITORY'

// ─── Interfaz del repositorio ────────────────────────────────────────────
export interface IMessageRepository {
  /** Mensajes enviados por un usuario */
  findSentByUser(userId: string): Promise<Message[]>

  /** Mensajes recibidos por un usuario */
  findReceivedByUser(userId: string): Promise<Message[]>

  /** Todos los mensajes entre dos usuarios (ambas direcciones) */
  findMessagesBetween(userId: string, partnerId: string): Promise<Message[]>

  /** Envía un nuevo mensaje */
  sendMessage(data: CreateMessageData): Promise<Message>

  /** Cuenta mensajes no leídos de un usuario */
  getUnreadCount(userId: string): Promise<number>

  /** Marca como leídos los mensajes de un remitente hacia un destinatario */
  markMessagesAsRead(fromUserId: string, toUserId: string): Promise<void>

  /** Marca todos los mensajes no leídos de un usuario como leídos */
  markAllAsRead(userId: string): Promise<void>
}
