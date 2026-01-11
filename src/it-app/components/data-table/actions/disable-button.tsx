"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { Ban } from "lucide-react";

interface DisableButtonProps {
  selectedIds: number[] | string[];
  onDisable: (ids: number[] | string[]) => void;
  disabled?: boolean;
}

export const DisableButton: React.FC<DisableButtonProps> = ({
  selectedIds,
  onDisable,
  disabled = false,
}) => {
  const hasSelection = selectedIds.length > 0;
  const count = selectedIds.length;

  const {
    isOpen,
    _isLoading,
    openDialog,
    closeDialog,
    handleConfirm,
    dialogProps,
  } = useConfirmationDialog({
    title: "Disable Items",
    description: `Are you sure you want to disable ${count} item${count !== 1 ? "s" : ""}?`,
    confirmText: "Disable",
    cancelText: "Cancel",
    variant: "destructive",
  });

  const handleClick = () => {
    openDialog(() => onDisable(selectedIds));
  };

  const isDisabled = !hasSelection || disabled;

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={isDisabled}
        variant="outline"
        size="sm"
        title="Disable selected items"
        className="min-w-[90px]"
      >
        <Ban className="h-4 w-4" />
        Disable
      </Button>

      <ConfirmationDialog
        open={isOpen}
        onOpenChange={closeDialog}
        onConfirm={handleConfirm}
        _isLoading={_isLoading}
        {...dialogProps}
      />
    </>
  );
};
