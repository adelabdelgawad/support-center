"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusCircle } from "@/components/data-table/ui/status-circle";

type EventsPanelProps = {
  total: number;
  activeCount: number;
  inactiveCount: number;
};

export const EventsPanel: React.FC<EventsPanelProps> = ({
  total,
  activeCount,
  inactiveCount,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const activePercentage = total ? (activeCount / total) * 100 : 0;

  return (
    <div
      className={`bg-background border border-border shadow-sm rounded-md h-full flex flex-col transition-all duration-300 relative min-h-0 ${
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
          variant="outline"
          className="w-6 h-12 rounded-md transition-all p-0"
        >
          {isExpanded ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-y-auto p-4">
        {isExpanded ? (
          <>
            <div className="px-4 py-6">
              <div className="flex flex-col items-center">
                <StatusCircle
                  count={total}
                  color="#6b7280"
                  label="Events"
                  size="lg"
                  icon={Calendar}
                  showLabel={true}
                  percentage={activePercentage}
                  statusValue="all"
                  queryParam="is_active"
                />
              </div>
            </div>
            <div className="px-4 pb-6">
              <div className="grid grid-cols-2 gap-12">
                <StatusCircle
                  count={activeCount}
                  color="#22c55e"
                  label="Active"
                  size="md"
                  statusValue="true"
                  queryParam="is_active"
                />
                <StatusCircle
                  count={inactiveCount}
                  color="#ef4444"
                  label="Inactive"
                  size="md"
                  statusValue="false"
                  queryParam="is_active"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={total}
                color="#6b7280"
                label="All Events"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="all"
                queryParam="is_active"
              />
            </div>
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={activeCount}
                color="#22c55e"
                label="Active"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="true"
                queryParam="is_active"
              />
            </div>
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={inactiveCount}
                color="#ef4444"
                label="Inactive"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="false"
                queryParam="is_active"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
