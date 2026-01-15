/**
 * Confirmation Dialog Component
 *
 * Reusable confirmation dialog with bilingual support
 * Now powered by solid-ui AlertDialog (Kobalte-based)
 *
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui";
import { Button } from "@/components/ui";

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
  const handleConfirm = () => {
    props.onConfirm();
    props.onClose();
  };

  return (
    <AlertDialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
      <AlertDialogContent class="bg-card">
        <div class="space-y-4">
          {/* Title */}
          <AlertDialogTitle class="text-foreground">
            {props.title}
          </AlertDialogTitle>

          {/* Message */}
          <AlertDialogDescription>
            {props.message}
          </AlertDialogDescription>

          {/* Custom content (e.g., list of changes) */}
          <Show when={props.children}>
            <div class="pt-2">{props.children}</div>
          </Show>
        </div>

        {/* Footer with action buttons */}
        <div class="flex items-center justify-end gap-3 pt-4">
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
      </AlertDialogContent>
    </AlertDialog>
  );
}
