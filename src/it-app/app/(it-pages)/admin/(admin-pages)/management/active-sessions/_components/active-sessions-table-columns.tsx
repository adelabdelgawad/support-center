"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Monitor, ArrowUpCircle, Trash2, Loader2 } from "lucide-react";
import type { ActiveSession, SessionStatus } from "@/types/sessions";
import { SessionStatusBadge } from "./session-status-badge";
import { VersionStatusBadge } from "./version-status-badge";

interface SessionsTableColumnsProps {
  onRemoteAccess?: (session: ActiveSession) => void;
  onUpdateClient?: (session: ActiveSession) => void;
  onDeleteSession?: (sessionId: string) => Promise<void>;
  updatingIds?: Set<string>;
}

/**
 * Get status color for badge
 */
function getStatusColor(status: SessionStatus): "default" | "success" | "warning" | "destructive" {
  switch (status) {
    case 'active':
      return 'success';
    case 'stale':
      return 'warning';
    case 'disconnected':
      return 'destructive';
    default:
      return 'default';
  }
}

/**
 * Create column definitions for the active sessions table
 */
export function createActiveSessionsTableColumns({
  onRemoteAccess,
  onUpdateClient,
  onDeleteSession,
  updatingIds = new Set(),
}: SessionsTableColumnsProps): ColumnDef<ActiveSession>[] {
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
        const isRowUpdating = Boolean(
          row.original.id && updatingIds.has(row.original.id)
        );

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
                disabled={Boolean(updatingIds.size > 0) || isRowUpdating}
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
      accessorKey: "user.username",
      header: () => <div className="text-center">User</div>,
      cell: (info) => {
        const session = info.row.original;
        return (
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="font-medium">{session.user.username}</span>
            {session.user.fullName && (
              <span className="text-xs text-muted-foreground">{session.user.fullName}</span>
            )}
          </div>
        );
      },
      enableSorting: true,
    },

    {
      accessorKey: "sessionType",
      header: () => <div className="text-center">Type</div>,
      cell: (info) => {
        const type = info.getValue() as string;
        return (
          <div className="flex justify-center">
            <Badge variant="outline" className="capitalize">
              <Monitor className="w-3 h-3 mr-1" />
              {type}
            </Badge>
          </div>
        );
      },
      enableSorting: false,
    },

    {
      accessorKey: "status",
      header: () => <div className="text-center">Status</div>,
      cell: (info) => {
        const status = info.getValue() as SessionStatus;
        return (
          <div className="flex justify-center">
            <SessionStatusBadge status={status} />
          </div>
        );
      },
      enableSorting: true,
    },

    {
      accessorKey: "appVersion",
      header: () => <div className="text-center">App Version</div>,
      cell: (info) => {
        const version = info.getValue() as string | null | undefined;
        return (
          <div className="flex justify-center">
            <span className="font-mono text-sm">
              {version || <span className="text-muted-foreground italic">Unknown</span>}
            </span>
          </div>
        );
      },
      enableSorting: true,
    },

    {
      accessorKey: "versionStatus",
      header: () => <div className="text-center">Version Status</div>,
      cell: (info) => {
        const session = info.row.original;
        return (
          <div className="flex justify-center">
            <VersionStatusBadge
              status={session.versionStatus}
              targetVersion={session.targetVersion}
            />
          </div>
        );
      },
      enableSorting: true,
    },

    {
      accessorKey: "ipAddress",
      header: () => <div className="text-center">IP Address</div>,
      cell: (info) => (
        <div className="flex justify-center">
          <span className="font-mono text-sm">{info.getValue() as string}</span>
        </div>
      ),
      enableSorting: false,
    },

    {
      accessorKey: "computerName",
      header: () => <div className="text-center">Computer Name</div>,
      cell: (info) => {
        const computerName = info.getValue() as string | null | undefined;
        return (
          <div className="flex justify-center">
            <span className="text-sm">
              {computerName || <span className="text-muted-foreground italic">Unknown</span>}
            </span>
          </div>
        );
      },
      enableSorting: true,
    },

    {
      accessorKey: "lastHeartbeat",
      header: () => <div className="text-center">Last Heartbeat</div>,
      cell: (info) => {
        const lastHeartbeat = info.getValue() as string;
        try {
          const relativeTime = formatDistanceToNow(new Date(lastHeartbeat), {
            addSuffix: true,
          });
          return (
            <div className="flex justify-center">
              <span className="text-sm">{relativeTime}</span>
            </div>
          );
        } catch {
          return (
            <div className="flex justify-center">
              <span className="text-sm text-muted-foreground">Invalid date</span>
            </div>
          );
        }
      },
      enableSorting: true,
    },

    {
      accessorKey: "durationMinutes",
      header: () => <div className="text-center">Duration</div>,
      cell: (info) => {
        const minutes = info.getValue() as number;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const display = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        return (
          <div className="flex justify-center">
            <span className="text-sm">{display}</span>
          </div>
        );
      },
      enableSorting: true,
    },

    {
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: ({ row }) => {
        const session = row.original;
        const canRemoteAccess = session.status === 'active' && session.sessionType === 'desktop';
        const canUpdate = session.status === 'active' && session.sessionType === 'desktop' &&
          (session.versionStatus === 'outdated' || session.versionStatus === 'outdated_enforced');
        const isRowUpdating = Boolean(session.id && updatingIds.has(session.id));

        return (
          <div
            className={`flex items-center justify-center gap-2 ${isRowUpdating ? "opacity-60 pointer-events-none" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Update Client Button */}
            <Button
              size="icon"
              variant="outline"
              disabled={!canUpdate || isRowUpdating}
              onClick={(e) => {
                e.stopPropagation();
                if (canUpdate && onUpdateClient) {
                  onUpdateClient(session);
                }
              }}
              title={
                canUpdate
                  ? `Push update to version ${session.targetVersion || 'latest'}`
                  : session.sessionType !== 'desktop'
                    ? "Updates only available for desktop clients"
                    : session.status !== 'active'
                      ? "Client must be active to receive updates"
                      : "Client is already up to date"
              }
            >
              <ArrowUpCircle className="w-4 h-4" />
            </Button>

            {/* Remote Access Button */}
            <Button
              size="icon"
              variant="outline"
              disabled={!canRemoteAccess || isRowUpdating}
              onClick={(e) => {
                e.stopPropagation();
                if (canRemoteAccess && onRemoteAccess) {
                  onRemoteAccess(session);
                }
              }}
              title={
                canRemoteAccess
                  ? "Initiate remote access"
                  : "Remote access only available for active desktop sessions"
              }
            >
              <Monitor className="w-4 h-4" />
            </Button>

            {/* Delete Session Button */}
            <Button
              size="icon"
              variant="outline"
              disabled={isRowUpdating}
              onClick={async (e) => {
                e.stopPropagation();
                if (onDeleteSession) {
                  await onDeleteSession(session.id);
                }
              }}
              title="Delete session"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      },
      enableSorting: false,
      size: 150,
    },
  ];
}
