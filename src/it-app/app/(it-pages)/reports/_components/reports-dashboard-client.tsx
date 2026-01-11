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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowUp,
  ArrowDown,
  Minus,
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  PieChart,
  FileText,
} from "lucide-react";
import Link from "next/link";

import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ReportFilters } from "@/components/reports/report-filters";
import { ExportButton } from "@/components/reports/export-button";
import { TrendLineChart, DistributionPieChart, DistributionBarChart } from "@/components/charts";
import { formatDate } from "@/lib/utils/date-formatting";

import type {
  ExecutiveDashboardData,
  KPICard,
  DateRangePreset,
  DistributionItem,
} from "@/types/reports";

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch data");
  }
  return response.json();
};


function KPICardComponent({ kpi, icon }: { kpi: KPICard; icon: React.ReactNode }) {
  const getTrendIcon = () => {
    if (!kpi.trendDirection || kpi.trendDirection === "stable") {
      return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
    if (kpi.trendDirection === "up") {
      return <ArrowUp className="h-4 w-4 text-green-500" />;
    }
    return <ArrowDown className="h-4 w-4 text-red-500" />;
  };

  const getTrendColor = () => {
    if (!kpi.changePercent) return "text-muted-foreground";
    if (kpi.changePercent > 0) return "text-green-500";
    if (kpi.changePercent < 0) return "text-red-500";
    return "text-muted-foreground";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{kpi.label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {kpi.value.toLocaleString()}
          {kpi.unit && <span className="text-sm font-normal ml-1">{kpi.unit}</span>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {getTrendIcon()}
          <span className={`text-xs ${getTrendColor()}`}>
            {kpi.changePercent !== undefined && kpi.changePercent !== null
              ? `${kpi.changePercent > 0 ? "+" : ""}${kpi.changePercent.toFixed(1)}%`
              : "No change"}
          </span>
          <span className="text-xs text-muted-foreground">vs previous period</span>
        </div>
        {kpi.target !== undefined && (
          <div className="mt-2">
            <Badge variant={kpi.isTargetMet ? "default" : "destructive"}>
              Target: {kpi.target}
              {kpi.unit}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DistributionChart({
  title,
  items,
  icon,
  chartType = "pie",
}: {
  title: string;
  items: DistributionItem[];
  icon: React.ReactNode;
  chartType?: "pie" | "bar";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>Distribution breakdown</CardDescription>
        </div>
        {icon}
      </CardHeader>
      <CardContent>
        {chartType === "pie" ? (
          <DistributionPieChart data={items} height={300} />
        ) : (
          <DistributionBarChart data={items} height={300} />
        )}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-4 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-8 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

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

  // Build query string
  const queryParams = new URLSearchParams();
  queryParams.append('date_preset', datePreset);
  if (customStartDate) queryParams.append('start_date', customStartDate);
  if (customEndDate) queryParams.append('end_date', customEndDate);
  if (filters.businessUnitIds?.length) {
    queryParams.append('business_unit_ids', filters.businessUnitIds.join(','));
  }

  const { data, error, isLoading } = useSWR<ExecutiveDashboardData>(
    `/api/reports/dashboard/executive?${queryParams.toString()}`,
    fetcher,
    {
      fallbackData: initialData ?? undefined,
      revalidateOnFocus: false,
      refreshInterval: 5 * 60 * 1000, // Refresh every 5 minutes
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

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Executive Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor your IT support performance and metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && <ExportButton reportTitle="Executive Dashboard" reportData={data} />}
          <Link href="/reports/saved">
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-2" />
              Saved Reports
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Links to Other Reports */}
      <div className="flex flex-wrap gap-2">
        <Link href="/reports/operations">
          <Button variant="outline" size="sm">Operations Dashboard</Button>
        </Link>
        <Link href="/reports/sla">
          <Button variant="outline" size="sm">SLA Compliance</Button>
        </Link>
        <Link href="/reports/agents">
          <Button variant="outline" size="sm">Agent Performance</Button>
        </Link>
        <Link href="/reports/volume">
          <Button variant="outline" size="sm">Volume Analysis</Button>
        </Link>
        <Link href="/reports/outshift">
          <Button variant="outline" size="sm">Outshift Report</Button>
        </Link>
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
          onFiltersChange={handleFiltersChange}
        />
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span>Failed to load dashboard data. Please try again.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && <LoadingSkeleton />}

      {data && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sla">SLA</TabsTrigger>
            <TabsTrigger value="volume">Volume</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Period indicator */}
            <div className="text-sm text-muted-foreground">
              Period: {formatDate(data.periodStart)} -{" "}
              {formatDate(data.periodEnd)}
              {data.comparisonPeriodStart && (
                <span className="ml-2">
                  (compared to {formatDate(data.comparisonPeriodStart)} -{" "}
                  {formatDate(data.comparisonPeriodEnd!)})
                </span>
              )}
            </div>

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
                  <TrendLineChart
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
                  <TrendLineChart
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
          </TabsContent>

          <TabsContent value="sla" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>SLA Compliance</CardTitle>
                <CardDescription>
                  Service Level Agreement metrics and breach analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    View the SLA Compliance report for detailed breach analysis.
                  </p>
                  <a
                    href="/reports/sla"
                    className="text-primary hover:underline mt-2 inline-block"
                  >
                    Go to SLA Report →
                  </a>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="volume" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Volume Analysis</CardTitle>
                <CardDescription>
                  Ticket volume trends and distribution analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    View the Volume Analysis report for detailed trends.
                  </p>
                  <a
                    href="/reports/volume"
                    className="text-primary hover:underline mt-2 inline-block"
                  >
                    Go to Volume Report →
                  </a>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Agent Performance</CardTitle>
                <CardDescription>
                  Technician performance metrics and rankings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    View the Agent Performance report for detailed analysis.
                  </p>
                  <a
                    href="/reports/agents"
                    className="text-primary hover:underline mt-2 inline-block"
                  >
                    Go to Agent Report →
                  </a>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
