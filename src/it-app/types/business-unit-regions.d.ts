/**
 * Business Unit Regions type definitions
 * Converted from backend snake_case to camelCase for frontend use
 */

export interface BusinessUnitRegionResponse {
  id: number
  name: string
  description?: string | null
  isActive: boolean
  isDeleted: boolean
  createdAt: string
  updatedAt: string
  createdBy?: string | null
  updatedBy?: string | null
}

export interface BusinessUnitRegionListResponse {
  regions: BusinessUnitRegionResponse[]
  total: number
  activeCount: number
  inactiveCount: number
}

export interface BusinessUnitRegionCreate {
  name: string
  description?: string | null
}

export interface BusinessUnitRegionUpdate {
  name?: string | null
  description?: string | null
}

export interface BulkBusinessUnitRegionStatusUpdate {
  regionIds: number[]
  isActive: boolean
}

export interface BusinessUnitRegionCountsResponse {
  total: number
  activeCount: number
  inactiveCount: number
}
