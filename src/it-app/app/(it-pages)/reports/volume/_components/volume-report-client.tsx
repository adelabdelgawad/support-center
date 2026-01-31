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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  BarChart3,
} from "lucide-react";
import { formatDate, formatFullDateTime } from "@/lib/utils/date-formatting";

import type { VolumeReportData, DateRangePreset, DistributionItem } from "@/types/reports";

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
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DistributionChart({
  title,
  items,
}: {
  title: string;
  items: DistributionItem[];
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{item.label}</span>
                <span className="font-medium">{item.value}</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface VolumeReportClientProps {
  initialData: VolumeReportData;
}

export function VolumeReportClient({ initialData }: VolumeReportClientProps) {
  const [dateRange, setDateRange] = useState<DateRangePreset>("last_30_days");

  const { data, error, isLoading } = useSWR<VolumeReportData>(
    `/api/reports/volume/analysis?date_preset=${dateRange}`,
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
          <h2 className="text-3xl font-bold tracking-tight">Volume Analysis</h2>
          <p className="text-muted-foreground">
            Ticket volume trends and distribution analysis
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
              <span>Failed to load volume data. Please try again.</span>
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
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Created</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalCreated}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Resolved</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalResolved}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Closed</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalClosed}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Reopened</CardTitle>
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalReopened}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Backlog</CardTitle>
                {data.backlogChange > 0 ? (
                  <TrendingUp className="h-4 w-4 text-red-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                )}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.currentBacklog}</div>
                <p
                  className={`text-xs ${
                    data.backlogChange > 0 ? "text-red-500" : "text-green-500"
                  }`}
                >
                  {data.backlogChange > 0 ? "+" : ""}
                  {data.backlogChange} this period
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg/Day</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.avgTicketsPerDay.toFixed(1)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Peak Day */}
          {data.peakDay && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Peak Day</CardTitle>
                  <CardDescription>
                    Highest ticket volume in the period
                  </CardDescription>
                </div>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-2xl font-bold">
                    {new Intl.DateTimeFormat('en-US', {
                      weekday: "long",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    }).format(new Date(data.peakDay))}
                  </div>
                  <Badge variant="secondary">{data.peakDayCount} tickets</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Distributions */}
          <div className="grid gap-4 md:grid-cols-2">
            {data.dayOfWeekDistribution && data.dayOfWeekDistribution.length > 0 && (
              <DistributionChart
                title="Tickets by Day of Week"
                items={data.dayOfWeekDistribution}
              />
            )}
            {data.hourlyDistribution && data.hourlyDistribution.length > 0 && (
              <DistributionChart
                title="Tickets by Hour"
                items={data.hourlyDistribution.filter((_, i) => i >= 6 && i <= 20)}
              />
            )}
          </div>

          {/* Priority Distribution */}
          {data.byPriority && data.byPriority.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tickets by Priority</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {data.byPriority.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary"
                    >
                      {item.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                      )}
                      <span className="font-medium">{item.label}</span>
                      <Badge variant="outline">{item.value}</Badge>
                      <span className="text-xs text-muted-foreground">
                        ({item.percentage.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Volume Trend */}
          {data.volumeTrend && data.volumeTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Daily Volume Trend</CardTitle>
                <CardDescription>Created vs resolved tickets per day</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {data.volumeTrend.map((item) => (
                    <div
                      key={item.date}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <span className="text-sm font-medium">
                        {new Intl.DateTimeFormat('en-US', {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        }).format(new Date(item.date))}
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm">
                          <span className="text-blue-500">{item.createdCount}</span> created
                        </span>
                        <span className="text-sm">
                          <span className="text-green-500">{item.resolvedCount}</span> resolved
                        </span>
                        <Badge
                          variant={item.netChange > 0 ? "destructive" : "default"}
                          className="w-16 justify-center"
                        >
                          {item.netChange > 0 ? "+" : ""}
                          {item.netChange}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
