/**
 * Request Statuses type definitions
 * Converted from backend snake_case to camelCase for frontend use
 */

export interface RequestStatusResponse {
  id: number
  name: string
  nameEn: string
  nameAr: string
  description?: string | null
  color?: string | null
  readonly: boolean
  isActive: boolean
  countAsSolved: boolean
  visibleOnRequesterPage: boolean
  createdAt: string
  updatedAt: string
  createdBy?: string | null
  updatedBy?: string | null
}

export interface RequestStatusListResponse {
  statuses: RequestStatusResponse[]
  total: number
  activeCount: number
  inactiveCount: number
  readonlyCount: number
}

export interface RequestStatusCreate {
  name: string
  nameEn: string
  nameAr: string
  description?: string | null
  color?: string | null
  readonly?: boolean
  isActive?: boolean
  countAsSolved?: boolean
  visibleOnRequesterPage?: boolean
}

export interface RequestStatusUpdate {
  name?: string | null
  nameEn?: string | null
  nameAr?: string | null
  description?: string | null
  color?: string | null
  readonly?: boolean | null
  isActive?: boolean | null
  countAsSolved?: boolean | null
  visibleOnRequesterPage?: boolean | null
}

export interface BulkRequestStatusUpdate {
  statusIds: number[]
  isActive: boolean
}

export interface RequestStatusCountsResponse {
  total: number
  activeCount: number
  inactiveCount: number
  readonlyCount: number
}
