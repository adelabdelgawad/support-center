"use client";

import dynamic from "next/dynamic";

// Client component dynamically imported to avoid SSR issues with WebRTC
const RemoteSessionClient = dynamic(
  () => import("./remote-session-client"),
  { ssr: false }
);

interface RemoteSessionWrapperProps {
  sessionId: string;
}

export default function RemoteSessionWrapper({
  sessionId,
}: RemoteSessionWrapperProps) {
  return <RemoteSessionClient sessionId={sessionId} />;
}
