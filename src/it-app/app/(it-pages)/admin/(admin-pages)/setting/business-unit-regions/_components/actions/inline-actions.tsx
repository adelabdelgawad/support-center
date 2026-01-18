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
import { Eye, Pencil, Trash2, Building2 } from "lucide-react";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import { EditRegionSheet } from "../modal";
import { ViewRegionSheet } from "../modal";
import { ManageBusinessUnitsSheet } from "../modal";
import { useRegionsActions } from "../../context/regions-actions-context";

interface InlineActionsProps {
  region: BusinessUnitRegionResponse;
  onUpdate: () => void;
  onRegionUpdated?: (updatedRegion: BusinessUnitRegionResponse) => void;
  disabled?: boolean;
}

export function InlineActions({
  region,
  onUpdate,
  onRegionUpdated,
  disabled = false,
}: InlineActionsProps) {
  const [editingRegion, setEditingRegion] = useState<BusinessUnitRegionResponse | null>(null);
  const [viewingRegion, setViewingRegion] = useState<BusinessUnitRegionResponse | null>(null);
  const [managingBusinessUnits, setManagingBusinessUnits] = useState<BusinessUnitRegionResponse | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { handleDelete } = useRegionsActions();

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
          onClick={() => setViewingRegion(region)}
          disabled={disabled}
          title="View details"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setManagingBusinessUnits(region)}
          disabled={disabled}
          title="Manage business units"
        >
          <Building2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setEditingRegion(region)}
          disabled={disabled}
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setDeletingId(region.id)}
          disabled={disabled}
          title="Delete"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Modals */}
      {editingRegion && (
        <EditRegionSheet
          region={editingRegion}
          onOpenChange={(open) => {
            if (!open) {
              setEditingRegion(null);
              // Don't call onUpdate() - EditRegionSheet already does optimistic update
            }
          }}
        />
      )}

      {viewingRegion && (
        <ViewRegionSheet
          region={viewingRegion}
          onOpenChange={(open) => !open && setViewingRegion(null)}
        />
      )}

      {managingBusinessUnits && (
        <ManageBusinessUnitsSheet
          open={managingBusinessUnits !== null}
          onOpenChange={(open) => !open && setManagingBusinessUnits(null)}
          region={managingBusinessUnits}
          onSuccess={onUpdate}
        />
      )}

      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Business Unit Region</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this region? This action cannot be undone.
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
