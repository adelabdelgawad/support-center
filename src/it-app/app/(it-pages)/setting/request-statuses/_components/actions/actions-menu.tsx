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
import type { RequestStatusResponse } from "@/types/request-statuses";
import EditStatusSheet from "../modal/edit-request-status-sheet";
import ViewStatusSheet from "../modal/view-request-status-sheet";
import { useRequestStatusesActions } from "../../context/request-statuses-actions-context";

interface StatusActionsProps {
  status: RequestStatusResponse;
  onUpdate: () => void;
  onStatusUpdated?: (updatedStatus: RequestStatusResponse) => void;
  disabled?: boolean;
}

export function StatusActions({
  status,
  onUpdate,
  onStatusUpdated,
  disabled = false,
}: StatusActionsProps) {
  const [editingStatus, setEditingStatus] = useState<RequestStatusResponse | null>(null);
  const [viewingStatus, setViewingStatus] = useState<RequestStatusResponse | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { handleDelete } = useRequestStatusesActions();

  const handleDeleteClick = async () => {
    if (deletingId !== null) {
      await handleDelete(deletingId.toString());
      setDeletingId(null);
      onUpdate();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={disabled || status.readonly}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setViewingStatus(status)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          {!status.readonly && (
            <>
              <DropdownMenuItem onClick={() => setEditingStatus(status)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => setDeletingId(status.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modals */}
      {editingStatus && (
        <EditStatusSheet
          status={editingStatus}
          onOpenChange={(open) => {
            if (!open) {
              setEditingStatus(null);
              onUpdate();
            }
          }}
        />
      )}

      {viewingStatus && (
        <ViewStatusSheet
          status={viewingStatus}
          onOpenChange={(open) => !open && setViewingStatus(null)}
        />
      )}

      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Request Status</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this status? This action cannot be undone.
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
