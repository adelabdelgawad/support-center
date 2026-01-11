"use client";

import { useState } from "react";
import { Monitor, Loader2, Clock, Server, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface DesktopSession {
  id: string;
  ip_address: string;
  computer_name: string | null;
  last_heartbeat: string;
  is_active: boolean;
}

interface RemoteAccessActionsProps {
  requesterId: string;
  disabled?: boolean;
}

/**
 * Remote Access Actions Component
 *
 * Displays "Start Remote Access" button that:
 * 1. Fetches user's active desktop sessions
 * 2. If multiple sessions → shows selection dialog
 * 3. If single session → starts remote access directly
 */
export function RemoteAccessActions({
  requesterId,
  disabled = false,
}: RemoteAccessActionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState<DesktopSession[]>([]);
  const [showSessionDialog, setShowSessionDialog] = useState(false);

  const handleRemoteAccess = async () => {
    if (isLoading) return;

    setIsLoading(true);
    console.log("[RemoteAccess] Fetching desktop sessions for user:", requesterId);

    try {
      // Fetch user's active desktop sessions
      const response = await fetch(`/api/desktop-sessions/user/${requesterId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || error.error || "Failed to fetch user sessions");
      }

      const userSessions: DesktopSession[] = await response.json();
      console.log("[RemoteAccess] Found", userSessions.length, "active sessions");

      if (userSessions.length === 0) {
        toast.error("User is not online", {
          description: "No active desktop sessions found",
        });
        setIsLoading(false);
        return;
      }

      if (userSessions.length === 1) {
        // Only one session - start remote access directly
        await startRemoteAccess(userSessions[0].id);
      } else {
        // Multiple sessions - show selection dialog
        setSessions(userSessions);
        setShowSessionDialog(true);
        setIsLoading(false);
      }
    } catch (error: any) {
      console.error("[RemoteAccess] Error:", error);
      toast.error("Failed to fetch user sessions", {
        description: error.message || "Please try again",
      });
      setIsLoading(false);
    }
  };

  const startRemoteAccess = async (selectedSessionId: string) => {
    setIsLoading(true);
    setShowSessionDialog(false);

    try {
      // Call API to start remote access
      // Note: selectedSessionId is for user reference only - SignalR broadcasts to all user connections
      const response = await fetch(`/api/remote-access/start-by-user/${requesterId}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || error.error || "Failed to start remote access");
      }

      const sessionData = await response.json();
      console.log("[RemoteAccess] Session created:", sessionData);
      console.log("[RemoteAccess] Targeted desktop session:", selectedSessionId);

      // Open remote session page in new tab
      const remoteSessionUrl = `/remote-session/${sessionData.id}`;
      window.open(remoteSessionUrl, "_blank", "noopener,noreferrer");

      toast.success("Remote access session started", {
        description: "Connecting to user's desktop...",
      });
    } catch (error: any) {
      console.error("[RemoteAccess] Error:", error);
      toast.error("Failed to start remote access", {
        description: error.message || "Please try again",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatLastHeartbeat = (heartbeat: string) => {
    const now = Date.now();
    const heartbeatTime = new Date(heartbeat).getTime();
    const secondsSince = Math.floor((now - heartbeatTime) / 1000);

    if (secondsSince < 60) return `${secondsSince}s ago`;
    const minutesSince = Math.floor(secondsSince / 60);
    if (minutesSince < 60) return `${minutesSince}m ago`;
    const hoursSince = Math.floor(minutesSince / 60);
    return `${hoursSince}h ago`;
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRemoteAccess}
        disabled={disabled || isLoading}
        className="gap-2"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Monitor className="h-4 w-4" />
        )}
        Start Remote Access
      </Button>

      {/* Session Selection Dialog */}
      <Dialog open={showSessionDialog} onOpenChange={setShowSessionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Session</DialogTitle>
            <DialogDescription>
              User has multiple active desktop sessions. Choose which one to connect to.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 mt-4">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => startRemoteAccess(session.id)}
                className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:border-blue-500 hover:bg-blue-50 dark:border-gray-700 dark:hover:bg-blue-950/20 transition-colors text-left"
              >
                <Monitor className="h-10 w-10 text-blue-500 flex-shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {session.computer_name || "Unknown Computer"}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Server className="h-3 w-3" />
                      <span className="font-mono">{session.ip_address}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatLastHeartbeat(session.last_heartbeat)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Radio className="h-3 w-3" />
                      <span className="text-green-600">Active</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
