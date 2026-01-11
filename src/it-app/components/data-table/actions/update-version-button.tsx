"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { ArrowUpCircle } from "lucide-react";

interface UpdateVersionButtonProps {
  selectedIds: string[];
  onUpdate: (ids: string[]) => void;
  disabled?: boolean;
  itemName?: string;
  targetVersion?: string | null;
}

export const UpdateVersionButton: React.FC<UpdateVersionButtonProps> = ({
  selectedIds,
  onUpdate,
  disabled = false,
  itemName = "session",
  targetVersion,
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
    title: `Push Update to ${count} ${itemName}${count !== 1 ? "s" : ""}`,
    description: targetVersion
      ? `This will send an update notification to ${count} desktop client${count !== 1 ? "s" : ""} to upgrade to version ${targetVersion}. The clients will be prompted to restart and update.`
      : `This will send an update notification to ${count} desktop client${count !== 1 ? "s" : ""} to upgrade to the latest version.`,
    confirmText: "Push Update",
    cancelText: "Cancel",
    variant: "default",
  });

  const handleClick = () => {
    openDialog(() => onUpdate(selectedIds));
  };

  const isDisabled = !hasSelection || disabled;

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={isDisabled}
        variant="outline"
        size="sm"
        title={`Push update to selected ${itemName}s`}
        className="min-w-[120px]"
      >
        <ArrowUpCircle className="h-4 w-4" />
        Update Version
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
