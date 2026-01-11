"use client";

import { useCallback, useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataTable, DynamicTableBar, Pagination } from "@/components/data-table";
import { toast } from "sonner";
import type { DeploymentJobListResponse, DeploymentJobListItem } from "@/types/deployment-job";
import { createJobsTableColumns } from "./jobs-table-columns";

interface JobsTabProps {
  initialData: DeploymentJobListResponse | null;
}

export function JobsTab({ initialData }: JobsTabProps) {
  const searchParams = useSearchParams();
  const page = Number(searchParams?.get("page") || "1");
  const limit = Number(searchParams?.get("limit") || "10");

  // Use useState with initialData (like settings pages)
  const [data, setData] = useState<DeploymentJobListResponse>(
    initialData ?? { jobs: [], total: 0 }
  );
  const [isLoading, setIsLoading] = useState(false);

  // Sync with initialData when it changes (server-side update)
  useEffect(() => {
    if (initialData) {
      setData(initialData);
    }
  }, [initialData]);

  // Auto-refresh every 10 seconds for job status updates
  useEffect(() => {
    const interval = setInterval(() => {
      handleRefresh();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const allJobs = data.jobs;

  // Paginate the jobs
  const paginatedJobs = useMemo(() => {
    const startIndex = (page - 1) * limit;
    return allJobs.slice(startIndex, startIndex + limit);
  }, [allJobs, page, limit]);

  /**
   * Fetch fresh data from server
   */
  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/management/deployment-jobs", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch jobs");
      }
      const freshData: DeploymentJobListResponse = await response.json();
      setData(freshData);
    } catch (error) {
      // Silent fail for auto-refresh, only show error for manual refresh
      console.error("Failed to refresh jobs:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Manual refresh with toast
   */
  const handleManualRefresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/management/deployment-jobs", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch jobs");
      }
      const freshData: DeploymentJobListResponse = await response.json();
      setData(freshData);
      toast.success("Jobs refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create columns
  const columns = useMemo(() => createJobsTableColumns(), []);

  const totalItems = allJobs.length;
  const totalPages = Math.ceil(totalItems / limit);

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col min-h-0 space-y-2">
        {/* Toolbar */}
        <DynamicTableBar
          variant="controller"
          hasSelection={false}
          left={
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {totalItems} jobs
              </span>
              {isLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          }
          right={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          }
        />

        {/* Data Table */}
        <div className="flex-1 min-h-0 flex flex-col">
          <DataTable
            _data={paginatedJobs}
            columns={columns}
            renderToolbar={() => null}
            enableRowSelection={false}
            enableSorting={false}
            _isLoading={isLoading && allJobs.length === 0}
          />
        </div>

        {/* Pagination */}
        {totalItems > 0 && (
          <div className="shrink-0 bg-card border-t border-border">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={limit}
              totalItems={totalItems}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
