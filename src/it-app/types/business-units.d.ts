/**
 * Business Units type definitions
 * Converted from backend snake_case to camelCase for frontend use
 */

/**
 * Working hours for a single time range
 */
export interface WorkingHoursRange {
  from: string // HH:MM format (e.g., "09:00")
  to: string   // HH:MM format (e.g., "17:00")
}

/**
 * Legacy: Single time range per day (for backward compatibility)
 * @deprecated Use WorkingHoursRange[] instead
 */
export interface WorkingHoursDay {
  from: string
  to: string
}

/**
 * Working hours schedule (week-based)
 * Each day contains an array of time ranges to support split shifts
 * Examples:
 * - Single shift: monday: [{ from: "09:00", to: "17:00" }]
 * - Split shift: monday: [{ from: "09:00", to: "12:00" }, { from: "14:00", to: "18:00" }]
 * - Off-shift: monday: [] or undefined
 */
export interface WorkingHours {
  monday?: WorkingHoursRange[]
  tuesday?: WorkingHoursRange[]
  wednesday?: WorkingHoursRange[]
  thursday?: WorkingHoursRange[]
  friday?: WorkingHoursRange[]
  saturday?: WorkingHoursRange[]
  sunday?: WorkingHoursRange[]
}

/**
 * Legacy working hours format (single range per day)
 * Used for backward compatibility during migration
 */
export interface LegacyWorkingHours {
  monday?: WorkingHoursDay | null
  tuesday?: WorkingHoursDay | null
  wednesday?: WorkingHoursDay | null
  thursday?: WorkingHoursDay | null
  friday?: WorkingHoursDay | null
  saturday?: WorkingHoursDay | null
  sunday?: WorkingHoursDay | null
}

export interface BusinessUnitResponse {
  id: number
  name: string
  description?: string | null
  network?: string | null
  businessUnitRegionId?: number | null
  isActive: boolean
  isDeleted: boolean
  createdAt: string
  updatedAt: string
  createdBy?: string | null
  updatedBy?: string | null

  // Out-of-shift WhatsApp escalation fields
  workingHours?: WorkingHours | null
  whatsappGroupName?: string | null
  whatsappGroupId?: string | null
  whatsappOutshiftIntervalMinutes?: number
}

export interface BusinessUnitListResponse {
  businessUnits: BusinessUnitResponse[]
  total: number
  activeCount: number
  inactiveCount: number
}

export interface BusinessUnitCreate {
  name: string
  description?: string | null
  network?: string | null
  businessUnitRegionId?: number | null
  workingHours?: WorkingHours | null
  whatsappGroupName?: string | null
  whatsappGroupId?: string | null
  whatsappOutshiftIntervalMinutes?: number
}

export interface BusinessUnitUpdate {
  name?: string | null
  description?: string | null
  network?: string | null
  businessUnitRegionId?: number | null
  workingHours?: WorkingHours | null
  whatsappGroupName?: string | null
  whatsappGroupId?: string | null
  whatsappOutshiftIntervalMinutes?: number
}

export interface BulkBusinessUnitStatusUpdate {
  businessUnitIds: number[]
  isActive: boolean
}

export interface BusinessUnitCountsResponse {
  total: number
  activeCount: number
  inactiveCount: number
}
