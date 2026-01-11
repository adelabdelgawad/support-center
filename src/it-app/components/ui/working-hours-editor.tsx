"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { WorkingHoursBar } from "@/components/ui/working-hours-bar"
import { AlertCircle, Plus, X } from "lucide-react"
import type { WorkingHours, WorkingHoursRange } from "@/types/business-units"
import {
  normalizeWorkingHours,
  validateDayRanges,
  createEmptyWorkingHours,
} from "@/lib/utils/working-hours"

interface WorkingHoursEditorProps {
  value: WorkingHours | null | undefined
  onChange: (value: WorkingHours | null) => void
  disabled?: boolean
}

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const

const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
}

export function WorkingHoursEditor({
  value,
  onChange,
  disabled = false,
}: WorkingHoursEditorProps) {
  // Normalize incoming data (handles both legacy and new formats)
  const [hours, setHours] = useState<WorkingHours>(() =>
    normalizeWorkingHours(value) || createEmptyWorkingHours()
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const normalized = normalizeWorkingHours(value) || createEmptyWorkingHours()
    setHours(normalized)
  }, [value])

  /**
   * Toggles a day on/off
   */
  const handleDayToggle = (day: string, enabled: boolean) => {
    const newHours = { ...hours }
    const newErrors = { ...errors }

    if (enabled) {
      // Enable day with default shift (9-5)
      newHours[day as keyof WorkingHours] = [{ from: "09:00", to: "17:00" }]
      delete newErrors[day]
    } else {
      // Disable day (empty array)
      newHours[day as keyof WorkingHours] = []
      delete newErrors[day]
    }

    setHours(newHours)
    setErrors(newErrors)
    onChange(newHours)
  }

  /**
   * Adds a new shift to a day
   */
  const handleAddShift = (day: string) => {
    const newHours = { ...hours }
    const dayRanges = newHours[day as keyof WorkingHours] || []

    // Add new shift with default times
    const newShift: WorkingHoursRange = { from: "09:00", to: "17:00" }
    newHours[day as keyof WorkingHours] = [...dayRanges, newShift]

    setHours(newHours)
    onChange(newHours)
  }

  /**
   * Removes a shift from a day
   */
  const handleRemoveShift = (day: string, shiftIndex: number) => {
    const newHours = { ...hours }
    const newErrors = { ...errors }
    const dayRanges = newHours[day as keyof WorkingHours] || []

    // Remove the shift
    const updatedRanges = dayRanges.filter((_, index) => index !== shiftIndex)
    newHours[day as keyof WorkingHours] = updatedRanges

    // Re-validate after removal
    if (updatedRanges.length > 0) {
      const error = validateDayRanges(updatedRanges)
      if (error) {
        newErrors[day] = error
      } else {
        delete newErrors[day]
      }
    } else {
      delete newErrors[day]
    }

    setHours(newHours)
    setErrors(newErrors)
    onChange(newHours)
  }

  /**
   * Updates a specific shift's time
   */
  const handleTimeChange = (
    day: string,
    shiftIndex: number,
    field: "from" | "to",
    value: string
  ) => {
    const newHours = { ...hours }
    const dayRanges = [...(newHours[day as keyof WorkingHours] || [])]

    if (dayRanges[shiftIndex]) {
      dayRanges[shiftIndex] = {
        ...dayRanges[shiftIndex],
        [field]: value,
      }
      newHours[day as keyof WorkingHours] = dayRanges

      // Validate all ranges for this day
      const error = validateDayRanges(dayRanges)
      const newErrors = { ...errors }

      if (error) {
        newErrors[day] = error
      } else {
        delete newErrors[day]
      }

      setHours(newHours)
      setErrors(newErrors)
      onChange(newHours)
    }
  }

  const isDayEnabled = (day: string): boolean => {
    const dayRanges = hours[day as keyof WorkingHours]
    return dayRanges !== undefined && dayRanges.length > 0
  }

  const getDayRanges = (day: string): WorkingHoursRange[] => {
    return hours[day as keyof WorkingHours] || []
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="text-sm font-medium text-muted-foreground mb-4">
            Configure working hours for each day. Multiple shifts per day are supported (split shifts).
          </div>

          {DAYS.map((day) => {
            const enabled = isDayEnabled(day)
            const dayRanges = getDayRanges(day)
            const hasError = errors[day]

            return (
              <div
                key={day}
                className="pb-4 border-b last:border-0 space-y-3"
              >
                {/* Day Toggle - Mobile First */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={enabled}
                      onCheckedChange={(checked) =>
                        handleDayToggle(day, checked)
                      }
                      disabled={disabled}
                      aria-label={`Toggle ${DAY_LABELS[day]}`}
                    />
                    <Label
                      className={`capitalize font-medium ${
                        enabled ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {DAY_LABELS[day]}
                    </Label>
                    {!enabled && (
                      <span className="text-sm text-muted-foreground italic ml-2">
                        Off-shift
                      </span>
                    )}
                  </div>

                  {/* Add Shift Button */}
                  {enabled && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddShift(day)}
                      disabled={disabled || dayRanges.length >= 4}
                      className="shrink-0"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Shift
                    </Button>
                  )}
                </div>

                {/* Shifts - Stacked on Mobile */}
                {enabled && dayRanges.length > 0 && (
                  <div className="space-y-3 pl-0 sm:pl-11">
                    {dayRanges.map((range, shiftIndex) => (
                      <div key={shiftIndex} className="space-y-2">
                        <div className="flex items-center gap-2">
                          {/* Shift label */}
                          {dayRanges.length > 1 && (
                            <span className="text-xs font-medium text-muted-foreground min-w-[60px]">
                              Shift {shiftIndex + 1}
                            </span>
                          )}

                          {/* Time inputs */}
                          <div className="grid grid-cols-2 gap-3 flex-1">
                            <div className="flex flex-col gap-1.5">
                              <Label
                                htmlFor={`${day}-${shiftIndex}-from`}
                                className="text-xs text-muted-foreground"
                              >
                                From
                              </Label>
                              <Input
                                id={`${day}-${shiftIndex}-from`}
                                type="time"
                                value={range.from}
                                onChange={(e) =>
                                  handleTimeChange(day, shiftIndex, "from", e.target.value)
                                }
                                disabled={disabled}
                                className={hasError ? "border-red-500" : ""}
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <Label
                                htmlFor={`${day}-${shiftIndex}-to`}
                                className="text-xs text-muted-foreground"
                              >
                                To
                              </Label>
                              <Input
                                id={`${day}-${shiftIndex}-to`}
                                type="time"
                                value={range.to}
                                onChange={(e) =>
                                  handleTimeChange(day, shiftIndex, "to", e.target.value)
                                }
                                disabled={disabled}
                                className={hasError ? "border-red-500" : ""}
                              />
                            </div>
                          </div>

                          {/* Remove Shift Button */}
                          {dayRanges.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleRemoveShift(day, shiftIndex)}
                              disabled={disabled}
                              className="shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Remove this shift"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Visual Hour Bar */}
                    <WorkingHoursBar ranges={dayRanges} />

                    {/* Error Message */}
                    {hasError && (
                      <div className="flex items-center gap-2 text-sm text-red-600">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{hasError}</span>
                      </div>
                    )}

                    {/* Max shifts warning */}
                    {dayRanges.length >= 4 && (
                      <div className="text-xs text-muted-foreground italic">
                        Maximum 4 shifts per day
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
