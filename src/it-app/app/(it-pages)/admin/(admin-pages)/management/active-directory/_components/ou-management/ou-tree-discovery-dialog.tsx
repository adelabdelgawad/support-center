"use client";

import { useState, useMemo, useCallback } from "react";
import { Settings, Loader2, Plus, Minus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { OUTreeView } from "../ou-tree/ou-tree-view";
import { syncOrganizationalUnits } from "@/lib/actions/organizational-units.actions";
import { api } from "@/lib/fetch/client";

export function OUTreeDiscoveryDialog() {
  const [open, setOpen] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [configName, setConfigName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedOUs, setSelectedOUs] = useState<
    { ouName: string; ouDn: string; alreadyExists: boolean }[]
  >([]);
  // Map of dn -> ouName for initially existing OUs
  const [initialOUMap, setInitialOUMap] = useState<Map<string, string>>(
    new Map()
  );

  const handleInitialLoad = useCallback((ouMap: Map<string, string>) => {
    setInitialOUMap(ouMap);
  }, []);

  const handleSelectionChange = useCallback(
    (ous: { ouName: string; ouDn: string; alreadyExists: boolean }[]) => {
      setSelectedOUs(ous);
    },
    []
  );

  // Compute diff between current selection and initial state
  const namedDiff = useMemo(() => {
    const currentDns = new Set(selectedOUs.map((ou) => ou.ouDn));

    // Added = selected OUs that weren't in initial set
    const added = selectedOUs.filter((ou) => !initialOUMap.has(ou.ouDn));

    // Removed = initial OUs whose DN is no longer selected
    const removed: string[] = [];
    for (const [dn, name] of initialOUMap) {
      if (!currentDns.has(dn)) {
        removed.push(name);
      }
    }

    return {
      added: added.map((ou) => ou.ouName),
      addedFull: added,
      removed,
    };
  }, [selectedOUs, initialOUMap]);

  const hasDiff = namedDiff.added.length > 0 || namedDiff.removed.length > 0;

  const handleOpen = async () => {
    setLoading(true);
    try {
      const config = await api.get<any>(
        "/api/management/active-directory-configs/active"
      );

      if (!config) {
        toast.error(
          "No active AD configuration found. Please configure and activate an Active Directory server first."
        );
        setLoading(false);
        return;
      }

      setConfigId(config.id);
      setConfigName(config.name);
      setOpen(true);
    } catch (error: any) {
      console.error("Error loading AD config:", error);
      toast.error(error.message || "Failed to load AD configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClick = () => {
    if (!hasDiff) return;
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    setConfirmOpen(false);
    setSaving(true);
    try {
      const result = await syncOrganizationalUnits({
        added: namedDiff.addedFull.map((ou) => ({
          ouName: ou.ouName,
          ouDn: ou.ouDn,
        })),
        removed: namedDiff.removed,
      });

      const messages: string[] = [];
      if (result.createdCount > 0)
        messages.push(`${result.createdCount} added`);
      if (result.deletedCount > 0)
        messages.push(`${result.deletedCount} removed`);

      toast.success(
        `OU sync complete: ${messages.join(", ") || "no changes"}`
      );
      setOpen(false);
      setSelectedOUs([]);
      setInitialOUMap(new Map());
      window.location.reload();
    } catch (error: any) {
      toast.error(error.message || "Failed to sync OUs");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpen}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Settings className="h-4 w-4 mr-2" />
                Manage AD OUs
              </>
            )}
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Organizational Units</DialogTitle>
            <DialogDescription>
              Choose which OUs to synchronize from{" "}
              <strong>{configName}</strong>. Selecting a parent automatically
              selects all children. You can manually uncheck individual
              children if needed.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden py-4">
            {configId && (
              <OUTreeView
                configId={configId}
                initialSelected={[]}
                onSelectionChange={handleSelectionChange}
                onInitialLoad={handleInitialLoad}
              />
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <div className="text-sm text-muted-foreground flex gap-2">
              {!hasDiff ? (
                <span>No changes</span>
              ) : (
                <>
                  {namedDiff.added.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-sm text-green-700 bg-green-100"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {namedDiff.added.length} to add
                    </Badge>
                  )}
                  {namedDiff.removed.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-sm text-red-700 bg-red-100"
                    >
                      <Minus className="h-3 w-3 mr-1" />
                      {namedDiff.removed.length} to remove
                    </Badge>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveClick}
                disabled={saving || !hasDiff}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm OU Changes</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>The following changes will be applied:</p>

                {namedDiff.added.length > 0 && (
                  <div>
                    <p className="font-medium text-green-700">
                      Adding {namedDiff.added.length} OU
                      {namedDiff.added.length !== 1 ? "s" : ""}:
                    </p>
                    <ul className="list-disc list-inside text-sm mt-1">
                      {namedDiff.added.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {namedDiff.removed.length > 0 && (
                  <div>
                    <p className="font-medium text-red-700">
                      Removing {namedDiff.removed.length} OU
                      {namedDiff.removed.length !== 1 ? "s" : ""}:
                    </p>
                    <ul className="list-disc list-inside text-sm mt-1">
                      {namedDiff.removed.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSave}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
