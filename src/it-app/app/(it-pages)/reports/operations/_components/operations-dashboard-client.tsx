'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { DateRangePicker } from '@/components/reports/date-range-picker';
import { ReportFilters } from '@/components/reports/report-filters';
import { ExportButton } from '@/components/reports/export-button';
import { LazyTrendLineChart, LazyDistributionBarChart, LazyDistributionPieChart } from '@/components/charts/lazy-charts';
import { getOperationsDashboard } from '@/lib/api/reports';
import { DateRangePreset, VolumeReportData } from '@/types/reports';
import { formatDate } from '@/lib/utils/date-formatting';

interface OperationsDashboardClientProps {
  initialData: VolumeReportData;
}

export default function OperationsDashboardClient({ initialData }: OperationsDashboardClientProps) {
  const [datePreset, setDatePreset] = useState<DateRangePreset>('last_30_days');
  const [customStartDate, setCustomStartDate] = useState<string | undefined>();
  const [customEndDate, setCustomEndDate] = useState<string | undefined>();
  const [filters, setFilters] = useState<{
    businessUnitIds?: number[];
    technicianIds?: string[];
    priorityIds?: number[];
    statusIds?: number[];
  }>({});

  const { data, error, isLoading } = useSWR<VolumeReportData>(
    ['/api/reports/operations', datePreset, customStartDate, customEndDate, filters],
    () =>
      getOperationsDashboard({
        datePreset,
        startDate: customStartDate,
        endDate: customEndDate,
        ...filters,
      }),
    {
      fallbackData: initialData,
      revalidateIfStale: false,
      refreshInterval: 300000, // 5 minutes
      revalidateOnFocus: true,
    }
  );

  const handlePresetChange = (preset: DateRangePreset) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      setCustomStartDate(undefined);
      setCustomEndDate(undefined);
    }
  };

  const handleCustomRangeChange = (startDate: string, endDate: string) => {
    setCustomStartDate(startDate);
    setCustomEndDate(endDate);
    setDatePreset('custom');
  };

  const handleFiltersChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
  };

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load operations dashboard data. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Operations Dashboard</h1>
          <p className="text-muted-foreground">
            Ticket volume, trends, and operational metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && <ExportButton reportTitle="Operations Dashboard" reportData={data} />}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4">
        <DateRangePicker
          preset={datePreset}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onPresetChange={handlePresetChange}
          onCustomRangeChange={handleCustomRangeChange}
        />
        <ReportFilters
          selectedBusinessUnitIds={filters.businessUnitIds}
          selectedTechnicianIds={filters.technicianIds}
          selectedPriorityIds={filters.priorityIds}
          selectedStatusIds={filters.statusIds}
          onFiltersChange={handleFiltersChange}
        />
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
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
      ) : data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Created
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalCreated}</div>
                <p className="text-xs text-muted-foreground mt-1">Tickets created in period</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Resolved
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalResolved}</div>
                <p className="text-xs text-muted-foreground mt-1">Tickets resolved in period</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Closed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalClosed}</div>
                <p className="text-xs text-muted-foreground mt-1">Tickets closed in period</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Reopened
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.totalReopened}</div>
                <p className="text-xs text-muted-foreground mt-1">Tickets reopened</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Current Backlog
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className="text-2xl font-bold">{data.currentBacklog}</div>
                  {data.backlogChange !== 0 && (
                    <div
                      className={`flex items-center text-sm ${
                        data.backlogChange > 0 ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      {data.backlogChange > 0 ? (
                        <TrendingUp className="h-4 w-4 mr-1" />
                      ) : (
                        <TrendingDown className="h-4 w-4 mr-1" />
                      )}
                      {Math.abs(data.backlogChange)}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Open tickets</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Avg Per Day
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.avgTicketsPerDay}</div>
                <p className="text-xs text-muted-foreground mt-1">Tickets created daily</p>
              </CardContent>
            </Card>
          </div>

          {/* Peak Day */}
          {data.peakDay && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Peak Volume Day</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div>
                    <div className="text-3xl font-bold">{data.peakDayCount}</div>
                    <p className="text-sm text-muted-foreground">tickets</p>
                  </div>
                  <div className="text-muted-foreground">on</div>
                  <div>
                    <div className="text-lg font-semibold">
                      {formatDate(data.peakDay)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(data.peakDay))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Volume Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Volume Trend</CardTitle>
              <CardDescription>Created vs Resolved tickets per day</CardDescription>
            </CardHeader>
            <CardContent>
              {data.volumeTrend && data.volumeTrend.length > 0 ? (
                <LazyTrendLineChart
                  data={data.volumeTrend.map((item) => ({
                    date: item.date,
                    created: item.createdCount,
                    resolved: item.resolvedCount,
                  }))}
                  dataKeys={[
                    { key: 'created', name: 'Created', color: '#3b82f6' },
                    { key: 'resolved', name: 'Resolved', color: '#22c55e' },
                  ]}
                  height={350}
                />
              ) : (
                <div className="text-center text-muted-foreground py-8">No trend data available</div>
              )}
            </CardContent>
          </Card>

          {/* Distributions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Day of Week Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Volume by Day of Week</CardTitle>
                <CardDescription>Ticket distribution across weekdays</CardDescription>
              </CardHeader>
              <CardContent>
                {data.dayOfWeekDistribution && data.dayOfWeekDistribution.length > 0 ? (
                  <LazyDistributionBarChart
                    data={data.dayOfWeekDistribution}
                    height={300}
                  />
                ) : (
                  <div className="text-center text-muted-foreground py-8">No data available</div>
                )}
              </CardContent>
            </Card>

            {/* Hourly Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Volume by Hour</CardTitle>
                <CardDescription>Ticket submission by time of day</CardDescription>
              </CardHeader>
              <CardContent>
                {data.hourlyDistribution && data.hourlyDistribution.length > 0 ? (
                  <LazyDistributionBarChart
                    data={data.hourlyDistribution.filter((item) => {
                      const hour = parseInt(item.label.split(':')[0]);
                      return hour >= 6 && hour <= 20;
                    })}
                    height={300}
                  />
                ) : (
                  <div className="text-center text-muted-foreground py-8">No data available</div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
