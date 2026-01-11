"use client";

import { Switch } from "@/components/ui/switch";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface StatusSwitchProps {
  checked: boolean;
  onToggle: () => Promise<void>;
  title: string;
  description: string;
  size?: "sm" | "default";
  disabled?: boolean;
}

export function StatusSwitch({
  checked,
  onToggle,
  title,
  description,
  size = "sm",
  disabled = false,
}: StatusSwitchProps) {
  const [_isLoading, setIsLoading] = useState(false);

  const {
    isOpen: showConfirmDialog,
    _isLoading: confirmLoading,
    openDialog,
    closeDialog,
    handleConfirm,
    dialogProps,
  } = useConfirmationDialog({
    title,
    description,
    confirmText: "Confirm",
    cancelText: "Cancel",
    variant: checked ? "warning" : "default",
  });

  const handleToggle = async () => {
    // Show confirmation for both activation and deactivation
    openDialog(async () => {
      setIsLoading(true);
      try {
        await onToggle();
      } finally {
        setIsLoading(false);
      }
    });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Switch
          checked={checked}
          onCheckedChange={handleToggle}
          disabled={disabled || _isLoading || confirmLoading}
        />
        {_isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      <ConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={closeDialog}
        onConfirm={handleConfirm}
        _isLoading={confirmLoading}
        {...dialogProps}
      />
    </>
  );
}
