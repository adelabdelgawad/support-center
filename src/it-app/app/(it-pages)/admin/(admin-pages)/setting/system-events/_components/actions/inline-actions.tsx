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
import { Eye, Pencil, Trash2 } from "lucide-react";
import type { SystemEventResponse } from "@/types/system-events";
import { EditSystemEventSheet } from "../modal";
import { ViewSystemEventSheet } from "../modal";
import { useSystemEventsActions } from "../../context/system-events-actions-context";

interface InlineActionsProps {
  event: SystemEventResponse;
  onUpdate: () => void;
  onEventUpdated?: (updatedEvent: SystemEventResponse) => void;
  disabled?: boolean;
}

export function InlineActions({
  event,
  onUpdate,
  onEventUpdated,
  disabled = false,
}: InlineActionsProps) {
  const [editingEvent, setEditingEvent] = useState<SystemEventResponse | null>(null);
  const [viewingEvent, setViewingEvent] = useState<SystemEventResponse | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { handleDelete } = useSystemEventsActions();

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
          onClick={() => setViewingEvent(event)}
          disabled={disabled}
          title="View details"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setEditingEvent(event)}
          disabled={disabled}
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setDeletingId(String(event.id))}
          disabled={disabled}
          title="Delete"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Modals */}
      {editingEvent && (
        <EditSystemEventSheet
          event={editingEvent}
          onOpenChange={(open) => {
            if (!open) {
              setEditingEvent(null);
              // Don't call onUpdate() - EditSystemEventSheet already does optimistic update
            }
          }}
        />
      )}

      {viewingEvent && (
        <ViewSystemEventSheet
          event={viewingEvent}
          onOpenChange={(open) => !open && setViewingEvent(null)}
        />
      )}

      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete System Event</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this system event? This action cannot be undone.
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
