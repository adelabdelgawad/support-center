/**
 * System Messages type definitions
 * Converted from backend snake_case to camelCase for frontend use
 */

export interface SystemMessageResponse {
  id: number
  messageType: string
  templateEn: string
  templateAr: string
  isActive: boolean
  createdAt: string
}

export interface SystemMessageListResponse {
  messages: SystemMessageResponse[]
  total: number
  activeCount: number
  inactiveCount: number
}

export interface SystemMessageCreate {
  messageType: string
  templateEn: string
  templateAr: string
  isActive?: boolean
}

export interface SystemMessageUpdate {
  templateEn?: string | null
  templateAr?: string | null
  isActive?: boolean | null
}

export interface SystemMessageCountsResponse {
  total: number
  activeCount: number
  inactiveCount: number
}

/**
 * Extended response with linked events count
 * Used in table to show how many events reference this message
 */
export interface SystemMessageWithEventsResponse extends SystemMessageResponse {
  linkedEventsCount?: number
}
