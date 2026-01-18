"use client";

import { Button } from "@/components/ui/button";
import { Edit, Trash2, Star } from "lucide-react";
import { useState } from "react";
import { EditVersionSheet } from "../edit-version-sheet";
import { setVersionAsLatest, deleteClientVersion, updateClientVersion, uploadInstaller } from "@/lib/api/client-versions";
import { toastSuccess, toastError, toastWarning } from "@/lib/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ClientVersion, ClientVersionUpdate } from "@/types/client-versions";

interface VersionActionsProps {
  version: ClientVersion;
  onUpdate: () => void;
  onVersionUpdated?: (updatedVersion: ClientVersion) => void;
  disabled?: boolean;
}

export function ClientVersionsActions({ version, onUpdate, onVersionUpdated, disabled = false }: VersionActionsProps) {
  const [editingVersion, setEditingVersion] = useState<ClientVersion | null>(null);
  const [deleteVersion, setDeleteVersion] = useState<ClientVersion | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [installerFile, setInstallerFile] = useState<File | null>(null);

  const handleEditVersion = () => {
    setEditingVersion(version);
    setInstallerFile(null);
  };

  const handleSetLatest = async () => {
    if (version.isLatest) return;

    setActionLoading(version.id);
    try {
      const updatedVersion = await setVersionAsLatest(version.id);

      // Notify parent component with the updated version
      if (onVersionUpdated) {
        onVersionUpdated(updatedVersion);
      }

      onUpdate();
      toastSuccess(`${version.versionString} is now the latest version.`);
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Failed to set as latest");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteVersion) return;

    setActionLoading(deleteVersion.id);
    try {
      await deleteClientVersion(deleteVersion.id, false); // Soft delete
      setDeleteVersion(null);
      onUpdate();
      toastSuccess(`${deleteVersion.versionString} has been deactivated.`);
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Failed to delete version");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSave = async (data: ClientVersionUpdate): Promise<void> => {
    if (!editingVersion) return;

    try {
      // Step 1: Update version metadata
      let updatedVersion = await updateClientVersion(editingVersion.id, data);

      // Step 2: Upload installer if file selected
      if (installerFile) {
        try {
          updatedVersion = await uploadInstaller(editingVersion.id, installerFile);
          toastSuccess(`Version ${editingVersion.versionString} updated with new installer.`);
        } catch (uploadError) {
          toastWarning(
            `Version updated, but installer upload failed: ${
              uploadError instanceof Error ? uploadError.message : "Unknown error"
            }`
          );
        }
      } else {
        toastSuccess(`Version ${editingVersion.versionString} has been updated.`);
      }

      // Notify parent component with the updated version
      if (onVersionUpdated) {
        onVersionUpdated(updatedVersion);
      }

      onUpdate();
      setEditingVersion(null);
      setInstallerFile(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        toastError(err.message || "Failed to update version");
      } else {
        toastError("Failed to update version");
      }
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Set as Latest Button */}
        {!version.isLatest && version.isActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={(e) => {
              e.stopPropagation();
              handleSetLatest();
            }}
            disabled={disabled || actionLoading === version.id}
            title="Set as latest"
          >
            <span className="sr-only">Set as Latest</span>
            <Star className="h-4 w-4 text-yellow-600" />
          </Button>
        )}

        {/* Edit Version Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={(e) => {
            e.stopPropagation();
            handleEditVersion();
          }}
          disabled={disabled || actionLoading === version.id}
        >
          <span className="sr-only">Edit Version</span>
          <Edit className="h-4 w-4 text-gray-600" />
        </Button>

        {/* Delete Version Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteVersion(version);
          }}
          disabled={disabled || actionLoading === version.id}
          title="Delete version"
        >
          <span className="sr-only">Delete Version</span>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {/* Edit Version Sheet */}
      {editingVersion && (
        <EditVersionSheet
          version={editingVersion}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setEditingVersion(null);
              setInstallerFile(null);
            }
          }}
          onSave={handleSave}
          onInstallerFileChange={setInstallerFile}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteVersion} onOpenChange={(open) => !open && setDeleteVersion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Version</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete version{" "}
              <span className="font-mono font-medium">{deleteVersion?.versionString}</span>?
              This action will soft-delete the version (mark as inactive).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
