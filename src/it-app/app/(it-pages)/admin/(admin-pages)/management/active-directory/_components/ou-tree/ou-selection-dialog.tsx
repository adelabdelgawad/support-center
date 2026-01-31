"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OUTreeView } from "./ou-tree-view";
import { updateDesiredOUs } from "@/lib/api/active-directory-config";

interface OUSelectionDialogProps {
  open: boolean;
  configId: string;
  configName: string;
  currentSelection: string[];
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function OUSelectionDialog({
  open,
  configId,
  configName,
  currentSelection,
  onOpenChange,
  onSuccess,
}: OUSelectionDialogProps) {
  const [selectedOUs, setSelectedOUs] = useState<{ ouName: string; ouDn: string; alreadyExists: boolean }[]>(
    currentSelection.map((name) => ({ ouName: name, ouDn: "", alreadyExists: false }))
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);

      await updateDesiredOUs(configId, selectedOUs.map((ou) => ou.ouName));

      toast.success("OU selection updated successfully");
      onOpenChange(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error("Failed to update OU selection:", error);
      toast.error(error.message || "Failed to update OU selection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Organizational Units</DialogTitle>
          <DialogDescription>
            Choose which OUs to synchronize for <strong>{configName}</strong>.
            Selecting a parent automatically selects all children. You can
            manually uncheck individual children if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden py-4">
          <OUTreeView
            configId={configId}
            initialSelected={currentSelection}
            onSelectionChange={setSelectedOUs}
          />
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selectedOUs.length === 0 ? (
              <span>No OUs selected</span>
            ) : (
              <span>
                {selectedOUs.length} OU{selectedOUs.length !== 1 ? "s" : ""}{" "}
                selected
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
