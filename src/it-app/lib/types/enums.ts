/**
 * Shared enum types matching backend enums (model_enum.py)
 *
 * These enums replace the former database lookup tables:
 * - session_types table -> SessionType enum
 * - assign_types table -> AssignType enum
 *
 * Values are integers matching the original table IDs for backwards compatibility.
 */

/**
 * Session type for user sessions.
 * Used by: UserSession.session_type_id
 */
export const SessionType = {
  WEB: 1,
  DESKTOP: 2,
  MOBILE: 3,
} as const;

export type SessionTypeValue = typeof SessionType[keyof typeof SessionType];

/**
 * Assignment type for request-user assignments.
 * Used by: UserRequestAssign.assign_type_id
 */
export const AssignType = {
  TECHNICIAN: 1, // Primary technician assigned to resolve the request
  CC: 2,         // Carbon copy - receives updates but not responsible
} as const;

export type AssignTypeValue = typeof AssignType[keyof typeof AssignType];

/**
 * Upload status for screenshots and attachments.
 * Used by: Screenshot.upload_status, SubTaskAttachment.upload_status
 */
export const UploadStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type UploadStatusValue = typeof UploadStatus[keyof typeof UploadStatus];

/**
 * Trigger timing for system events.
 * Used by: SystemEvent.trigger_timing
 */
export const TriggerTiming = {
  IMMEDIATE: 'immediate',
  DELAYED: 'delayed',
} as const;

export type TriggerTimingValue = typeof TriggerTiming[keyof typeof TriggerTiming];
