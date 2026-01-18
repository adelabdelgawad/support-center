// Lazy-loaded chart components for better performance
// These charts are loaded on-demand only when needed
export { LazyTrendLineChart, LazyDistributionPieChart, LazyDistributionBarChart } from './lazy-charts';

// Direct exports (not recommended - use lazy versions above)
export { TrendLineChart } from './trend-line-chart';
export { DistributionPieChart } from './distribution-pie-chart';
export { DistributionBarChart } from './distribution-bar-chart';
