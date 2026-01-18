"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Monitor, Download, Loader2 } from "lucide-react";
import type { ActiveSession } from "@/types/sessions";
import { useState } from "react";
import { toast } from "sonner";

interface SessionActionsProps {
  session: ActiveSession;
}

/**
 * Action buttons for each session
 * - Remote Access: Opens remote session in new tab
 * - Update Client: Placeholder only
 */
export function SessionActions({ session }: SessionActionsProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleRemoteAccess = async () => {
    if (isLoading) return;

    setIsLoading(true);
    console.log("[RemoteAccess] Starting remote access for user:", session.userId);

    try {
      // Call API to start remote access by user ID
      const response = await fetch(`/api/remote-access/start-by-user/${session.userId}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || error.error || "Failed to start remote access");
      }

      const sessionData = await response.json();
      console.log("[RemoteAccess] Session created:", sessionData);

      // Open remote session page in new tab
      const remoteSessionUrl = `/remote-session/${sessionData.id}`;
      window.open(remoteSessionUrl, "_blank", "noopener,noreferrer");

      toast.success("Remote access session started", {
        description: `Connecting to ${session.user.fullName || session.user.username}`,
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

  const handleUpdateClient = () => {
    // TODO: Implement client update functionality
    // No backend implementation yet
    console.log("Update client requested for session:", session.id);
    toast.info("Client update feature coming soon");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={handleRemoteAccess}
          disabled={isLoading}
          className="cursor-pointer"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Monitor className="h-4 w-4 mr-2" />
          )}
          Remote Access
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleUpdateClient}
          disabled
          className="cursor-not-allowed"
        >
          <Download className="h-4 w-4 mr-2" />
          Update Client
          <span className="ml-auto text-xs text-muted-foreground">Coming Soon</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
