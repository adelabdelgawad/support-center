"use client";

import { Badge } from "@/components/ui/badge";
import {
  Search,
  Clock,
  Download,
  UserCheck,
  Shield,
  ShieldAlert,
} from "lucide-react";
import type { DeviceLifecycleState } from "@/types/device";

interface DeviceLifecycleBadgeProps {
  state: DeviceLifecycleState;
}

const lifecycleConfig: Record<
  DeviceLifecycleState,
  {
    label: string;
    className: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  discovered: {
    label: "Discovered",
    className: "bg-blue-500 hover:bg-blue-600 text-white border-transparent",
    icon: Search,
  },
  install_pending: {
    label: "Install Pending",
    className: "bg-yellow-500 hover:bg-yellow-600 text-white border-transparent",
    icon: Clock,
  },
  installed_unenrolled: {
    label: "Installed",
    className: "bg-orange-500 hover:bg-orange-600 text-white border-transparent",
    icon: Download,
  },
  enrolled: {
    label: "Enrolled",
    className: "bg-green-500 hover:bg-green-600 text-white border-transparent",
    icon: UserCheck,
  },
  managed: {
    label: "Managed",
    className: "bg-green-600 hover:bg-green-700 text-white border-transparent",
    icon: Shield,
  },
  quarantined: {
    label: "Quarantined",
    className: "bg-red-500 hover:bg-red-600 text-white border-transparent",
    icon: ShieldAlert,
  },
};

export function DeviceLifecycleBadge({ state }: DeviceLifecycleBadgeProps) {
  const config = lifecycleConfig[state];
  if (!config) {
    return <Badge variant="outline">{state}</Badge>;
  }

  const Icon = config.icon;

  return (
    <Badge className={config.className}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}
