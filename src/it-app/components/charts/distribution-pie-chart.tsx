'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { DistributionItem } from '@/types/reports';

interface DistributionPieChartProps {
  data: DistributionItem[];
  height?: number;
  showLegend?: boolean;
  innerRadius?: number;
}

// Fluent UI color palette for charts
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

export function DistributionPieChart({
  data,
  height = 300,
  showLegend = true,
  innerRadius = 0,
}: DistributionPieChartProps) {
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

  const chartData = data.map((item) => ({
    name: item.label,
    value: item.value,
    percentage: item.percentage,
  }));

  const COLORS = data.map(
    (item, index) => item.color || FLUENT_CHART_COLORS[index % FLUENT_CHART_COLORS.length]
  );

  // Custom label renderer with Fluent UI styling
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percentage }: any) => {
    if (percentage < 5) return null; // Don't show labels for small slices

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        style={{
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: 'var(--font-sans)',
        }}
      >
        {`${percentage.toFixed(0)}%`}
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart className="duration-normal ease-fluent-standard">
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={renderLabel}
          outerRadius={innerRadius ? 80 : 90}
          innerRadius={innerRadius}
          fill="#8884d8"
          dataKey="value"
          animationDuration={600}
          animationEasing="ease-out"
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            />
          ))}
        </Pie>
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
          formatter={(value: any, name: any, props: any) => [
            `${value ?? 0} (${props.payload.percentage.toFixed(1)}%)`,
            name ?? '',
          ]}
        />
        {showLegend && (
          <Legend
            wrapperStyle={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
            }}
            iconType="circle"
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}
