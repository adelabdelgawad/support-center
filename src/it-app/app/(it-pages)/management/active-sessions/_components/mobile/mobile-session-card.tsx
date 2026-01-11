"use client";

import { Monitor, Clock, MapPin, Globe, MoreVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActiveSession } from "@/types/sessions";
import { SessionStatusBadge } from "../session-status-badge";
import { VersionStatusBadge } from "../version-status-badge";

interface MobileSessionCardProps {
  session: ActiveSession;
}

function formatTimeAgo(date: string | Date): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function MobileSessionCard({ session }: MobileSessionCardProps) {
  const lastActive = session.lastHeartbeat
    ? formatTimeAgo(session.lastHeartbeat)
    : "Unknown";

  return (
    <Card className="mb-2">
      <CardContent className="p-3">
        {/* Header: User info and status */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{session.user?.fullName || session.user?.username || "Unknown"}</div>
            <div className="text-xs text-muted-foreground truncate">{session.user?.username}</div>
          </div>
          <div className="flex items-center gap-2">
            <SessionStatusBadge status={session.status} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Remote Access</DropdownMenuItem>
                <DropdownMenuItem>View Details</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Device info */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-2">
          <div className="flex items-center gap-1">
            <Monitor className="h-3 w-3" />
            <span className="truncate">{session.computerName || "Unknown Device"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span className="truncate">{lastActive}</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{session.ipAddress || "N/A"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Globe className="h-3 w-3" />
            <span className="truncate">{session.sessionType || "desktop"}</span>
          </div>
        </div>

        {/* Version info */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-xs text-muted-foreground">
            v{session.appVersion || "Unknown"}
          </div>
          <VersionStatusBadge
            status={session.versionStatus}
            targetVersion={session.targetVersion}
          />
        </div>
      </CardContent>
    </Card>
  );
}
