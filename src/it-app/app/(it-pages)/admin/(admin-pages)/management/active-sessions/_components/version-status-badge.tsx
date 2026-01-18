"use client";

import { AlertTriangle, CheckCircle, AlertCircle, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { VersionStatus } from "@/types/sessions";

interface VersionStatusBadgeProps {
  status: VersionStatus | undefined;
  targetVersion?: string | null;
}

interface StatusConfig {
  variant: "default" | "secondary" | "destructive" | "outline";
  color: string;
  label: string;
  icon: React.ReactNode;
  tooltipMessage: string;
}

/**
 * Version status badge with color coding for Version Authority system.
 *
 * Visual indicators only (Capability 1 - Soft Enforcement):
 * - ok: green - Client is on latest or acceptable version
 * - outdated: yellow - Newer version available (soft notification)
 * - outdated_enforced: red with icon - Update required (enforced policy)
 * - unknown: gray - Version not in registry
 */
export function VersionStatusBadge({ status, targetVersion }: VersionStatusBadgeProps) {
  const config: Record<string, StatusConfig> = {
    ok: {
      variant: "default",
      color: "bg-green-500 hover:bg-green-600",
      label: "Up to date",
      icon: <CheckCircle className="size-3" />,
      tooltipMessage: "Client is running the latest version.",
    },
    outdated: {
      variant: "secondary",
      color: "bg-yellow-500 hover:bg-yellow-600 text-black",
      label: "Update available",
      icon: <AlertCircle className="size-3" />,
      tooltipMessage: "A newer version is available.",
    },
    outdated_enforced: {
      variant: "destructive",
      color: "bg-red-600 hover:bg-red-700 ring-2 ring-red-300",
      label: "Update required",
      icon: <AlertTriangle className="size-3" />,
      tooltipMessage: "This version is no longer allowed. Update required.",
    },
    unknown: {
      variant: "outline",
      color: "bg-gray-400 hover:bg-gray-500 text-white",
      label: "Unknown",
      icon: <HelpCircle className="size-3" />,
      tooltipMessage: "Version not found in registry.",
    },
  };

  // Default to unknown if status is undefined or not recognized
  const statusKey = status && config[status] ? status : "unknown";
  const { variant, color, label, icon, tooltipMessage } = config[statusKey];

  // Build tooltip with target version info if available
  const tooltip = targetVersion
    ? `${tooltipMessage} Target: v${targetVersion}`
    : tooltipMessage;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={variant}
          className={`${color} text-white cursor-help`}
        >
          {icon}
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
