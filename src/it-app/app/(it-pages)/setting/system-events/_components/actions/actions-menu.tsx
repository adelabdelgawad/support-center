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
import type { SystemEventResponse } from "@/types/system-events";
import EditSystemEventSheet from "../modal/edit-system-event-sheet";
import ViewSystemEventSheet from "../modal/view-system-event-sheet";
import { useSystemEventsActions } from "../../context/system-events-actions-context";

interface EventActionsProps {
  event: SystemEventResponse;
  onUpdate: () => void;
  onEventUpdated?: (updatedEvent: SystemEventResponse) => void;
  disabled?: boolean;
}

export function EventActions({
  event,
  onUpdate,
  onEventUpdated,
  disabled = false,
}: EventActionsProps) {
  const [editingEvent, setEditingEvent] = useState<SystemEventResponse | null>(null);
  const [viewingEvent, setViewingEvent] = useState<SystemEventResponse | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { handleDelete } = useSystemEventsActions();

  const handleDeleteClick = async () => {
    if (deletingId !== null) {
      await handleDelete(String(deletingId));
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
          <DropdownMenuItem onClick={() => setViewingEvent(event)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditingEvent(event)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-600"
            onClick={() => setDeletingId(event.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modals */}
      {editingEvent && (
        <EditSystemEventSheet
          event={editingEvent}
          onOpenChange={(open) => {
            if (!open) {
              setEditingEvent(null);
              onUpdate();
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
            Are you sure you want to delete this event? This action cannot be undone.
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
