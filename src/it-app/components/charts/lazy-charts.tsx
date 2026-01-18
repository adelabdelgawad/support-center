'use client';

import dynamic from 'next/dynamic';

// Chart skeleton component for loading state
function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center bg-muted/20 rounded-md animate-pulse"
      style={{ height }}
    >
      <div className="text-center">
        <div className="h-4 w-24 bg-muted rounded mx-auto mb-2" />
        <div className="h-3 w-16 bg-muted rounded mx-auto" />
      </div>
    </div>
  );
}

// Lazy load bar chart (~12KB gzipped)
export const LazyDistributionBarChart = dynamic(
  () => import('./distribution-bar-chart').then(mod => ({ default: mod.DistributionBarChart })),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

// Lazy load pie chart (~11KB gzipped)
export const LazyDistributionPieChart = dynamic(
  () => import('./distribution-pie-chart').then(mod => ({ default: mod.DistributionPieChart })),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

// Lazy load line chart (~12KB gzipped)
export const LazyTrendLineChart = dynamic(
  () => import('./trend-line-chart').then(mod => ({ default: mod.TrendLineChart })),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);
