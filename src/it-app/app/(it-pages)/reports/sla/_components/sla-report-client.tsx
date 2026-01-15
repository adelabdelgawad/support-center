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
  CheckCircle,
  Clock,
  TrendingUp,
} from "lucide-react";
import { formatDate } from "@/lib/utils/date-formatting";
import Link from "next/link";

import type { SLAComplianceData, DateRangePreset } from "@/types/reports";

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

function ComplianceGauge({
  label,
  value,
  met,
  breached,
}: {
  label: string;
  value: number;
  met: number;
  breached: number;
}) {
  const getColor = () => {
    if (value >= 95) return "bg-green-500";
    if (value >= 85) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-3xl font-bold">{value.toFixed(1)}%</span>
            <Badge variant={value >= 95 ? "default" : "destructive"}>
              {value >= 95 ? "On Track" : "Needs Attention"}
            </Badge>
          </div>
          <Progress value={value} className={`h-2 ${getColor()}`} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              {met} met
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              {breached} breached
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-2 w-full mt-2" />
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
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface SLAReportClientProps {
  initialData: SLAComplianceData;
}

export function SLAReportClient({ initialData }: SLAReportClientProps) {
  const [dateRange, setDateRange] = useState<DateRangePreset>("last_30_days");

  const { data, error, isLoading } = useSWR<SLAComplianceData>(
    `/api/reports/sla/compliance?date_preset=${dateRange}`,
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
          <h2 className="text-3xl font-bold tracking-tight">SLA Compliance</h2>
          <p className="text-muted-foreground">
            Service Level Agreement metrics and breach analysis
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
              <span>Failed to load SLA data. Please try again.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && <LoadingSkeleton />}

      {data && (
        <div className="space-y-6">
          {/* Period indicator */}
          <div className="text-sm text-muted-foreground">
            Period: {formatDate(data.periodStart)} -{" "}
            {formatDate(data.periodEnd)}
          </div>

          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <ComplianceGauge
              label="Overall SLA Compliance"
              value={data.overallComplianceRate}
              met={data.slaMetCount}
              breached={data.slaBreachedCount}
            />
            <ComplianceGauge
              label="First Response SLA"
              value={data.firstResponseComplianceRate}
              met={data.firstResponseSlaMet}
              breached={data.firstResponseSlaBreached}
            />
            <ComplianceGauge
              label="Resolution SLA"
              value={data.resolutionComplianceRate}
              met={data.resolutionSlaMet}
              breached={data.resolutionSlaBreached}
            />
          </div>

          {/* Average Times */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Average First Response Time
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.avgFirstResponseMinutes
                    ? `${data.avgFirstResponseMinutes.toFixed(0)} min`
                    : "N/A"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Average Resolution Time
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.avgResolutionHours
                    ? `${data.avgResolutionHours.toFixed(1)} hrs`
                    : "N/A"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Breaches */}
          {data.recentBreaches && data.recentBreaches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent SLA Breaches</CardTitle>
                <CardDescription>
                  Tickets that missed their SLA targets
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticket</TableHead>
                      <TableHead>Breach Type</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Overdue By</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentBreaches.map((breach) => (
                      <TableRow key={breach.requestId}>
                        <TableCell>
                          <Link
                            href={`/support-center/requests/${breach.requestId}`}
                            className="font-medium hover:underline"
                          >
                            {breach.title.length > 40
                              ? `${breach.title.substring(0, 40)}...`
                              : breach.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              breach.breachType === "first_response"
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {breach.breachType === "first_response"
                              ? "First Response"
                              : "Resolution"}
                          </Badge>
                        </TableCell>
                        <TableCell>{breach.priorityName}</TableCell>
                        <TableCell>{breach.statusName}</TableCell>
                        <TableCell className="text-destructive">
                          {breach.breachDurationMinutes > 60
                            ? `${(breach.breachDurationMinutes / 60).toFixed(1)} hrs`
                            : `${breach.breachDurationMinutes.toFixed(0)} min`}
                        </TableCell>
                        <TableCell>
                          {formatDate(breach.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {data.recentBreaches?.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-lg font-medium">No SLA breaches!</p>
                  <p className="text-muted-foreground">
                    All tickets are within their SLA targets for this period.
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
