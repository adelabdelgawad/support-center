"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { Check } from "lucide-react";

interface EnableButtonProps {
  selectedIds: number[] | string[];
  onEnable: (ids: number[] | string[]) => void;
  disabled?: boolean;
}

export const EnableButton: React.FC<EnableButtonProps> = ({
  selectedIds,
  onEnable,
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
    title: "Enable Items",
    description: `Are you sure you want to enable ${count} item${count !== 1 ? "s" : ""}?`,
    confirmText: "Enable",
    cancelText: "Cancel",
    variant: "default",
  });

  const handleClick = () => {
    openDialog(() => onEnable(selectedIds));
  };

  const isDisabled = !hasSelection || disabled;

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={isDisabled}
        variant="outline"
        size="sm"
        title="Enable selected items"
        className="min-w-[85px]"
      >
        <Check className="h-4 w-4" />
        Enable
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
