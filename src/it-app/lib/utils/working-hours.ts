/**
 * Working Hours Utilities
 *
 * Handles conversion, validation, and normalization of working hours data
 * including backward compatibility with legacy single-range format.
 */

import type {
  WorkingHours,
  WorkingHoursRange,
  LegacyWorkingHours,
  WorkingHoursDay,
} from '@/types/business-units'

/**
 * Migrates legacy working hours (single range per day) to new format (array of ranges)
 *
 * @param legacy - Legacy working hours object
 * @returns Normalized working hours with arrays
 */
export function migrateLegacyWorkingHours(
  legacy: LegacyWorkingHours | null | undefined
): WorkingHours | null {
  if (!legacy) return null

  const migrated: WorkingHours = {}
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

  for (const day of days) {
    const dayValue = legacy[day]

    if (dayValue && typeof dayValue === 'object' && 'from' in dayValue && 'to' in dayValue) {
      // Single range object -> convert to array
      migrated[day] = [{ from: dayValue.from, to: dayValue.to }]
    } else if (dayValue === null || dayValue === undefined) {
      // Explicitly off-shift -> empty array
      migrated[day] = []
    }
  }

  return migrated
}

/**
 * Normalizes working hours to ensure arrays
 * Handles both legacy and new formats
 *
 * @param hours - Working hours in any format
 * @returns Normalized working hours with arrays
 */
export function normalizeWorkingHours(
  hours: WorkingHours | LegacyWorkingHours | null | undefined
): WorkingHours | null {
  if (!hours) return null

  const normalized: WorkingHours = {}
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

  for (const day of days) {
    const dayValue = hours[day]

    if (Array.isArray(dayValue)) {
      // Already array format
      normalized[day] = dayValue
    } else if (dayValue && typeof dayValue === 'object' && 'from' in dayValue && 'to' in dayValue) {
      // Legacy single object -> convert to array
      normalized[day] = [{ from: dayValue.from, to: dayValue.to }]
    } else if (dayValue === null || dayValue === undefined) {
      // Off-shift
      normalized[day] = []
    } else {
      // Unknown format, treat as off-shift
      normalized[day] = []
    }
  }

  return normalized
}

/**
 * Validates a single time range
 *
 * @param range - Time range to validate
 * @returns Error message if invalid, null if valid
 */
export function validateTimeRange(range: WorkingHoursRange): string | null {
  if (!range.from || !range.to) {
    return 'Both start and end times are required'
  }

  const fromMinutes = timeToMinutes(range.from)
  const toMinutes = timeToMinutes(range.to)

  if (fromMinutes >= toMinutes) {
    return 'End time must be after start time'
  }

  const durationHours = (toMinutes - fromMinutes) / 60
  if (durationHours < 1) {
    return 'Each shift must be at least 1 hour'
  }

  return null
}

/**
 * Validates all ranges for a day, checking for overlaps
 *
 * @param ranges - Array of time ranges for a day
 * @returns Error message if invalid, null if valid
 */
export function validateDayRanges(ranges: WorkingHoursRange[]): string | null {
  if (ranges.length === 0) return null

  // Validate each range individually
  for (let i = 0; i < ranges.length; i++) {
    const error = validateTimeRange(ranges[i])
    if (error) return `Shift ${i + 1}: ${error}`
  }

  // Check for overlaps
  const sorted = [...ranges].sort((a, b) =>
    timeToMinutes(a.from) - timeToMinutes(b.from)
  )

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]
    const next = sorted[i + 1]

    const currentEnd = timeToMinutes(current.to)
    const nextStart = timeToMinutes(next.from)

    if (currentEnd > nextStart) {
      return `Shifts ${i + 1} and ${i + 2} overlap`
    }
  }

  return null
}

/**
 * Converts time string (HH:mm) to minutes since midnight
 *
 * @param time - Time string in HH:mm format
 * @returns Minutes since midnight
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Converts minutes since midnight to time string (HH:mm)
 *
 * @param minutes - Minutes since midnight
 * @returns Time string in HH:mm format
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Checks if a given time falls within any of the working hours ranges
 *
 * @param time - Time string in HH:mm format
 * @param ranges - Array of working hours ranges
 * @returns true if time is within working hours, false otherwise
 */
export function isTimeInWorkingHours(time: string, ranges: WorkingHoursRange[]): boolean {
  const timeMinutes = timeToMinutes(time)

  return ranges.some(range => {
    const fromMinutes = timeToMinutes(range.from)
    const toMinutes = timeToMinutes(range.to)
    return timeMinutes >= fromMinutes && timeMinutes < toMinutes
  })
}

/**
 * Gets the total working hours duration for a day
 *
 * @param ranges - Array of working hours ranges
 * @returns Total duration in hours
 */
export function getTotalWorkingHours(ranges: WorkingHoursRange[]): number {
  return ranges.reduce((total, range) => {
    const duration = (timeToMinutes(range.to) - timeToMinutes(range.from)) / 60
    return total + duration
  }, 0)
}

/**
 * Creates a default empty working hours object
 *
 * @returns Empty working hours object with all days as empty arrays
 */
export function createEmptyWorkingHours(): WorkingHours {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  }
}

/**
 * Creates a default business hours template (Mon-Fri 9-5)
 *
 * @returns Working hours object with standard business hours
 */
export function createDefaultWorkingHours(): WorkingHours {
  const weekdayHours: WorkingHoursRange[] = [{ from: '09:00', to: '17:00' }]

  return {
    monday: weekdayHours,
    tuesday: weekdayHours,
    wednesday: weekdayHours,
    thursday: weekdayHours,
    friday: weekdayHours,
    saturday: [],
    sunday: [],
  }
}
