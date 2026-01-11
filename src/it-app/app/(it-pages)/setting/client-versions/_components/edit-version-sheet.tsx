"use client";

import { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, File, X, Check } from "lucide-react";
import { updateClientVersion, uploadInstaller } from "@/lib/api/client-versions";
import type { ClientVersion } from "@/types/client-versions";

// Allowed file extensions for installer
const ALLOWED_EXTENSIONS = [".exe", ".msi"];
const MAX_FILE_SIZE_MB = 50;

interface EditVersionSheetProps {
  version: ClientVersion;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (version: ClientVersion) => void;
}

// Extract filename from installer URL or object key
function getInstallerFilename(version: ClientVersion): string | null {
  if (version.installerObjectKey) {
    // Extract from object key: "client-installers/123/filename.exe" -> "filename.exe"
    const parts = version.installerObjectKey.split("/");
    return parts[parts.length - 1] || null;
  }
  if (version.installerUrl) {
    // Check if it's a backend URL (ends with /download)
    if (version.installerUrl.includes("/installer/download")) {
      return null; // We don't know the filename from the URL alone
    }
    // Try to extract from URL path
    try {
      const url = new URL(version.installerUrl);
      const parts = url.pathname.split("/");
      return parts[parts.length - 1] || null;
    } catch {
      return null;
    }
  }
  return null;
}

export function EditVersionSheet({
  version,
  open,
  onOpenChange,
  onSuccess,
}: EditVersionSheetProps) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [isActive, setIsActive] = useState(version.isActive);
  const [releaseNotes, setReleaseNotes] = useState(version.releaseNotes || "");
  const [silentInstallArgs, setSilentInstallArgs] = useState(version.silentInstallArgs || "/qn /norestart");

  // Installer file upload
  const [installerFile, setInstallerFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Current installer filename
  const currentInstallerFilename = getInstallerFilename(version);
  const hasExistingInstaller = !!version.installerUrl;

  // Reset form when version changes
  useEffect(() => {
    setIsActive(version.isActive);
    setReleaseNotes(version.releaseNotes || "");
    setSilentInstallArgs(version.silentInstallArgs || "/qn /norestart");
    setInstallerFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [version]);

  // Validate file selection
  const validateFile = (file: File): string | null => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File size exceeds ${MAX_FILE_SIZE_MB}MB limit`;
    }
    return null;
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = validateFile(file);
    if (error) {
      toast.error(error);
      e.target.value = "";
      return;
    }

    setInstallerFile(file);
  };

  // Remove selected file
  const handleRemoveFile = () => {
    setInstallerFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    try {
      // Step 1: Update version metadata
      let updatedVersion = await updateClientVersion(version.id, {
        isActive,
        releaseNotes: releaseNotes.trim() || null,
        silentInstallArgs: silentInstallArgs.trim() || null,
      });

      // Step 2: Upload new installer if selected
      if (installerFile) {
        setUploading(true);
        try {
          updatedVersion = await uploadInstaller(version.id, installerFile);
          toast.success(`Version ${version.versionString} updated with new installer.`);
        } catch (uploadError) {
          toast.warning(
            `Version updated, but installer upload failed: ${
              uploadError instanceof Error ? uploadError.message : "Unknown error"
            }`
          );
        } finally {
          setUploading(false);
        }
      } else {
        toast.success(`Version ${version.versionString} has been updated.`);
      }

      onSuccess(updatedVersion);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update version"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit Version</SheetTitle>
          <SheetDescription>
            Update version settings. Use the table actions to toggle enforcement.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Read-only version info */}
          <div className="p-3 bg-muted rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version:</span>
              <Badge variant="secondary" className="font-mono">
                {version.versionString}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status:</span>
              <div className="flex gap-1">
                {version.isLatest && (
                  <Badge className="bg-green-500">Latest</Badge>
                )}
                {version.isEnforced && (
                  <Badge className="bg-red-500">Enforced</Badge>
                )}
                {!version.isActive && (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Created:</span>
              <span className="text-sm">
                {new Date(version.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="isActive"
              checked={isActive}
              onCheckedChange={(c) => setIsActive(c === true)}
            />
            <Label htmlFor="isActive" className="text-sm">
              Active in registry
            </Label>
          </div>
          <p className="text-xs text-muted-foreground -mt-2 ml-6">
            Inactive versions are hidden from clients but kept for records.
          </p>

          <div className="space-y-2">
            <Label htmlFor="releaseNotes">Release Notes</Label>
            <Textarea
              id="releaseNotes"
              placeholder="What's new in this version..."
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Installer File Upload */}
          <div className="space-y-2">
            <Label>Installer File</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".exe,.msi"
              onChange={handleFileSelect}
              className="hidden"
              id="edit-installer-file"
            />

            {/* Show current installer status */}
            {hasExistingInstaller && !installerFile && (
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    Installer uploaded
                  </p>
                  {currentInstallerFilename && (
                    <p className="text-xs text-green-600 dark:text-green-400 truncate">
                      {currentInstallerFilename}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Show selected file for upload */}
            {installerFile ? (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <File className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300 truncate">
                    {installerFile.name}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    {formatFileSize(installerFile.size)} - Will replace existing
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                  className="flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {hasExistingInstaller ? "Replace Installer" : "Upload Installer"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Upload .exe or .msi installer (max {MAX_FILE_SIZE_MB}MB).
            </p>
          </div>

          {/* Silent Install Args */}
          <div className="space-y-2">
            <Label htmlFor="silentInstallArgs">Silent Install Arguments</Label>
            <Input
              id="silentInstallArgs"
              placeholder="/qn /norestart"
              value={silentInstallArgs}
              onChange={(e) => setSilentInstallArgs(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Command-line arguments for msiexec silent installation.
            </p>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> Version string and ordering cannot be
              changed after creation. Use the table actions to toggle enforcement
              status.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading || uploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || uploading}>
              {uploading
                ? "Uploading installer..."
                : loading
                ? "Saving..."
                : "Save Changes"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
