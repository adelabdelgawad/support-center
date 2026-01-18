"use client";

import { ChevronLeft, ChevronRight, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusCircle } from "@/components/data-table";
import { useState } from "react";

type SchedulerStatusPanelProps = {
  isRunning: boolean;
  totalJobs: number;
  enabledJobs: number;
  runningJobs: number;
};

export const SchedulerStatusPanel: React.FC<SchedulerStatusPanelProps> = ({
  isRunning,
  totalJobs,
  enabledJobs,
  runningJobs,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const enabledPercentage = totalJobs ? (enabledJobs / totalJobs) * 100 : 0;

  return (
    <div
      className={`bg-card shadow-lg h-full flex flex-col transition-all duration-300 relative min-h-0 ${
        isExpanded ? "w-80" : "w-20"
      }`}
    >
      {/* Toggle Arrow Button */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 z-20 transition-all ${
          isExpanded ? "-right-3" : "left-0"
        }`}
      >
        <Button
          onClick={() => setIsExpanded(!isExpanded)}
          size="icon"
          variant="ghost"
          className="w-6 h-12 rounded-md bg-card hover:bg-accent transition-all p-0 border border-border shadow-sm"
        >
          {isExpanded ? (
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-y-auto p-4">
        {isExpanded ? (
          <>
            {/* Scheduler Status */}
            <div className="px-4 py-6">
              <div className="flex flex-col items-center">
                <div className="text-center mb-2">
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    Scheduler Status
                  </div>
                  <div className="flex items-center gap-2">
                    {isRunning ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="text-2xl font-bold">
                      {isRunning ? "Running" : "Stopped"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Job Counts */}
            <div className="px-4 pb-6">
              <div className="grid grid-cols-1 gap-8">
                <StatusCircle
                  count={totalJobs}
                  color="#6b7280"
                  label="Total Jobs"
                  size="md"
                  icon={Clock}
                  showLabel={true}
                  percentage={enabledPercentage}
                  statusValue="all"
                  queryParam="status"
                />
                <div className="grid grid-cols-2 gap-6">
                  <StatusCircle
                    count={enabledJobs}
                    color="#22c55e"
                    label="Enabled"
                    size="sm"
                    showLabel={true}
                    statusValue="enabled"
                    queryParam="is_enabled"
                  />
                  <StatusCircle
                    count={runningJobs}
                    color="#3b82f6"
                    label="Running"
                    size="sm"
                    icon={Loader2}
                    showLabel={true}
                    statusValue="running"
                    queryParam="status"
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Collapsed View */}
            <div className="py-3 border-b border-border flex justify-center">
              <div
                className={`relative cursor-pointer group`}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isRunning ? (
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                ) : (
                  <XCircle className="h-8 w-8 text-red-500" />
                )}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-50">
                  <div className="bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-md whitespace-nowrap">
                    {isRunning ? "Running" : "Stopped"}
                  </div>
                </div>
              </div>
            </div>
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={totalJobs}
                color="#6b7280"
                label="Total Jobs"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="all"
                queryParam="status"
              />
            </div>
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={enabledJobs}
                color="#22c55e"
                label="Enabled"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="enabled"
                queryParam="is_enabled"
              />
            </div>
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={runningJobs}
                color="#3b82f6"
                label="Running"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="running"
                queryParam="status"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
