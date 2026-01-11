'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatChartDate } from '@/lib/utils/date-formatting';

interface TrendLineChartProps {
  data: Array<{ date: string; [key: string]: any }>;
  dataKeys: {
    key: string;
    name: string;
    color: string;
  }[];
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
}

// Fluent UI color palette
const FLUENT_COLORS = {
  primary: '#0078d4',
  secondary: '#00bcf2',
  tertiary: '#8764b8',
  success: '#00b294',
  warning: '#ffb900',
};

export function TrendLineChart({
  data,
  dataKeys,
  height = 300,
  showGrid = true,
  showLegend = true,
}: TrendLineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        <div className="text-center">
          <p className="text-sm font-medium">No data available</p>
          <p className="text-xs mt-1">No trend data for the selected period</p>
        </div>
      </div>
    );
  }

  // Format date for display
  const formatXAxis = (value: any) => {
    try {
      return formatChartDate(value);
    } catch {
      return value;
    }
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        className="duration-normal ease-fluent-standard"
      >
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            opacity={0.3}
          />
        )}
        <XAxis
          dataKey="date"
          tickFormatter={formatXAxis}
          tick={{
            fill: 'hsl(var(--muted-foreground))',
            fontSize: 12,
            fontFamily: 'var(--font-sans)'
          }}
          stroke="hsl(var(--border))"
          axisLine={{ strokeWidth: 1 }}
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
          cursor={{
            stroke: 'hsl(var(--border))',
            strokeWidth: 1,
            strokeDasharray: '4 4',
          }}
        />
        {showLegend && (
          <Legend
            wrapperStyle={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
            }}
          />
        )}
        {dataKeys.map((key, index) => (
          <Line
            key={key.key}
            type="monotone"
            dataKey={key.key}
            stroke={key.color || Object.values(FLUENT_COLORS)[index % 5]}
            name={key.name}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 2, fill: 'hsl(var(--card))' }}
            activeDot={{ r: 5, strokeWidth: 0 }}
            animationDuration={400}
            animationEasing="ease-in-out"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
