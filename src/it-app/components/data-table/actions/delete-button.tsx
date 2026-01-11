"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { Trash2 } from "lucide-react";

interface DeleteButtonProps {
  selectedIds: number[] | string[];
  onDelete: (ids: number[] | string[]) => void;
  disabled?: boolean;
  itemName?: string;
}

export const DeleteButton: React.FC<DeleteButtonProps> = ({
  selectedIds,
  onDelete,
  disabled = false,
  itemName = "item",
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
    title: `Delete ${count} ${itemName}${count !== 1 ? "s" : ""}`,
    description: `Are you sure you want to delete ${count} ${itemName}${count !== 1 ? "s" : ""}? This action cannot be undone.`,
    confirmText: "Delete",
    cancelText: "Cancel",
    variant: "destructive",
  });

  const handleClick = () => {
    openDialog(() => onDelete(selectedIds));
  };

  const isDisabled = !hasSelection || disabled;

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={isDisabled}
        variant="outline"
        size="sm"
        title={`Delete selected ${itemName}s`}
        className="min-w-[90px]"
      >
        <Trash2 className="h-4 w-4" />
        Delete
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
