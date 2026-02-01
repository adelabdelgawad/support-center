import { Skeleton } from '@/components/ui/skeleton';

export default function RequestDetailsLoading() {
  return (
    <div className="flex h-full w-full gap-4 p-4">
      <div className="flex-1 space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
      <div className="w-80 space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
