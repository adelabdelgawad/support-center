"use client";

import { useCallback, useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataTable, DynamicTableBar, SearchInput, Pagination } from "@/components/data-table";
import { toast } from "sonner";
import type { DeviceListItem, DeviceListResponse, DiscoveryResponse } from "@/types/device";
import type { InstallCredentials } from "@/types/credential";
import type { Table as TanStackTable } from "@tanstack/react-table";
import { createDevicesTableColumns } from "./devices-table-columns";
import { ManualAddDialog } from "./manual-add-dialog";
import { NetworkScanDialog } from "./network-scan-dialog";
import { InstallCredentialDialog } from "./install-credential-dialog";
import { OnlineStatusFilter } from "./online-status-filter";

interface DevicesTabProps {
  initialData: DeviceListResponse | null;
}

export function DevicesTab({ initialData }: DevicesTabProps) {
  const searchParams = useSearchParams();
  const statusFilter = searchParams?.get("status") || "all";
  const hostnameFilter = searchParams?.get("hostname") || "";
  const page = Number(searchParams?.get("page") || "1");
  const limit = Number(searchParams?.get("limit") || "10");

  // Use useState with initialData (like settings pages)
  const [data, setData] = useState<DeviceListResponse>(
    initialData ?? { devices: [], total: 0 }
  );

  // State for install credential dialog
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceListItem | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [tableInstance, setTableInstance] = useState<TanStackTable<DeviceListItem> | null>(null);
  const [selectedDevices, setSelectedDevices] = useState<DeviceListItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Sync with initialData when it changes (server-side update)
  useEffect(() => {
    if (initialData) {
      setData(initialData);
    }
  }, [initialData]);

  const allDevices = data.devices;

  // Filter devices based on online status and hostname
  const filteredDevices = useMemo(() => {
    let result = allDevices;

    // Apply status filter (using backend-computed isOnline)
    if (statusFilter === "online") {
      result = result.filter((d) => d.isOnline);
    } else if (statusFilter === "offline") {
      result = result.filter((d) => !d.isOnline);
    }

    // Apply hostname search filter
    if (hostnameFilter) {
      const searchLower = hostnameFilter.toLowerCase();
      result = result.filter((d) =>
        d.hostname.toLowerCase().includes(searchLower) ||
        (d.ipAddress && d.ipAddress.includes(hostnameFilter))
      );
    }

    return result;
  }, [allDevices, statusFilter, hostnameFilter]);

  // Paginate the filtered devices
  const paginatedDevices = useMemo(() => {
    const startIndex = (page - 1) * limit;
    return filteredDevices.slice(startIndex, startIndex + limit);
  }, [filteredDevices, page, limit]);

  // Calculate online/offline counts (from all devices, not filtered)
  const onlineCount = useMemo(() => allDevices.filter((d) => d.isOnline).length, [allDevices]);
  const offlineCount = useMemo(() => allDevices.filter((d) => !d.isOnline).length, [allDevices]);

  /**
   * Update devices with new data (optimistic update pattern)
   */
  const updateDevicesOptimistic = useCallback((updatedDevices?: DeviceListItem[]) => {
    if (!updatedDevices || updatedDevices.length === 0) return;

    const updatedMap = new Map(updatedDevices.map((d) => [d.id, d]));

    setData((current) => {
      const existingIds = new Set(current.devices.map((d) => d.id));
      const newDevices = updatedDevices.filter((d) => !existingIds.has(d.id));

      const updatedList = current.devices.map((device) =>
        updatedMap.has(device.id) ? updatedMap.get(device.id)! : device
      );

      return {
        ...current,
        devices: [...updatedList, ...newDevices],
        total: updatedList.length + newDevices.length,
      };
    });
  }, []);

  /**
   * Add a new device to the list
   */
  const addDeviceToCache = useCallback((newDevice: DeviceListItem) => {
    setData((current) => ({
      ...current,
      devices: [newDevice, ...current.devices],
      total: current.total + 1,
    }));
  }, []);

  /**
   * Fetch fresh data from server
   */
  const handleRefetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/management/devices", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch devices");
      }
      const freshData: DeviceListResponse = await response.json();
      setData(freshData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh status by pinging all devices
  const handleRefreshStatus = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/management/devices/refresh-status", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to refresh device status");
      }

      const result: DiscoveryResponse = await response.json();
      toast.success(
        `Refreshed ${result.hostsScanned} devices: ${result.hostsReachable} online`
      );
      updateDevicesOptimistic(result.devices);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh status");
    } finally {
      setIsRefreshing(false);
    }
  }, [updateDevicesOptimistic]);

  const handleSyncSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/management/devices/sync-sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeOnly: true }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to sync sessions");
      }

      const result: DiscoveryResponse = await response.json();
      toast.success(
        `Synced ${result.totalCount} devices from sessions (${result.createdCount} new, ${result.updatedCount} updated)`
      );
      updateDevicesOptimistic(result.devices);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync sessions");
    } finally {
      setIsLoading(false);
    }
  }, [updateDevicesOptimistic]);

  // Opens the credential dialog for a device
  const handleInstallClick = useCallback((device: DeviceListItem) => {
    if (device.lifecycleState !== "discovered") {
      toast.error("Can only install on discovered devices");
      return;
    }
    setSelectedDevice(device);
    setInstallDialogOpen(true);
  }, []);

  // Handles the actual installation with provided credentials
  const handleInstallWithCredentials = useCallback(async (credentials: InstallCredentials) => {
    if (!selectedDevice) return;

    setUpdatingIds((prev) => new Set(prev).add(selectedDevice.id));

    try {
      const response = await fetch(`/api/management/devices/${selectedDevice.id}/install`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentials: {
            username: credentials.username,
            password: credentials.password,
            credentialType: credentials.credentialType,
          },
          force: false,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to create installation job");
      }

      toast.success(`Installation job created for ${selectedDevice.hostname}`);

      // Optimistic update: update the device's lifecycle state locally
      updateDevicesOptimistic([
        { ...selectedDevice, lifecycleState: "install_pending" },
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create installation job");
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedDevice.id);
        return next;
      });
    }
  }, [selectedDevice, updateDevicesOptimistic]);

  // Create columns with actions
  const columns = useMemo(
    () => createDevicesTableColumns({
      updatingIds,
      onInstallClick: handleInstallClick,
    }),
    [updatingIds, handleInstallClick]
  );

  const totalItems = filteredDevices.length;
  const totalPages = Math.ceil(totalItems / limit);

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col min-h-0 space-y-2">
        {/* Toolbar */}
        <DynamicTableBar
          variant="controller"
          hasSelection={selectedDevices.length > 0}
          left={
            <div className="flex items-center gap-2">
              <OnlineStatusFilter
                onlineCount={onlineCount}
                offlineCount={offlineCount}
                totalCount={allDevices.length}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshStatus}
                disabled={isRefreshing || isLoading}
                title="Ping all devices to refresh online status"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
              {selectedDevices.length > 0 && (
                <span className="text-sm text-muted-foreground ml-2">
                  {selectedDevices.length} selected
                </span>
              )}
            </div>
          }
          right={
            <div className="flex items-center gap-2">
              <SearchInput
                placeholder="Search devices..."
                urlParam="hostname"
                debounceMs={300}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncSessions}
                disabled={isLoading}
              >
                <Users className="h-4 w-4 mr-2" />
                Sync Sessions
              </Button>
              <ManualAddDialog onSuccess={updateDevicesOptimistic} disabled={isLoading} />
              <NetworkScanDialog onSuccess={updateDevicesOptimistic} disabled={isLoading} />
            </div>
          }
        />

        {/* Data Table */}
        <div className="flex-1 min-h-0 flex flex-col">
          <DataTable
            _data={paginatedDevices}
            columns={columns}
            tableInstanceHook={(table) => setTableInstance(table)}
            onRowSelectionChange={setSelectedDevices}
            renderToolbar={() => null}
            enableRowSelection={true}
            enableSorting={false}
            _isLoading={isLoading}
          />
        </div>

        {/* Pagination */}
        {totalItems > 0 && (
          <div className="shrink-0 bg-card border-t border-border">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={limit}
              totalItems={totalItems}
            />
          </div>
        )}

        {/* Install Credential Dialog */}
        <InstallCredentialDialog
          open={installDialogOpen}
          onOpenChange={setInstallDialogOpen}
          deviceHostname={selectedDevice?.hostname ?? ""}
          onSubmit={handleInstallWithCredentials}
        />
      </div>
    </TooltipProvider>
  );
}
