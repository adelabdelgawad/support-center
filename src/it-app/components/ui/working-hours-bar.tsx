"use client"

import { WorkingHoursRange } from "@/types/business-units"
import { getTotalWorkingHours } from "@/lib/utils/working-hours"

interface WorkingHoursBarProps {
  ranges: WorkingHoursRange[]
  className?: string
}

/**
 * Visual hour bar component for displaying working hours
 * - Read-only representation of 24 hours
 * - Supports multiple time ranges (split shifts)
 * - Filled portions represent working hours
 * - Empty portions represent off-shift hours
 * - Mobile-first, responsive design
 */
export function WorkingHoursBar({ ranges, className = "" }: WorkingHoursBarProps) {
  if (!ranges || ranges.length === 0) {
    return (
      <div
        className={`h-6 w-full bg-muted/30 rounded-sm border border-muted ${className}`}
        aria-label="Off-shift - No working hours configured"
        role="img"
      >
        <div className="flex items-center justify-center h-full">
          <span className="text-xs text-muted-foreground">Off-shift</span>
        </div>
      </div>
    )
  }

  // Convert HH:mm to decimal hours (e.g., "09:30" -> 9.5)
  const timeToDecimal = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number)
    return hours + minutes / 60
  }

  // Format time for display (remove leading zero)
  const formatTime = (time: string): string => {
    const [hours, minutes] = time.split(':')
    const formattedHours = hours.startsWith('0') ? hours.substring(1) : hours
    return `${formattedHours}:${minutes}`
  }

  // Build aria label for all ranges
  const ariaLabel = ranges.length === 1
    ? `Working hours: ${formatTime(ranges[0].from)} to ${formatTime(ranges[0].to)}`
    : `Split shift: ${ranges.map(r => `${formatTime(r.from)}-${formatTime(r.to)}`).join(', ')}`

  const totalHours = getTotalWorkingHours(ranges)

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Visual bar */}
      <div
        className="relative h-6 w-full bg-muted/30 rounded-sm border border-muted overflow-hidden"
        aria-label={ariaLabel}
        role="img"
      >
        {/* Render each working hours range */}
        {ranges.map((range, index) => {
          const fromDecimal = timeToDecimal(range.from)
          const toDecimal = timeToDecimal(range.to)
          const startPercent = (fromDecimal / 24) * 100
          const widthPercent = ((toDecimal - fromDecimal) / 24) * 100

          return (
            <div
              key={index}
              className="absolute top-0 h-full bg-primary/20 border-x border-primary/30"
              style={{
                left: `${startPercent}%`,
                width: `${widthPercent}%`,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-primary/30" />
            </div>
          )
        })}

        {/* Hour markers (0, 6, 12, 18, 24) */}
        {[0, 6, 12, 18, 24].map((hour) => (
          <div
            key={hour}
            className="absolute top-0 h-full border-l border-muted-foreground/10 pointer-events-none"
            style={{ left: `${(hour / 24) * 100}%` }}
          />
        ))}
      </div>

      {/* Time labels */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          {ranges.map((r, i) => (
            <span key={i} className="mr-2">
              {formatTime(r.from)}-{formatTime(r.to)}
            </span>
          ))}
        </span>
        <span className="text-[10px] opacity-60 whitespace-nowrap">
          {totalHours.toFixed(1)}h total
        </span>
      </div>
    </div>
  )
}
