"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import {
  Plus,
  RefreshCw,
  Star,
  Shield,
  ShieldOff,
  Trash2,
  Edit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { toast } from "sonner";
import type { ClientVersion, ClientVersionListResponse } from "@/types/client-versions";
import {
  getClientVersions,
  setVersionAsLatest,
  toggleVersionEnforcement,
  deleteClientVersion,
} from "@/lib/api/client-versions";
import { AddVersionSheet } from "./add-version-sheet";
import { EditVersionSheet } from "./edit-version-sheet";

interface ClientVersionsTableProps {
  initialData: ClientVersionListResponse | null;
}

const fetcher = async (): Promise<ClientVersionListResponse> => {
  return getClientVersions({ activeOnly: false });
};

export function ClientVersionsTable({ initialData }: ClientVersionsTableProps) {
  // Check if initial data is empty - if so, we need to fetch on mount
  const hasRealInitialData = initialData && initialData.versions && initialData.versions.length > 0;

  const { data, mutate, isLoading, isValidating } = useSWR<ClientVersionListResponse>(
    "/api/setting/client-versions",
    fetcher,
    {
      fallbackData: initialData ?? undefined,
      // Fetch on mount if no real initial data (e.g., came from empty fallback)
      revalidateOnMount: !hasRealInitialData,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: 2000,
    }
  );

  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [editVersion, setEditVersion] = useState<ClientVersion | null>(null);
  const [deleteVersion, setDeleteVersion] = useState<ClientVersion | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const versions = data?.versions ?? [];

  /**
   * Update versions with backend-returned data
   * Uses the returned record from API and triggers background revalidation for fresh counts
   */
  const updateVersionsFromBackend = useCallback(
    async (updatedVersions: ClientVersion[]) => {
      if (!data) return;

      const updatedMap = new Map(updatedVersions.map((v) => [v.id, v]));
      const updatedVersionsList = data.versions.map((version) =>
        updatedMap.has(version.id) ? updatedMap.get(version.id)! : version
      );

      // Keep existing counts - backend will provide fresh ones on revalidate
      const newData: ClientVersionListResponse = {
        ...data,
        versions: updatedVersionsList,
      };

      // Update cache with backend data and trigger background revalidation for counts
      await mutate(newData, { revalidate: true });
    },
    [mutate, data]
  );

  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);

  /**
   * Set version as latest - updates with backend response and revalidates for fresh data
   */
  const handleSetLatest = useCallback(async (version: ClientVersion) => {
    if (version.isLatest) return;

    setActionLoading(version.id);
    try {
      const updatedVersion = await setVersionAsLatest(version.id);

      // When setting latest, the previous latest also changes
      // Update both with returned data and revalidate for accurate counts
      if (data) {
        const updatedVersions = data.versions.map((v) => {
          if (v.id === updatedVersion.id) return updatedVersion;
          if (v.isLatest && v.platform === updatedVersion.platform) {
            return { ...v, isLatest: false };
          }
          return v;
        });

        const newData: ClientVersionListResponse = {
          ...data,
          versions: updatedVersions,
        };
        // Revalidate to get accurate counts from backend
        await mutate(newData, { revalidate: true });
      }

      toast.success(`${version.versionString} is now the latest version.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to set latest");
      mutate(); // Revert on error
    } finally {
      setActionLoading(null);
    }
  }, [mutate, data]);

  const handleToggleEnforcement = useCallback(async (version: ClientVersion) => {
    setActionLoading(version.id);
    try {
      const updatedVersion = await toggleVersionEnforcement(version.id, !version.isEnforced);
      await updateVersionsFromBackend([updatedVersion]);
      toast.success(version.isEnforced ? "Enforcement disabled" : "Enforcement enabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to toggle enforcement");
      mutate(); // Revert on error
    } finally {
      setActionLoading(null);
    }
  }, [mutate, updateVersionsFromBackend]);

  /**
   * Delete version - since delete API doesn't return updated version,
   * revalidate to get fresh data from backend (no optimistic update)
   */
  const handleDelete = useCallback(async () => {
    if (!deleteVersion) return;

    setActionLoading(deleteVersion.id);
    try {
      await deleteClientVersion(deleteVersion.id, false); // Soft delete

      // Revalidate to get fresh data from backend (no optimistic update)
      await mutate();

      toast.success(`${deleteVersion.versionString} has been deactivated.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete version");
    } finally {
      setActionLoading(null);
      setDeleteVersion(null);
    }
  }, [deleteVersion, mutate]);

  /**
   * Handle new version created - uses backend response and revalidates for fresh counts
   */
  const handleVersionCreated = useCallback((newVersion: ClientVersion) => {
    setAddSheetOpen(false);

    if (data) {
      // New version is always latest, so unset previous latest
      const updatedVersions = data.versions.map((v) =>
        v.isLatest && v.platform === newVersion.platform
          ? { ...v, isLatest: false }
          : v
      );

      const newData: ClientVersionListResponse = {
        ...data,
        versions: [newVersion, ...updatedVersions],
        total: data.total + 1,
      };
      // Revalidate to get accurate counts from backend
      mutate(newData, { revalidate: true });
    } else {
      mutate();
    }
  }, [mutate, data]);

  /**
   * Handle version updated - uses backend response and revalidates for fresh counts
   */
  const handleVersionUpdated = useCallback((updatedVersion: ClientVersion) => {
    setEditVersion(null);

    // Update cache with fresh data from PUT response
    if (data) {
      const updatedVersionsList = data.versions.map((version) =>
        version.id === updatedVersion.id ? updatedVersion : version
      );

      const newData: ClientVersionListResponse = {
        ...data,
        versions: updatedVersionsList,
      };
      // Revalidate to get accurate counts from backend
      mutate(newData, { revalidate: true });
    }
  }, [mutate, data]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isValidating}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isValidating ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button size="sm" onClick={() => setAddSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Version
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <TooltipProvider>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">Version</TableHead>
                <TableHead className="text-center">Platform</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Release Notes</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    Loading versions...
                  </TableCell>
                </TableRow>
              ) : versions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No versions found. Add your first version to get started.
                  </TableCell>
                </TableRow>
              ) : (
                versions.map((version) => (
                  <TableRow
                    key={version.id}
                    className={!version.isActive ? "opacity-50" : ""}
                  >
                    <TableCell className="text-center font-mono font-medium">
                      {version.versionString}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{version.platform}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        {version.isLatest && (
                          <Badge className="bg-green-500 hover:bg-green-600">
                            <Star className="h-3 w-3 mr-1" />
                            Latest
                          </Badge>
                        )}
                        {version.isEnforced && (
                          <Badge className="bg-red-500 hover:bg-red-600">
                            <Shield className="h-3 w-3 mr-1" />
                            Enforced
                          </Badge>
                        )}
                        {!version.isActive && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground text-sm max-w-[200px]">
                      {version.releaseNotes ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="truncate block cursor-help">
                              {version.releaseNotes}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[300px]">
                            <p className="whitespace-pre-wrap">{version.releaseNotes}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground/50">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {!version.isLatest && version.isActive && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSetLatest(version)}
                            disabled={actionLoading === version.id}
                            title="Set as latest"
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleEnforcement(version)}
                          disabled={actionLoading === version.id}
                          title={version.isEnforced ? "Disable enforcement" : "Enable enforcement"}
                        >
                          {version.isEnforced ? (
                            <ShieldOff className="h-4 w-4" />
                          ) : (
                            <Shield className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditVersion(version)}
                          disabled={actionLoading === version.id}
                          title="Edit version"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteVersion(version)}
                          disabled={actionLoading === version.id}
                          title="Delete version"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
            )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

      {/* Add Version Sheet */}
      <AddVersionSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        onSuccess={handleVersionCreated}
        currentLatest={versions.find(v => v.isLatest)?.versionString}
      />

      {/* Edit Version Sheet */}
      {editVersion && (
        <EditVersionSheet
          version={editVersion}
          open={!!editVersion}
          onOpenChange={(open) => !open && setEditVersion(null)}
          onSuccess={handleVersionUpdated}
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
    </div>
  );
}
