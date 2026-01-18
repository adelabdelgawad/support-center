"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { toastSuccess, toastError, toastWarning } from "@/lib/toast";
import { AddVersionSheet } from "../add-version-sheet";
import { createClientVersion, uploadInstaller } from "@/lib/api/client-versions";
import { Plus } from "lucide-react";
import type { ClientVersion, ClientVersionCreate } from "@/types/client-versions";

interface AddVersionButtonProps {
  onAdd: () => void;
  addVersion?: (newVersion: ClientVersion) => Promise<void>;
}

export const AddVersionButton: React.FC<AddVersionButtonProps> = ({ onAdd, addVersion }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [installerFile, setInstallerFile] = useState<File | null>(null);

  const handleSave = async (data: ClientVersionCreate): Promise<void> => {
    try {
      // Step 1: Create the version
      const createdVersion = await createClientVersion(data);

      let finalVersion = createdVersion;

      // Step 2: Upload installer if file selected
      if (installerFile) {
        try {
          finalVersion = await uploadInstaller(createdVersion.id, installerFile);
          toastSuccess(`Version ${data.versionString} created with installer.`);
        } catch (uploadError) {
          // Version was created but upload failed
          toastWarning(
            `Version ${data.versionString} created, but installer upload failed: ${
              uploadError instanceof Error ? uploadError.message : "Unknown error"
            }`
          );
        }
      } else {
        toastSuccess(`Version ${data.versionString} is now the latest version.`);
      }

      // Use optimistic update if available, otherwise fallback to refetch
      if (addVersion && finalVersion && typeof finalVersion === 'object' && 'id' in finalVersion) {
        await addVersion(finalVersion as any);
      } else {
        onAdd();
      }

      setIsOpen(false);
      setInstallerFile(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        toastError(err.message || "Failed to create version");
      } else {
        toastError("Failed to create version");
      }
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="default"
        size="sm"
      >
        <Plus className="w-4 h-4 mr-1" />
        Add Version
      </Button>

      <AddVersionSheet
        open={isOpen}
        onOpenChange={setIsOpen}
        onSave={handleSave}
        onInstallerFileChange={setInstallerFile}
      />
    </>
  );
};
