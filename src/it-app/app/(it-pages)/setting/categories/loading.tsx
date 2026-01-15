import { Skeleton } from "@/components/ui/skeleton";

export default function CategoriesLoading() {
  return (
    <div className="h-full w-full p-1 bg-muted">
      <div className="h-full flex flex-col space-y-2">
        {/* Header skeleton */}
        <div className="flex items-center justify-between p-4 bg-background rounded-md">
          <div className="flex items-center gap-4">
            <Skeleton className="h-9 w-[200px]" />
            <Skeleton className="h-9 w-[100px]" />
          </div>
          <Skeleton className="h-9 w-[120px]" />
        </div>

        {/* Table skeleton */}
        <div className="flex-1 bg-background rounded-md p-4">
          <div className="space-y-3">
            {/* Table header */}
            <div className="flex items-center gap-4 pb-3 border-b">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-[150px]" />
              <Skeleton className="h-4 w-[150px]" />
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-4 w-[80px]" />
              <Skeleton className="h-4 w-[80px]" />
            </div>

            {/* Table rows */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-3">
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 w-[150px]" />
                <Skeleton className="h-4 w-[150px]" />
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-6 w-[80px]" />
                <Skeleton className="h-8 w-[80px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
