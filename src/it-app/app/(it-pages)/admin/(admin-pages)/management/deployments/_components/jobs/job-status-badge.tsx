"use client";

import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Play,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { DeploymentJobStatus } from "@/types/deployment-job";

interface JobStatusBadgeProps {
  status: DeploymentJobStatus;
}

const statusConfig: Record<
  DeploymentJobStatus,
  {
    label: string;
    className: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  queued: {
    label: "Queued",
    className: "bg-gray-500 hover:bg-gray-600 text-white border-transparent",
    icon: Clock,
  },
  in_progress: {
    label: "In Progress",
    className: "bg-blue-500 hover:bg-blue-600 text-white border-transparent",
    icon: Play,
  },
  done: {
    label: "Done",
    className: "bg-green-500 hover:bg-green-600 text-white border-transparent",
    icon: CheckCircle,
  },
  failed: {
    label: "Failed",
    className: "bg-red-500 hover:bg-red-600 text-white border-transparent",
    icon: XCircle,
  },
};

export function JobStatusBadge({ status }: JobStatusBadgeProps) {
  const config = statusConfig[status];
  if (!config) {
    return <Badge variant="outline">{status}</Badge>;
  }

  const Icon = config.icon;

  return (
    <Badge className={config.className}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}
