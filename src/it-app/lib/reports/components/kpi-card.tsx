"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";

import type { KPICard } from "@/types/reports";

interface KPICardComponentProps {
  kpi: KPICard;
  icon: React.ReactNode;
}

export function KPICardComponent({ kpi, icon }: KPICardComponentProps) {
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
