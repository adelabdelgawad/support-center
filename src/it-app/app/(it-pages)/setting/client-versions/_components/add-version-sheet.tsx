"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, File, X } from "lucide-react";
import { createClientVersion, uploadInstaller } from "@/lib/api/client-versions";

import type { ClientVersion } from "@/types/client-versions";

// Allowed file extensions for installer
const ALLOWED_EXTENSIONS = [".exe", ".msi"];
const MAX_FILE_SIZE_MB = 50;

interface AddVersionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (version: ClientVersion) => void;
  currentLatest?: string; // Current latest version for reference
}

/**
 * Parse a semantic version string into components.
 * Returns default values if invalid.
 */
function parseVersion(v: string | undefined): { major: number; minor: number; patch: number } {
  if (!v) return { major: 0, minor: 0, patch: 0 };
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return { major: 0, minor: 0, patch: 0 };
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

export function AddVersionSheet({
  open,
  onOpenChange,
  onSuccess,
  currentLatest,
}: AddVersionSheetProps) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEnforced, setIsEnforced] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState("");
  const [prerelease, setPrerelease] = useState<string>("none");
  // Installer file upload
  const [installerFile, setInstallerFile] = useState<File | null>(null);
  const [silentInstallArgs, setSilentInstallArgs] = useState("/qn /norestart");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse current version to initialize inputs
  const currentParsed = useMemo(() => parseVersion(currentLatest), [currentLatest]);

  // Version number inputs - initialize with incremented patch
  const [major, setMajor] = useState(currentParsed.major);
  const [minor, setMinor] = useState(currentParsed.minor);
  const [patch, setPatch] = useState(currentParsed.patch + 1);

  // Update inputs when currentLatest changes
  useEffect(() => {
    const parsed = parseVersion(currentLatest);
    setMajor(parsed.major);
    setMinor(parsed.minor);
    setPatch(parsed.patch + 1);
  }, [currentLatest]);

  // Compute the version string
  const versionString = prerelease === "none"
    ? `${major}.${minor}.${patch}`
    : `${major}.${minor}.${patch}-${prerelease}`;

  // Check if version is valid (greater than current)
  const isValidVersion = useMemo(() => {
    if (!currentLatest) return true; // First version, always valid

    const newVal = major * 1000000 + minor * 1000 + patch;
    const curVal = currentParsed.major * 1000000 + currentParsed.minor * 1000 + currentParsed.patch;
    return newVal > curVal;
  }, [major, minor, patch, currentLatest, currentParsed]);

  const resetForm = () => {
    const parsed = parseVersion(currentLatest);
    setMajor(parsed.major);
    setMinor(parsed.minor);
    setPatch(parsed.patch + 1);
    setPrerelease("none");
    setIsEnforced(false);
    setReleaseNotes("");
    setInstallerFile(null);
    setSilentInstallArgs("/qn /norestart");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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

    if (!isValidVersion) {
      toast.error(`Version ${versionString} must be greater than ${currentLatest}`);
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create the version
      const newVersion = await createClientVersion({
        versionString,
        isEnforced,
        releaseNotes: releaseNotes.trim() || null,
        releasedAt: new Date().toISOString(),
        silentInstallArgs: silentInstallArgs.trim() || null,
      });

      // Step 2: Upload installer if file selected
      let finalVersion = newVersion;
      if (installerFile) {
        setUploading(true);
        try {
          finalVersion = await uploadInstaller(newVersion.id, installerFile);
          toast.success(`Version ${versionString} created with installer.`);
        } catch (uploadError) {
          // Version was created but upload failed
          toast.warning(
            `Version ${versionString} created, but installer upload failed: ${
              uploadError instanceof Error ? uploadError.message : "Unknown error"
            }`
          );
        } finally {
          setUploading(false);
        }
      } else {
        toast.success(`Version ${versionString} is now the latest version.`);
      }

      resetForm();
      onSuccess(finalVersion);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create version"
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle number input changes
  const handleNumberChange = (
    setter: (v: number) => void,
    value: string
  ) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      setter(num);
    } else if (value === "") {
      setter(0);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add New Version</SheetTitle>
          <SheetDescription>
            Enter the version numbers. New versions are automatically set as
            latest.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Current Version Display */}
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current latest:</span>
              <Badge variant="secondary" className="font-mono">
                {currentLatest || "None"}
              </Badge>
            </div>
          </div>

          {/* Version Number Inputs */}
          <div className="space-y-3">
            <Label>Version Number</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Label htmlFor="major" className="text-xs text-muted-foreground mb-1 block">
                  Major
                </Label>
                <Input
                  id="major"
                  type="number"
                  min={0}
                  value={major}
                  onChange={(e) => handleNumberChange(setMajor, e.target.value)}
                  className="font-mono text-center"
                />
              </div>
              <span className="text-2xl text-muted-foreground mt-5">.</span>
              <div className="flex-1">
                <Label htmlFor="minor" className="text-xs text-muted-foreground mb-1 block">
                  Minor
                </Label>
                <Input
                  id="minor"
                  type="number"
                  min={0}
                  value={minor}
                  onChange={(e) => handleNumberChange(setMinor, e.target.value)}
                  className="font-mono text-center"
                />
              </div>
              <span className="text-2xl text-muted-foreground mt-5">.</span>
              <div className="flex-1">
                <Label htmlFor="patch" className="text-xs text-muted-foreground mb-1 block">
                  Patch
                </Label>
                <Input
                  id="patch"
                  type="number"
                  min={0}
                  value={patch}
                  onChange={(e) => handleNumberChange(setPatch, e.target.value)}
                  className="font-mono text-center"
                />
              </div>
              <span className="text-2xl text-muted-foreground mt-5">-</span>
              <div className="flex-1">
                <Label htmlFor="prerelease" className="text-xs text-muted-foreground mb-1 block">
                  Pre-release
                </Label>
                <Select value={prerelease} onValueChange={setPrerelease}>
                  <SelectTrigger id="prerelease" className="w-full font-mono">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="alpha">alpha</SelectItem>
                    <SelectItem value="beta">beta</SelectItem>
                    <SelectItem value="rc">rc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preview */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm">New version:</span>
              <Badge
                className={`font-mono ${
                  isValidVersion
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {versionString}
              </Badge>
            </div>

            {!isValidVersion && (
              <p className="text-xs text-red-500">
                New version must be greater than {currentLatest}
              </p>
            )}
          </div>

          {/* Enforcement Toggle */}
          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="isEnforced"
              checked={isEnforced}
              onCheckedChange={(c) => setIsEnforced(c === true)}
            />
            <Label htmlFor="isEnforced" className="text-sm">
              Enable enforcement
            </Label>
          </div>
          <p className="text-xs text-muted-foreground -mt-2 ml-6">
            When enabled, older versions will show &quot;update required&quot; status.
          </p>

          {/* Installer File Upload */}
          <div className="space-y-2">
            <Label>Installer File</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".exe,.msi"
              onChange={handleFileSelect}
              className="hidden"
              id="installer-file"
            />
            {installerFile ? (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{installerFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(installerFile.size)}
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
                Select Installer File
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Upload .exe or .msi installer (max {MAX_FILE_SIZE_MB}MB). Required for auto-update.
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

          {/* Release Notes */}
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

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading || uploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || uploading || !isValidVersion}>
              {uploading
                ? "Uploading installer..."
                : loading
                ? "Creating..."
                : `Create ${versionString}`}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
