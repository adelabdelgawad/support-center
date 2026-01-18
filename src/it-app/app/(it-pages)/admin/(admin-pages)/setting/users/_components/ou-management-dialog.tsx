"use client";

import { useState, useTransition, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
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
import { Switch } from "@/components/ui/switch";
import { toastSuccess, toastError } from "@/lib/toast";
import { Loader2, RefreshCw, Trash2, Settings, Plus, AlertTriangle } from "lucide-react";
import {
  type OrganizationalUnit,
  type DiscoverOUResponse,
  getOrganizationalUnits,
  toggleOUEnabled,
  deleteOrganizationalUnit,
  discoverOUsFromAD,
  createOrganizationalUnit,
} from "@/lib/actions/organizational-units.actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function OUManagementDialog() {
  const [open, setOpen] = useState(false);
  const [ous, setOus] = useState<OrganizationalUnit[]>([]);
  const [originalOUs, setOriginalOUs] = useState<OrganizationalUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredOUs, setDiscoveredOUs] = useState<DiscoverOUResponse[]>([]);
  const [showDiscoverSheet, setShowDiscoverSheet] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hasChanges, setHasChanges] = useState(false);
  const [pendingDiscoveryClose, setPendingDiscoveryClose] = useState(false);
  const [showDiscoveryCancelConfirm, setShowDiscoveryCancelConfirm] = useState(false);
  const [selectedOUsToAdd, setSelectedOUsToAdd] = useState<Set<string>>(new Set());

  const loadOUs = async () => {
    setLoading(true);
    try {
      const data = await getOrganizationalUnits();
      setOus(data.organizationalUnits);
      setOriginalOUs(JSON.parse(JSON.stringify(data.organizationalUnits))); // Deep copy
      setHasChanges(false);
    } catch (error) {
      toastError("Failed to load organizational units");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && hasChanges) {
      // User trying to close with unsaved changes
      setPendingClose(true);
      setShowCancelConfirm(true);
    } else {
      setOpen(newOpen);
      if (newOpen) {
        loadOUs();
      }
    }
  };

  const handleLocalToggle = (ouId: number) => {
    setOus((prev) =>
      prev.map((ou) =>
        ou.id === ouId ? { ...ou, isEnabled: !ou.isEnabled } : ou
      )
    );
    checkForChanges();
  };

  const handleDelete = async (ouId: number) => {
    startTransition(async () => {
      try {
        await deleteOrganizationalUnit(ouId);
        toastSuccess("OU removed successfully");
        await loadOUs();
        setDeleteConfirm(null);
      } catch (error) {
        toastError("Failed to delete OU");
        console.error(error);
      }
    });
  };

  const checkForChanges = () => {
    // Check if current state differs from original
    const changed = ous.some((ou) => {
      const original = originalOUs.find((o) => o.id === ou.id);
      return original && original.isEnabled !== ou.isEnabled;
    });
    setHasChanges(changed);
  };

  const handleSaveChanges = async () => {
    startTransition(async () => {
      try {
        // Find all changed OUs
        const changedOUs = ous.filter((ou) => {
          const original = originalOUs.find((o) => o.id === ou.id);
          return original && original.isEnabled !== ou.isEnabled;
        });

        // Apply changes in parallel
        await Promise.all(
          changedOUs.map((ou) =>
            toggleOUEnabled(ou.id, ou.isEnabled)
          )
        );

        toastSuccess(`Successfully updated ${changedOUs.length} OU(s)`);
        await loadOUs();
      } catch (error) {
        toastError("Failed to save changes");
        console.error(error);
      }
    });
  };

  const handleCancelChanges = () => {
    setOus(JSON.parse(JSON.stringify(originalOUs))); // Restore original state
    setHasChanges(false);
    setShowCancelConfirm(false);

    if (pendingClose) {
      setPendingClose(false);
      setOpen(false);
    }
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const discovered = await discoverOUsFromAD();
      setDiscoveredOUs(discovered);
      setShowDiscoverSheet(true);
    } catch (error) {
      toastError("Failed to discover OUs from Active Directory");
      console.error(error);
    } finally {
      setDiscovering(false);
    }
  };

  const handleToggleOUSelection = (ouName: string) => {
    setSelectedOUsToAdd((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(ouName)) {
        newSet.delete(ouName);
      } else {
        newSet.add(ouName);
      }
      return newSet;
    });
  };

  const handleSaveDiscoveredOUs = async () => {
    startTransition(async () => {
      try {
        const ousToAdd = discoveredOUs.filter((ou) => selectedOUsToAdd.has(ou.ouName));

        // Batch add all selected OUs
        await Promise.all(
          ousToAdd.map((ou) =>
            createOrganizationalUnit({
              ouName: ou.ouName,
              ouDn: ou.ouDn,
              isEnabled: true,
            })
          )
        );

        toastSuccess(`Successfully added ${ousToAdd.length} OU(s)`);

        // Reset state
        setSelectedOUsToAdd(new Set());
        await loadOUs();

        // Refresh discovered list
        const updated = await discoverOUsFromAD();
        setDiscoveredOUs(updated);

        setShowDiscoverSheet(false);
      } catch (error: any) {
        toastError(error.message || "Failed to add OUs");
        console.error(error);
      }
    });
  };

  const handleCancelDiscoveredOUs = () => {
    setSelectedOUsToAdd(new Set());
    setShowDiscoveryCancelConfirm(false);

    if (pendingDiscoveryClose) {
      setPendingDiscoveryClose(false);
      setShowDiscoverSheet(false);
    }
  };

  const handleDiscoverSheetOpenChange = (newOpen: boolean) => {
    if (!newOpen && selectedOUsToAdd.size > 0) {
      // User trying to close with pending additions
      setPendingDiscoveryClose(true);
      setShowDiscoveryCancelConfirm(true);
    } else {
      setShowDiscoverSheet(newOpen);
      if (!newOpen) {
        setSelectedOUsToAdd(new Set());
      }
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  // Check for changes whenever ous state updates
  useEffect(() => {
    checkForChanges();
  }, [ous]);

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Manage AD OUs
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[800px] sm:w-[900px] sm:max-w-[90vw] flex flex-col p-0">
          <div className="px-6 py-4 border-b">
            <SheetHeader>
              <SheetTitle>Active Directory Organizational Units</SheetTitle>
              <SheetDescription>
                Manage which OUs are synchronized from Active Directory. Only enabled OUs will be included in user sync.
              </SheetDescription>
            </SheetHeader>

            <div className="flex gap-2 mt-4">
              <Button
                onClick={loadOUs}
                disabled={loading || hasChanges}
                variant="outline"
                size="sm"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
              <Button
                onClick={handleDiscover}
                disabled={discovering || hasChanges}
                variant="default"
                size="sm"
              >
                {discovering ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Discover from AD
              </Button>
              {hasChanges && (
                <Badge variant="secondary" className="ml-auto">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Unsaved Changes
                </Badge>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OU Name</TableHead>
                  <TableHead>DN</TableHead>
                  <TableHead className="text-center">Enabled</TableHead>
                  <TableHead className="text-right">User Count</TableHead>
                  <TableHead>Last Synced</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ous.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No organizational units configured. Click "Discover from AD" to find available OUs.
                    </TableCell>
                  </TableRow>
                ) : (
                  ous.map((ou) => {
                    const original = originalOUs.find((o) => o.id === ou.id);
                    const isChanged = original && original.isEnabled !== ou.isEnabled;

                    return (
                      <TableRow key={ou.id} className={isChanged ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}>
                        <TableCell className="font-medium">
                          {ou.ouName}
                          {isChanged && (
                            <Badge variant="outline" className="ml-2 text-xs">Modified</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                          {ou.ouDn || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={ou.isEnabled}
                            onCheckedChange={() => handleLocalToggle(ou.id)}
                            disabled={isPending || loading}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={ou.userCount > 0 ? "default" : "secondary"}>
                            {ou.userCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(ou.lastSyncedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirm(ou.id)}
                            disabled={isPending || hasChanges}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            )}
          </div>

          {/* Footer with Save/Cancel buttons */}
          <SheetFooter className="px-6 py-4 border-t">
            <div className="flex justify-between w-full">
              <Button
                variant="outline"
                onClick={() => hasChanges ? setShowCancelConfirm(true) : setOpen(false)}
                disabled={isPending}
              >
                {hasChanges ? "Cancel Changes" : "Close"}
              </Button>
              <Button
                onClick={handleSaveChanges}
                disabled={!hasChanges || isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Discover OUs Sheet */}
      <Sheet open={showDiscoverSheet} onOpenChange={handleDiscoverSheetOpenChange}>
        <SheetContent side="right" className="w-[800px] sm:w-[900px] sm:max-w-[90vw] flex flex-col p-0">
          <div className="px-6 py-4 border-b">
            <SheetHeader>
              <SheetTitle>Discovered OUs from Active Directory</SheetTitle>
              <SheetDescription>
                Select OUs to add to your sync configuration
              </SheetDescription>
            </SheetHeader>

            {selectedOUsToAdd.size > 0 && (
              <div className="mt-4">
                <Badge variant="secondary" className="ml-auto">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {selectedOUsToAdd.size} Pending Addition{selectedOUsToAdd.size > 1 ? 's' : ''}
                </Badge>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OU Name</TableHead>
                <TableHead>DN</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discoveredOUs.map((ou) => {
                const isSelected = selectedOUsToAdd.has(ou.ouName);

                return (
                  <TableRow key={ou.ouName} className={isSelected ? "bg-green-50 dark:bg-green-950/20" : ""}>
                    <TableCell className="font-medium">
                      {ou.ouName}
                      {isSelected && (
                        <Badge variant="outline" className="ml-2 text-xs">Selected</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {ou.ouDn}
                    </TableCell>
                    <TableCell className="text-right">
                      {ou.alreadyExists ? (
                        <Badge variant="secondary">Already Added</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant={isSelected ? "secondary" : "default"}
                          onClick={() => handleToggleOUSelection(ou.ouName)}
                          disabled={isPending}
                        >
                          {isSelected ? (
                            <>
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remove
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </>
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>

          {/* Footer with Save/Cancel buttons */}
          <SheetFooter className="px-6 py-4 border-t">
            <div className="flex justify-between w-full">
              <Button
                variant="outline"
                onClick={() => selectedOUsToAdd.size > 0 ? setShowDiscoveryCancelConfirm(true) : setShowDiscoverSheet(false)}
                disabled={isPending}
              >
                {selectedOUsToAdd.size > 0 ? "Cancel Changes" : "Close"}
              </Button>
              <Button
                onClick={handleSaveDiscoveredOUs}
                disabled={selectedOUsToAdd.size === 0 || isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Cancel Changes Confirmation Dialog */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to organizational unit settings. If you continue, these changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowCancelConfirm(false);
              setPendingClose(false);
            }}>
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelChanges}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove OU?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the OU from sync configuration. Existing domain users from this OU will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discovery Cancel Confirmation Dialog */}
      <AlertDialog open={showDiscoveryCancelConfirm} onOpenChange={setShowDiscoveryCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard pending additions?</AlertDialogTitle>
            <AlertDialogDescription>
              You have {selectedOUsToAdd.size} OU{selectedOUsToAdd.size !== 1 ? 's' : ''} selected for addition. If you continue, these selections will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDiscoveryCancelConfirm(false);
              setPendingDiscoveryClose(false);
            }}>
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelDiscoveredOUs}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Selections
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
