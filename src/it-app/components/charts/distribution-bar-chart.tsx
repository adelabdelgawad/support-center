'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { DistributionItem } from '@/types/reports';

interface DistributionBarChartProps {
  data: DistributionItem[];
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  horizontal?: boolean;
}

// Fluent UI color palette
const FLUENT_CHART_COLORS = [
  '#0078d4', // Primary Blue
  '#00bcf2', // Cyan
  '#8764b8', // Purple
  '#00b294', // Teal
  '#ffb900', // Gold
  '#d13438', // Red
  '#00b7c3', // Light Blue
  '#8a8886', // Gray
  '#498205', // Green
  '#ff8c00', // Orange
];

export function DistributionBarChart({
  data,
  height = 300,
  showGrid = true,
  showLegend = false,
  horizontal = false,
}: DistributionBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        <div className="text-center">
          <p className="text-sm font-medium">No data available</p>
          <p className="text-xs mt-1">No distribution data for the selected period</p>
        </div>
      </div>
    );
  }

  const chartData = data.map((item, index) => ({
    name: item.label,
    value: item.value,
    percentage: item.percentage,
    fill: item.color || FLUENT_CHART_COLORS[index % FLUENT_CHART_COLORS.length],
  }));

  const layout = horizontal ? 'horizontal' : 'vertical';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        layout={layout as any}
        margin={{ top: 5, right: 30, left: horizontal ? 80 : 20, bottom: 5 }}
        className="duration-normal ease-fluent-standard"
      >
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            opacity={0.3}
          />
        )}
        {horizontal ? (
          <>
            <XAxis
              type="number"
              tick={{
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 12,
                fontFamily: 'var(--font-sans)'
              }}
              stroke="hsl(var(--border))"
              axisLine={{ strokeWidth: 1 }}
            />
            <YAxis
              dataKey="name"
              type="category"
              tick={{
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 12,
                fontFamily: 'var(--font-sans)'
              }}
              stroke="hsl(var(--border))"
              axisLine={{ strokeWidth: 1 }}
              width={100}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="name"
              tick={{
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 12,
                fontFamily: 'var(--font-sans)',
                angle: data.length > 5 ? -45 : 0,
                textAnchor: data.length > 5 ? 'end' : 'middle',
              } as any}
              stroke="hsl(var(--border))"
              axisLine={{ strokeWidth: 1 }}
              height={data.length > 5 ? 80 : 30}
            />
            <YAxis
              tick={{
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 12,
                fontFamily: 'var(--font-sans)'
              }}
              stroke="hsl(var(--border))"
              axisLine={{ strokeWidth: 1 }}
            />
          </>
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-8)',
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
          }}
          labelStyle={{
            color: 'hsl(var(--foreground))',
            fontWeight: 600,
            marginBottom: '4px',
          }}
          itemStyle={{
            color: 'hsl(var(--muted-foreground))',
          }}
          formatter={(value: number | undefined, name: string | undefined, props: any) => [
            `${value ?? 0} (${props.payload.percentage.toFixed(1)}%)`,
            'Count',
          ]}
          cursor={{ fill: 'hsl(var(--muted) / 0.2)' }}
        />
        {showLegend && (
          <Legend
            wrapperStyle={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
            }}
          />
        )}
        <Bar
          dataKey="value"
          fill="#8884d8"
          radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          animationDuration={600}
          animationEasing="ease-out"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
