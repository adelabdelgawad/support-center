"use client";

import { useState } from "react";
import { useAsyncData } from "@/lib/hooks/use-async-data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  PieChart,
} from "lucide-react";
import { LazyTrendLineChart } from "@/components/charts/lazy-charts";

import { getExecutiveDashboard } from "@/lib/api/reports";

import {
  KPICardComponent,
  DistributionChart,
  ReportError,
  PeriodIndicator,
} from "@/lib/reports/components";

import type {
  ExecutiveDashboardData,
  DateRangePreset,
} from "@/types/reports";

interface ReportsDashboardClientProps {
  initialData: ExecutiveDashboardData | null;
}

export function ReportsDashboardClient({ initialData }: ReportsDashboardClientProps) {
  const [datePreset, setDatePreset] = useState<DateRangePreset>("last_30_days");
  const [customStartDate, setCustomStartDate] = useState<string | undefined>();
  const [customEndDate, setCustomEndDate] = useState<string | undefined>();
  const [filters, setFilters] = useState<{
    businessUnitIds?: number[];
  }>({});

  // Build query params using the API client function
  const fetchDashboard = async () => {
    return await getExecutiveDashboard({
      datePreset,
      startDate: customStartDate,
      endDate: customEndDate,
      businessUnitIds: filters.businessUnitIds,
    });
  };

  const { data, error, isLoading } = useAsyncData<ExecutiveDashboardData>(
    fetchDashboard,
    [datePreset, customStartDate, customEndDate, filters.businessUnitIds],
    initialData ?? undefined
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

  return (
    <>
      {error && <ReportError message="Failed to load dashboard data. Please try again." />}

      {data && (
        <div className="space-y-4">
          {/* Period indicator */}
          <PeriodIndicator
              periodStart={data.periodStart}
              periodEnd={data.periodEnd}
              comparisonPeriodStart={data.comparisonPeriodStart}
              comparisonPeriodEnd={data.comparisonPeriodEnd}
            />

          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <KPICardComponent
                kpi={data.totalTickets}
                icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
              />
                <KPICardComponent
                kpi={data.resolvedTickets}
                icon={<CheckCircle className="h-4 w-4 text-green-500" />}
              />
                <KPICardComponent
                kpi={data.openTickets}
                icon={<AlertTriangle className="h-4 w-4 text-yellow-500" />}
              />
                <KPICardComponent
                kpi={data.slaCompliance}
                icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
              />
                <KPICardComponent
                kpi={data.avgResolutionTime}
                icon={<Clock className="h-4 w-4 text-muted-foreground" />}
              />
                <KPICardComponent
                kpi={data.avgFirstResponseTime}
                icon={<Clock className="h-4 w-4 text-muted-foreground" />}
              />
          </div>

          {/* Ticket Volume Trend */}
          {data.ticketVolumeTrend && data.ticketVolumeTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ticket Volume Trend</CardTitle>
                <CardDescription>Daily ticket creation over time</CardDescription>
              </CardHeader>
              <CardContent>
                <LazyTrendLineChart
                  data={data.ticketVolumeTrend}
                  dataKeys={[
                    { key: 'value', name: 'Tickets', color: '#3b82f6' },
                  ]}
                  height={300}
                />
              </CardContent>
            </Card>
          )}

          {/* SLA Compliance Trend */}
          {data.slaComplianceTrend && data.slaComplianceTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>SLA Compliance Trend</CardTitle>
                <CardDescription>Daily SLA compliance rate (%)</CardDescription>
              </CardHeader>
              <CardContent>
                <LazyTrendLineChart
                  data={data.slaComplianceTrend}
                  dataKeys={[
                    { key: 'value', name: 'Compliance %', color: '#22c55e' },
                  ]}
                  height={300}
                />
              </CardContent>
            </Card>
          )}

          {/* Distribution Charts */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <DistributionChart
                title="Tickets by Status"
                items={data.ticketsByStatus}
                icon={<PieChart className="h-4 w-4 text-muted-foreground" />}
                chartType="pie"
              />
                <DistributionChart
                title="Tickets by Priority"
                items={data.ticketsByPriority}
                icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
                chartType="bar"
              />
              {data.ticketsByCategory && data.ticketsByCategory.length > 0 && (
                  <DistributionChart
                  title="Tickets by Category"
                  items={data.ticketsByCategory}
                  icon={<PieChart className="h-4 w-4 text-muted-foreground" />}
                  chartType="pie"
                />
              )}
              {data.ticketsByBusinessUnit && data.ticketsByBusinessUnit.length > 0 && (
                  <DistributionChart
                  title="Tickets by Business Unit"
                  items={data.ticketsByBusinessUnit}
                  icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
                  chartType="bar"
                />
              )}
          </div>

          {/* Top Technicians */}
          {data.topTechnicians && data.topTechnicians.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Top Performers</CardTitle>
                  <CardDescription>Technicians ranked by tickets resolved</CardDescription>
                </div>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                {data.topTechnicians.slice(0, 5).map((tech) => (
                  <div
                    key={tech.technicianId}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        {tech.rank}
                      </div>
                      <div>
                        <p className="font-medium">
                          {tech.fullName || tech.technicianName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tech.ticketsResolved} resolved / {tech.ticketsAssigned} assigned
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{tech.resolutionRate.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">Resolution Rate</p>
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
