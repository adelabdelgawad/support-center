/**
 * System Events type definitions
 * Converted from backend snake_case to camelCase for frontend use
 */

export interface SystemMessagePreview {
  id: number
  messageType: string
  templateEn: string
  templateAr: string
  isActive: boolean
}

export interface SystemEventResponse {
  id: number
  eventKey: string
  eventNameEn: string
  eventNameAr: string
  descriptionEn?: string | null
  descriptionAr?: string | null
  systemMessageId?: number | null
  triggerTiming: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  createdBy?: string | null
  updatedBy?: string | null
  systemMessage?: SystemMessagePreview | null
}

export interface SystemEventListResponse {
  events: SystemEventResponse[]
  total: number
  activeCount: number
  inactiveCount: number
}

export interface SystemEventCreate {
  eventKey: string
  eventNameEn: string
  eventNameAr: string
  descriptionEn?: string | null
  descriptionAr?: string | null
  systemMessageId?: number | null
  triggerTiming?: string
  isActive?: boolean
}

export interface SystemEventUpdate {
  eventNameEn?: string | null
  eventNameAr?: string | null
  descriptionEn?: string | null
  descriptionAr?: string | null
  systemMessageId?: number | null
  triggerTiming?: string | null
  isActive?: boolean | null
}

export interface SystemEventCountsResponse {
  total: number
  activeCount: number
  inactiveCount: number
}
