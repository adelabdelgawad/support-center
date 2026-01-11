/**
 * Confirmation Dialog Component
 *
 * Reusable confirmation dialog with bilingual support
 * Supports:
 * - Custom title, message, and button text
 * - Optional custom content (e.g., list of changes)
 * - Variant styling (default/destructive)
 * - Keyboard support (Escape to close)
 * - Backdrop click to close
 *
 * Usage:
 * <ConfirmationDialog
 *   isOpen={showDialog()}
 *   onClose={() => setShowDialog(false)}
 *   onConfirm={handleConfirm}
 *   title={t("confirm.saveTitle")}
 *   message={t("confirm.saveMessage")}
 *   confirmText={t("confirm.save")}
 *   cancelText={t("settings.cancel")}
 * />
 */

import { Show, type JSX } from "solid-js";
import { Button } from "@/components/ui/button";
import { X } from "lucide-solid";

interface ConfirmationDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog should close */
  onClose: () => void;
  /** Callback when user confirms */
  onConfirm: () => void;
  /** Dialog title */
  title: string;
  /** Dialog message/description */
  message: string;
  /** Confirm button text */
  confirmText: string;
  /** Cancel button text */
  cancelText: string;
  /** Button variant for confirm button */
  variant?: "default" | "destructive";
  /** Optional custom content (e.g., list of changes) */
  children?: JSX.Element;
}

export function ConfirmationDialog(props: ConfirmationDialogProps) {
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      props.onClose();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      props.onClose();
    }
  };

  const handleConfirm = () => {
    props.onConfirm();
    props.onClose();
  };

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
      >
        <div class="bg-card rounded-lg shadow-xl w-full max-w-md mx-4 animate-zoom-in">
          {/* Header */}
          <div class="flex items-center justify-between p-6 border-b border-border">
            <h2 class="text-lg font-semibold text-foreground">
              {props.title}
            </h2>
            <button
              onClick={props.onClose}
              class="p-1 rounded-lg hover:bg-secondary transition-colors"
              aria-label="Close dialog"
            >
              <X class="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div class="p-6 space-y-4">
            <p class="text-sm text-muted-foreground">
              {props.message}
            </p>

            {/* Custom content (e.g., list of changes) */}
            <Show when={props.children}>
              <div class="pt-2">{props.children}</div>
            </Show>
          </div>

          {/* Footer */}
          <div class="flex items-center justify-end gap-3 p-6 border-t border-border bg-secondary/30 rounded-b-lg">
            <Button
              onClick={props.onClose}
              variant="outline"
              class="min-w-[100px]"
            >
              {props.cancelText}
            </Button>
            <Button
              onClick={handleConfirm}
              variant={props.variant || "default"}
              class="min-w-[100px]"
            >
              {props.confirmText}
            </Button>
          </div>
        </div>
      </div>

      {/* Animation styles */}
      <style>
        {`
          @keyframes fade-in {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes zoom-in {
            from {
              opacity: 0;
              transform: scale(0.95);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }

          .animate-fade-in {
            animation: fade-in 0.2s ease-out;
          }

          .animate-zoom-in {
            animation: zoom-in 0.2s ease-out;
          }
        `}
      </style>
    </Show>
  );
}
