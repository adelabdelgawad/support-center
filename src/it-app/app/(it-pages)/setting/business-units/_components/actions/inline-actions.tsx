"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, Pencil, Trash2, Clock } from "lucide-react";
import type { BusinessUnitResponse } from "@/types/business-units";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import EditBusinessUnitSheet from "../modal/edit-business-unit-sheet";
import ViewBusinessUnitSheet from "../modal/view-business-unit-sheet";
import WorkingHoursSheet from "../modal/working-hours-sheet";
import { useBusinessUnitsActions } from "../../context/business-units-actions-context";

interface InlineActionsProps {
  businessUnit: BusinessUnitResponse;
  regions: BusinessUnitRegionResponse[];
  onUpdate: () => void;
  onBusinessUnitUpdated?: (updatedUnit: BusinessUnitResponse) => void;
  disabled?: boolean;
}

export function InlineActions({
  businessUnit,
  regions,
  onUpdate,
  onBusinessUnitUpdated,
  disabled = false,
}: InlineActionsProps) {
  const [editingUnit, setEditingUnit] = useState<BusinessUnitResponse | null>(null);
  const [viewingUnit, setViewingUnit] = useState<BusinessUnitResponse | null>(null);
  const [workingHoursUnit, setWorkingHoursUnit] = useState<BusinessUnitResponse | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { handleDelete } = useBusinessUnitsActions();

  const handleDeleteClick = async () => {
    if (deletingId !== null) {
      await handleDelete(deletingId);
      setDeletingId(null);
      // Don't call onUpdate() - handleDelete already does refetch
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setViewingUnit(businessUnit)}
          disabled={disabled}
          title="View details"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setEditingUnit(businessUnit)}
          disabled={disabled}
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setWorkingHoursUnit(businessUnit)}
          disabled={disabled}
          title="Working Hours"
          className="text-primary hover:text-primary/90"
        >
          <Clock className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setDeletingId(businessUnit.id)}
          disabled={disabled}
          title="Delete"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Modals */}
      {editingUnit && (
        <EditBusinessUnitSheet
          unit={editingUnit}
          regions={regions}
          onOpenChange={(open) => {
            if (!open) {
              setEditingUnit(null);
              // Don't call onUpdate() - EditBusinessUnitSheet already does optimistic update
            }
          }}
        />
      )}

      {viewingUnit && (
        <ViewBusinessUnitSheet
          unit={viewingUnit}
          regions={regions}
          onOpenChange={(open) => !open && setViewingUnit(null)}
        />
      )}

      {workingHoursUnit && (
        <WorkingHoursSheet
          unit={workingHoursUnit}
          onOpenChange={(open) => !open && setWorkingHoursUnit(null)}
        />
      )}

      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Business Unit</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this business unit? This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteClick} className="bg-red-600">
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
