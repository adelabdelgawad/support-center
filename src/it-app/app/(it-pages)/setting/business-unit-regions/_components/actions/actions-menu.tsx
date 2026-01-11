"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, Eye, Pencil, Trash2 } from "lucide-react";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import EditRegionSheet from "../modal/edit-region-sheet";
import ViewRegionSheet from "../modal/view-region-sheet";
import { useRegionsActions } from "../../context/regions-actions-context";

interface RegionActionsProps {
  region: BusinessUnitRegionResponse;
  onUpdate: () => void;
  onRegionUpdated?: (updatedRegion: BusinessUnitRegionResponse) => void;
  disabled?: boolean;
}

export function RegionActions({
  region,
  onUpdate,
  onRegionUpdated,
  disabled = false,
}: RegionActionsProps) {
  const [editingRegion, setEditingRegion] = useState<BusinessUnitRegionResponse | null>(null);
  const [viewingRegion, setViewingRegion] = useState<BusinessUnitRegionResponse | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { handleDelete } = useRegionsActions();

  const handleDeleteClick = async () => {
    if (deletingId !== null) {
      await handleDelete(deletingId);
      setDeletingId(null);
      onUpdate();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={disabled}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setViewingRegion(region)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditingRegion(region)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-600"
            onClick={() => setDeletingId(region.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modals */}
      {editingRegion && (
        <EditRegionSheet
          region={editingRegion}
          onOpenChange={(open) => {
            if (!open) {
              setEditingRegion(null);
              onUpdate();
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

      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Region</AlertDialogTitle>
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
