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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

import { ReportError } from "@/lib/reports/components";
import { PeriodIndicator } from "@/lib/reports/components";
import { useReportsFilter } from "../../_context/reports-filter-context";

import type { SLAComplianceData } from "@/types/reports";
import { getSLAComplianceReport } from "@/lib/api/reports";

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

interface SLAReportClientProps {
  initialData: SLAComplianceData;
}

export function SLAReportClient({ initialData }: SLAReportClientProps) {
  const { datePreset, registerExport, clearExport } = useReportsFilter();

  const fetchSLA = async () => {
    return await getSLAComplianceReport({ datePreset });
  };

  const { data, error, isLoading } = useAsyncData<SLAComplianceData>(
    fetchSLA,
    [datePreset],
    initialData
  );

  useEffect(() => {
    if (data) {
      registerExport({ reportTitle: "SLA Compliance Report", reportData: data });
    }
    return () => clearExport();
  }, [data, registerExport, clearExport]);

  return (
    <>
      {error && <ReportError message="Failed to load SLA data. Please try again." />}

      {data && (
        <div className="space-y-6">
          {/* Period indicator */}
          <PeriodIndicator
            periodStart={data.periodStart}
            periodEnd={data.periodEnd}
          />

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
                          {new Date(breach.createdAt).toLocaleDateString()}
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
    </>
  );
}
