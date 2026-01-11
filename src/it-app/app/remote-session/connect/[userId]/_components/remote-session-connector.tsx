"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Client component dynamically imported to avoid SSR issues with WebRTC
const RemoteSessionClient = dynamic(
  () => import("../../../[sessionId]/_components/remote-session-client"),
  { ssr: false }
);

interface RemoteSessionConnectorProps {
  userId: string;
}

type ConnectionState = "connecting" | "connected" | "error";

interface SessionData {
  id: string;
  [key: string]: any;
}

/**
 * Remote Session Connector
 *
 * Handles session creation when opening remote access from Active Sessions.
 * Shows connecting state immediately, then renders the actual session once created.
 */
export default function RemoteSessionConnector({
  userId,
}: RemoteSessionConnectorProps) {
  const [state, setState] = useState<ConnectionState>("connecting");
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createSession = async () => {
    setState("connecting");
    setError(null);

    try {
      console.log("[RemoteConnector] Creating session for user:", userId);

      const response = await fetch(`/api/remote-access/start-by-user/${userId}`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || errorData.error || "Failed to start remote access");
      }

      const data = await response.json();
      console.log("[RemoteConnector] Session created:", data);

      setSessionData(data);
      setState("connected");
    } catch (err) {
      console.error("[RemoteConnector] Error:", err);
      setError(err instanceof Error ? err.message : "Failed to connect");
      setState("error");
    }
  };

  useEffect(() => {
    createSession();
  }, [userId]);

  // Connecting state
  if (state === "connecting") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-black text-white">
        <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Connecting...</h2>
        <p className="text-gray-400 text-sm">Establishing remote access session</p>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-black text-white">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Connection Failed</h2>
        <p className="text-gray-400 text-sm mb-6 max-w-md text-center">{error}</p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => window.close()}
            className="bg-transparent border-gray-600 text-white hover:bg-gray-800"
          >
            Close
          </Button>
          <Button
            onClick={createSession}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Connected - render the remote session client
  if (state === "connected" && sessionData) {
    return <RemoteSessionClient sessionId={sessionData.id} />;
  }

  return null;
}
