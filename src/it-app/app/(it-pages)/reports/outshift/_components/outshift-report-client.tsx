"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  Users,
  Clock,
  Moon,
  Sun,
  Activity,
} from "lucide-react";
import { formatDate } from "@/lib/utils/date-formatting";

import type { OutshiftGlobalReportData, DateRangePreset } from "@/types/reports";

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch data");
  }
  return response.json();
};

const dateRangeOptions: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
];

function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes.toFixed(0)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${remainingMinutes} min`;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface OutshiftReportClientProps {
  initialData: OutshiftGlobalReportData;
}

export function OutshiftReportClient({ initialData }: OutshiftReportClientProps) {
  const [dateRange, setDateRange] = useState<DateRangePreset>("last_30_days");

  // Check if initial data is empty - if so, we need to fetch on mount
  const hasRealInitialData = initialData && initialData.hasData;

  const { data, error, isLoading } = useSWR<OutshiftGlobalReportData>(
    `/api/reports/outshift/global?date_preset=${dateRange}`,
    fetcher,
    {
      fallbackData: initialData,
      revalidateOnMount: !hasRealInitialData,
      revalidateOnFocus: false,
    }
  );

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Outshift Report</h2>
          <p className="text-muted-foreground">
            Agent activity outside of business hours
          </p>
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRangePreset)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            {dateRangeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span>Failed to load outshift data. Please try again.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && <LoadingSkeleton />}

      {data && (
        <div className="space-y-6">
          {/* Period indicator */}
          <div className="text-sm text-muted-foreground">
            Period: {formatDate(data.periodStart)} - {formatDate(data.periodEnd)}
          </div>

          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalAgents}</div>
                <p className="text-xs text-muted-foreground">
                  {data.agentsWithActivity} with activity
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Agents with Outshift</CardTitle>
                <Moon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.agentsWithOutshift}</div>
                <p className="text-xs text-muted-foreground">
                  {data.agentsWithActivity > 0
                    ? `${((data.agentsWithOutshift / data.agentsWithActivity) * 100).toFixed(0)}% of active agents`
                    : "No active agents"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Activity</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatMinutes(data.totalActivityMinutes)}
                </div>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <Sun className="h-3 w-3" />
                    {formatMinutes(data.totalInShiftMinutes)}
                  </span>
                  <span className="text-xs text-orange-600 flex items-center gap-1">
                    <Moon className="h-3 w-3" />
                    {formatMinutes(data.totalOutShiftMinutes)}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overall Outshift %</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.overallOutShiftPercentage.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg per agent: {data.avgOutShiftPercentage.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Agent Rankings */}
          {data.agentRankings && data.agentRankings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Moon className="h-5 w-5 text-orange-500" />
                  Agent Outshift Rankings
                </CardTitle>
                <CardDescription>Ranked by outshift percentage (highest first)</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Rank</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-right">Total Activity</TableHead>
                      <TableHead className="text-right">Outshift Time</TableHead>
                      <TableHead className="text-right">Outshift %</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Tickets</TableHead>
                      <TableHead className="text-right">BUs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.agentRankings.map((agent) => (
                      <TableRow key={agent.agentId}>
                        <TableCell>
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                              agent.rank === 1
                                ? "bg-orange-500 text-white"
                                : agent.rank === 2
                                ? "bg-orange-400 text-white"
                                : agent.rank === 3
                                ? "bg-orange-300 text-orange-900"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {agent.rank}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {agent.agentFullName || agent.agentName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              @{agent.agentName}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMinutes(agent.totalActivityMinutes)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-orange-600">
                          {formatMinutes(agent.totalOutShiftMinutes)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress
                              value={agent.totalOutShiftPercentage}
                              className="w-16 h-2"
                            />
                            <Badge
                              variant={
                                agent.totalOutShiftPercentage >= 50
                                  ? "destructive"
                                  : agent.totalOutShiftPercentage >= 25
                                  ? "secondary"
                                  : "default"
                              }
                            >
                              {agent.totalOutShiftPercentage.toFixed(1)}%
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {agent.outShiftSessionsCount}
                        </TableCell>
                        <TableCell className="text-right">
                          {agent.outShiftTicketsCount}
                        </TableCell>
                        <TableCell className="text-right">
                          {agent.businessUnitCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {!data.hasData && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Moon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium">No outshift data</p>
                  <p className="text-muted-foreground">
                    No agent activity found for this period.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
