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
  Trophy,
  TrendingUp,
  Clock,
} from "lucide-react";
import { formatDate } from "@/lib/utils/date-formatting";

import type { AgentPerformanceData, DateRangePreset } from "@/types/reports";

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

).map((_, i) => (
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

interface AgentPerformanceClientProps {
  initialData: AgentPerformanceData;
}

export function AgentPerformanceClient({ initialData }: AgentPerformanceClientProps) {
  const [dateRange, setDateRange] = useState<DateRangePreset>("last_30_days");

  const { data, error, isLoading } = useSWR<AgentPerformanceData>(
    `/api/reports/agents/performance?date_preset=${dateRange}`,
    fetcher,
    {
      fallbackData: initialData,
      revalidateIfStale: false,
      revalidateOnFocus: false,
    }
  );

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Agent Performance</h2>
          <p className="text-muted-foreground">
            Technician performance metrics and rankings
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
              <span>Failed to load performance data. Please try again.</span>
            </div>
          </CardContent>
        </Card>
      )}


      {data && (
        <div className="space-y-6">
          {/* Period indicator */}
          <div className="text-sm text-muted-foreground">
            Period: {formatDate(data.periodStart)} -{" "}
            {formatDate(data.periodEnd)}
          </div>

          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Technicians</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalTechnicians}</div>
                <p className="text-xs text-muted-foreground">
                  {data.activeTechnicians} active
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tickets Handled</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalTicketsHandled}</div>
                <p className="text-xs text-muted-foreground">
                  {data.avgTicketsPerTechnician.toFixed(1)} avg per technician
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Avg Resolution</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.teamAvgResolutionHours
                    ? `${data.teamAvgResolutionHours.toFixed(1)} hrs`
                    : "N/A"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team SLA Compliance</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.teamSlaComplianceRate
                    ? `${data.teamSlaComplianceRate.toFixed(1)}%`
                    : "N/A"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Performers */}
          {data.topPerformers && data.topPerformers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Top Performers
                </CardTitle>
                <CardDescription>Ranked by tickets resolved</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Rank</TableHead>
                      <TableHead>Technician</TableHead>
                      <TableHead className="text-right">Resolved</TableHead>
                      <TableHead className="text-right">Assigned</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                      <TableHead className="text-right">Resolution Rate</TableHead>
                      <TableHead className="text-right">Avg Time</TableHead>
                      <TableHead className="text-right">SLA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topPerformers.map((tech) => (
                      <TableRow key={tech.technicianId}>
                        <TableCell>
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                              tech.rank === 1
                                ? "bg-yellow-500 text-yellow-950"
                                : tech.rank === 2
                                ? "bg-gray-300 text-gray-800"
                                : tech.rank === 3
                                ? "bg-amber-700 text-white"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {tech.rank}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {tech.fullName || tech.technicianName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              @{tech.technicianName}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {tech.ticketsResolved}
                        </TableCell>
                        <TableCell className="text-right">
                          {tech.ticketsAssigned}
                        </TableCell>
                        <TableCell className="text-right">
                          {tech.openTickets}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress
                              value={tech.resolutionRate}
                              className="w-16 h-2"
                            />
                            <span className="w-12 text-right">
                              {tech.resolutionRate.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {tech.avgResolutionHours
                            ? `${tech.avgResolutionHours.toFixed(1)} hrs`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {tech.slaComplianceRate !== undefined ? (
                            <Badge
                              variant={
                                tech.slaComplianceRate >= 95
                                  ? "default"
                                  : tech.slaComplianceRate >= 85
                                  ? "secondary"
                                  : "destructive"
                              }
                            >
                              {tech.slaComplianceRate.toFixed(0)}%
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Needs Attention */}
          {data.needsAttention && data.needsAttention.length > 0 && (
            <Card className="border-yellow-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-5 w-5" />
                  Needs Attention
                </CardTitle>
                <CardDescription>
                  Technicians with below-target metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Technician</TableHead>
                      <TableHead className="text-right">Resolved</TableHead>
                      <TableHead className="text-right">Resolution Rate</TableHead>
                      <TableHead className="text-right">SLA Compliance</TableHead>
                      <TableHead>Issue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.needsAttention.map((tech) => (
                      <TableRow key={tech.technicianId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {tech.fullName || tech.technicianName}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {tech.ticketsResolved}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={tech.resolutionRate < 50 ? "destructive" : "secondary"}
                          >
                            {tech.resolutionRate.toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={
                              tech.slaComplianceRate && tech.slaComplianceRate < 90
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {tech.slaComplianceRate?.toFixed(0) || 0}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {tech.resolutionRate < 50 && "Low resolution rate"}
                            {tech.resolutionRate < 50 &&
                              tech.slaComplianceRate &&
                              tech.slaComplianceRate < 90 &&
                              " | "}
                            {tech.slaComplianceRate &&
                              tech.slaComplianceRate < 90 &&
                              "SLA compliance below target"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {data.topPerformers?.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium">No performance data</p>
                  <p className="text-muted-foreground">
                    No technician activity found for this period.
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
