"use client";

import { MobileSessionCard } from "./mobile-session-card";
import type { ActiveSession } from "@/types/sessions";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MobileSessionsListProps {
  sessions: ActiveSession[];
}

export function MobileSessionsList({ sessions }: MobileSessionsListProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No sessions found
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-2">
        {sessions.map((session) => (
          <MobileSessionCard
            key={session.id}
            session={session}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
