"use client";

import { ChevronLeft, ChevronRight, UsersRound, Wrench, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusCircle } from "@/components/data-table";
import { RoleStatusFilter } from "../filters/role-status-filter";
import React, { useState } from "react";
import type { RoleResponse } from "@/types/roles";

type StatusPanelProps = {
  roles?: RoleResponse[];
  // Scoped role counts (filtered by User Type AND Status)
  roleCounts?: Record<string, number>;
  // User type counts
  technicianCount?: number;
  userCount?: number;
  totalCount?: number;
};

export const StatusPanel: React.FC<StatusPanelProps> = ({
  roles = [],
  roleCounts = {},
  technicianCount = 0,
  userCount = 0,
  totalCount = 0,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const technicianPercentage = totalCount ? (technicianCount / totalCount) * 100 : 0;

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
            {/* User Type Section - Expanded */}
            <div className="px-4 py-6">
              <div className="flex flex-col items-center">
                <StatusCircle
                  count={totalCount}
                  color="#6b7280"
                  label="All Users"
                  size="lg"
                  icon={UsersRound}
                  showLabel={true}
                  percentage={technicianPercentage}
                  statusValue="all"
                  queryParam="user_type"
                />
              </div>
            </div>
            <div className="px-4 pb-6">
              <div className="grid grid-cols-2 gap-12">
                <StatusCircle
                  count={technicianCount}
                  color="#3b82f6"
                  label="Technicians"
                  size="md"
                  icon={Wrench}
                  statusValue="technicians"
                  queryParam="user_type"
                />
                <StatusCircle
                  count={userCount}
                  color="#8b5cf6"
                  label="Users"
                  size="md"
                  icon={Users}
                  statusValue="users"
                  queryParam="user_type"
                />
              </div>
            </div>

            {/* Role Filter */}
            {roles.length > 0 && (
              <div className="border-t border-border pt-4">
                <RoleStatusFilter roles={roles} roleCounts={roleCounts} />
              </div>
            )}
          </>
        ) : (
          <>
            {/* User Type Section - Collapsed */}
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={totalCount}
                color="#6b7280"
                label="All Users"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="all"
                queryParam="user_type"
              />
            </div>
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={technicianCount}
                color="#3b82f6"
                label="Technicians"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="technicians"
                queryParam="user_type"
              />
            </div>
            <div className="py-3 border-b border-border flex justify-center">
              <StatusCircle
                count={userCount}
                color="#8b5cf6"
                label="Users"
                size="sm"
                showLabel={false}
                showTooltip={true}
                statusValue="users"
                queryParam="user_type"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
