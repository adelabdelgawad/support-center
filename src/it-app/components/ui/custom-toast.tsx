// components/ui/custom-toast.tsx
import { toast as sonnerToast } from "sonner";

export const toast = {
  ...sonnerToast,
  success: (message: string, options = {}) => {
    return sonnerToast.success(message, {
      ...options,
      className: "success-toast",
      style: {
        backgroundColor: 'oklch(0.65 0.2 145)', // Green hue (around 145 degrees)
        color: 'var(--color-background)',
        border: '1px solid var(--color-border)'
      }
    });
  },
  error: (message: string, options = {}) => {
    return sonnerToast.error(message, {
      ...options,
      className: "error-toast",
      style: {
        backgroundColor: 'var(--color-destructive)',
        color: 'var(--color-background)',
        border: '1px solid var(--color-border)'
      }
    });
  }
};
