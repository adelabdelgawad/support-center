"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LazyDistributionPieChart, LazyDistributionBarChart } from "@/components/charts/lazy-charts";

import type { DistributionItem } from "@/types/reports";

interface DistributionChartProps {
  title: string;
  items: DistributionItem[];
  icon: React.ReactNode;
  chartType?: "pie" | "bar";
}

export function DistributionChart({
  title,
  items,
  icon,
  chartType = "pie",
}: DistributionChartProps) {
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
          <LazyDistributionPieChart data={items} height={300} />
        ) : (
          <LazyDistributionBarChart data={items} height={300} />
        )}
      </CardContent>
    </Card>
  );
}

interface SimpleDistributionChartProps {
  title: string;
  items: DistributionItem[];
}

/**
 * Simpler bar chart without lazy loading, using native div bars
 */
export function SimpleDistributionChart({
  title,
  items,
}: SimpleDistributionChartProps) {
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
