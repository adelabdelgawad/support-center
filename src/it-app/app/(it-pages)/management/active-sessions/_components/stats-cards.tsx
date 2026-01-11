"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActiveSessionStats } from "@/types/sessions";

interface StatsCardsProps {
  stats: ActiveSessionStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const avgDuration = stats.avgSessionDuration
    ? `${Math.round(stats.avgSessionDuration)} min`
    : 'N/A';

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalSessions}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Desktop
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.desktopSessions}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Web
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.webSessions}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Unique Users
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.uniqueUsers}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Avg Duration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{avgDuration}</div>
        </CardContent>
      </Card>
    </div>
  );
}
