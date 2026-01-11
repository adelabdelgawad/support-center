import { toast } from "sonner";

/**
 * Reusable toast notification utilities
 * Uses Sonner with consistent styling across the application
 */

/**
 * Success toast - Green styling
 * Use for successful operations like create, update, delete
 */
export function toastSuccess(message: string) {
  toast.success(message, {
    style: {
      background: "#10b981",
      color: "#ffffff",
      border: "none",
    },
  });
}

/**
 * Warning toast - Yellow/Amber styling
 * Use for warnings, info messages, or actions that need attention
 */
export function toastWarning(message: string) {
  toast.warning(message, {
    style: {
      background: "#f59e0b",
      color: "#ffffff",
      border: "none",
    },
  });
}

/**
 * Error toast - Red styling
 * Use for errors, failures, or critical issues
 */
export function toastError(message: string) {
  toast.error(message, {
    style: {
      background: "#ef4444",
      color: "#ffffff",
      border: "none",
    },
  });
}
