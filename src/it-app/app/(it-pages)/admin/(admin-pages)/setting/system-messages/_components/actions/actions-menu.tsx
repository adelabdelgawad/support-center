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
import type { SystemMessageResponse } from "@/types/system-messages";
import { EditSystemMessageSheet } from "../modal";
import { ViewSystemMessageSheet } from "../modal";
import { useSystemMessagesActions } from "../../context/system-messages-actions-context";

interface MessageActionsProps {
  message: SystemMessageResponse;
  onUpdate: () => void;
  onMessageUpdated?: (updatedMessage: SystemMessageResponse) => void;
  disabled?: boolean;
}

export function MessageActions({
  message,
  onUpdate,
  onMessageUpdated,
  disabled = false,
}: MessageActionsProps) {
  const [editingMessage, setEditingMessage] = useState<SystemMessageResponse | null>(null);
  const [viewingMessage, setViewingMessage] = useState<SystemMessageResponse | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { handleDelete } = useSystemMessagesActions();

  const handleDeleteClick = async () => {
    if (deletingId !== null) {
      try {
        await handleDelete(String(deletingId));
        setDeletingId(null);
        onUpdate();
      } catch (error) {
        // Error already handled in context, just close dialog
        setDeletingId(null);
      }
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
          <DropdownMenuItem onClick={() => setViewingMessage(message)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditingMessage(message)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-600"
            onClick={() => setDeletingId(message.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modals */}
      {editingMessage && (
        <EditSystemMessageSheet
          message={editingMessage}
          onOpenChange={(open) => {
            if (!open) {
              setEditingMessage(null);
              onUpdate();
            }
          }}
        />
      )}

      {viewingMessage && (
        <ViewSystemMessageSheet
          message={viewingMessage}
          onOpenChange={(open) => !open && setViewingMessage(null)}
        />
      )}

      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete System Message</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this message template?
            <br />
            <br />
            <strong className="text-destructive">Warning:</strong> If this message is linked to any system events,
            the deletion will fail. Please remove all event associations first.
            <br />
            <br />
            This action cannot be undone.
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
