"use client";

import { useEffect } from "react";
import { useAsyncData } from "@/lib/hooks/use-async-data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  BarChart3,
} from "lucide-react";

import { ReportError } from "@/lib/reports/components";
import { PeriodIndicator } from "@/lib/reports/components";
import { SimpleDistributionChart } from "@/lib/reports/components";
import { useReportsFilter } from "../../_context/reports-filter-context";

import type { VolumeReportData } from "@/types/reports";
import { getVolumeAnalysisReport } from "@/lib/api/reports";

interface VolumeReportClientProps {
  initialData: VolumeReportData;
}

export function VolumeReportClient({ initialData }: VolumeReportClientProps) {
  const { datePreset, customStartDate, customEndDate, filters, registerExport, clearExport } = useReportsFilter();

  const fetchParams = {
    datePreset,
    startDate: customStartDate,
    endDate: customEndDate,
    ...filters,
  };

  const fetchVolume = async () => {
    return await getVolumeAnalysisReport(fetchParams);
  };

  const { data, error, isLoading } = useAsyncData<VolumeReportData>(
    fetchVolume,
    [fetchParams],
    initialData
  );

  useEffect(() => {
    if (data) {
      registerExport({ reportTitle: "Volume Analysis Report", reportData: data });
    }
    return () => clearExport();
  }, [data, registerExport, clearExport]);

  return (
    <>
      {error && <ReportError message="Failed to load volume data. Please try again." />}

      {data && (
        <div className="space-y-6">
          {/* Period indicator */}
          <PeriodIndicator
            periodStart={data.periodStart}
            periodEnd={data.periodEnd}
          />

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
              <SimpleDistributionChart
                title="Tickets by Day of Week"
                items={data.dayOfWeekDistribution}
              />
            )}
            {data.hourlyDistribution && data.hourlyDistribution.length > 0 && (
              <SimpleDistributionChart
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
    </>
  );
}
