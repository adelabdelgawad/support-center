"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Download, Loader2, Wifi, WifiOff } from "lucide-react";
import type { DeviceListItem } from "@/types/device";
import { DeviceLifecycleBadge } from "./device-lifecycle-badge";

interface DevicesTableColumnsProps {
  updatingIds: Set<string>;
  onInstallClick: (device: DeviceListItem) => void;
}

/**
 * Get discovery source display label
 */
function getDiscoverySourceLabel(source: string): string {
  switch (source) {
    case "ad":
      return "Active Directory";
    case "network_scan":
      return "Network Scan";
    case "desktop_session":
      return "Desktop Session";
    case "manual":
      return "Manual";
    default:
      return source;
  }
}

/**
 * Format date for display
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString();
}

/**
 * Create column definitions for the devices table
 */
export function createDevicesTableColumns({
  updatingIds,
  onInstallClick,
}: DevicesTableColumnsProps): ColumnDef<DeviceListItem>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex justify-center">
          <input
            type="checkbox"
            className="rounded border-input cursor-pointer"
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
            disabled={updatingIds.size > 0}
          />
        </div>
      ),
      cell: ({ row }) => {
        const isRowUpdating = updatingIds.has(row.original.id);

        return (
          <div
            className={`flex justify-center items-center px-2 ${
              isRowUpdating ? "opacity-60" : ""
            }`}
          >
            {isRowUpdating && (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            )}
            {!isRowUpdating && (
              <input
                type="checkbox"
                className="rounded border-input cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                checked={row.getIsSelected()}
                onChange={(e) => {
                  e.stopPropagation();
                  row.toggleSelected(e.target.checked);
                }}
                disabled={updatingIds.size > 0 || isRowUpdating}
              />
            )}
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },

    {
      accessorKey: "hostname",
      header: () => <div className="text-left">Hostname</div>,
      cell: ({ row }) => {
        const device = row.original;
        const isRowUpdating = updatingIds.has(device.id);
        return (
          <div
            className={`flex flex-col ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <span className="font-medium">{device.hostname}</span>
            {device.adComputerDn && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground truncate max-w-[200px] cursor-help">
                    {device.adComputerDn}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{device.adComputerDn}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
    },

    {
      accessorKey: "ipAddress",
      header: () => <div className="text-center">IP Address</div>,
      cell: ({ row }) => {
        const device = row.original;
        const isRowUpdating = updatingIds.has(device.id);
        return (
          <div
            className={`font-mono text-sm ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {device.ipAddress || "-"}
          </div>
        );
      },
    },

    {
      id: "onlineStatus",
      header: () => <div className="text-center">Status</div>,
      cell: ({ row }) => {
        const device = row.original;
        const isRowUpdating = updatingIds.has(device.id);

        return (
          <div
            className={`flex justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5">
                  {device.isOnline ? (
                    <>
                      <Wifi className="h-4 w-4 text-green-500" />
                      <span className="text-xs text-green-600">Online</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Offline</span>
                    </>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Last seen: {formatDate(device.lastSeenAt)}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        );
      },
      enableSorting: false,
      size: 100,
    },

    {
      accessorKey: "lifecycleState",
      header: () => <div className="text-center">Lifecycle</div>,
      cell: ({ row }) => {
        const device = row.original;
        const isRowUpdating = updatingIds.has(device.id);
        return (
          <div
            className={`flex justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <DeviceLifecycleBadge state={device.lifecycleState} />
          </div>
        );
      },
      enableSorting: false,
    },

    {
      accessorKey: "discoverySource",
      header: () => <div className="text-center">Source</div>,
      cell: ({ row }) => {
        const device = row.original;
        const isRowUpdating = updatingIds.has(device.id);
        return (
          <div
            className={`flex justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <Badge variant="outline">
              {getDiscoverySourceLabel(device.discoverySource)}
            </Badge>
          </div>
        );
      },
      enableSorting: false,
    },

    {
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: ({ row }) => {
        const device = row.original;
        const isRowUpdating = updatingIds.has(device.id);

        return (
          <div
            className={`flex justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {device.lifecycleState === "discovered" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onInstallClick(device)}
                disabled={isRowUpdating}
              >
                <Download className="h-4 w-4 mr-1" />
                Install
              </Button>
            ) : device.lifecycleState === "install_pending" ? (
              <Badge variant="secondary">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Installing...
              </Badge>
            ) : (
              <span className="text-muted-foreground text-sm">-</span>
            )}
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 120,
    },
  ];
}
