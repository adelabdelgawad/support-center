"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LucideIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface StatusCircleProps {
  count: number;
  color: string;
  label: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showTooltip?: boolean;
  icon?: LucideIcon;
  percentage?: number;
  statusValue?: string;
  queryParam?: string;
}

export function StatusCircle({
  count,
  color,
  label,
  size = "md",
  showLabel = true,
  showTooltip = false,
  icon: Icon,
  percentage = 75,
  statusValue,
  queryParam = "status",
}: StatusCircleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const sizeClasses: Record<"sm" | "md" | "lg", string> = {
    sm: "w-12 h-12",
    md: "w-24 h-24",
    lg: "w-40 h-40",
  };

  const innerSizeClasses: Record<"sm" | "md" | "lg", string> = {
    sm: "w-10 h-10",
    md: "w-20 h-20",
    lg: "w-36 h-36",
  };

  const textSizes: Record<"sm" | "md" | "lg", string> = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl",
  };

  const iconSizes: Record<"sm" | "md" | "lg", string> = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-10 w-10",
  };

  const labelSizes: Record<"sm" | "md" | "lg", string> = {
    sm: "text-xs",
    md: "text-xs",
    lg: "text-xs",
  };

  const handleClick = () => {
    if (!statusValue) {
      return;
    }

    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString());

      if (statusValue === "all") {
        params.delete(queryParam);
      } else {
        params.set(queryParam, statusValue);
      }

      params.set("page", "1");
      router.push(`?${params.toString()}`);
    });
  };

  const currentValue = searchParams?.get(queryParam);

  const isActive =
    statusValue === "all" ? !currentValue : currentValue === statusValue;

  const gradientDegrees = (percentage / 100) * 360;
  const conicGradient =
    size === "lg"
      ? `conic-gradient(${color} 0deg, ${color} ${gradientDegrees}deg, hsl(var(--muted)) ${gradientDegrees}deg)`
      : undefined;

  const circle = (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center cursor-pointer transition-all ${
          size === "lg" ? "" : "shadow-md bg-background border-4 font-bold"
        } ${
          isActive
            ? "opacity-100 scale-105"
            : "opacity-60 hover:opacity-80 hover:scale-102"
        }`}
        style={
          size === "lg"
            ? { background: conicGradient }
            : { borderColor: color, color: color }
        }
        onClick={handleClick}
      >
        {size === "lg" ? (
          <div
            className={`${innerSizeClasses[size]} bg-background rounded-full flex flex-col items-center justify-center`}
          >
            {Icon && <Icon className={`${iconSizes[size]} text-foreground`} />}
            <div
              className={`${textSizes[size]} font-bold text-foreground mt-2`}
            >
              {count}
            </div>
            {showLabel && (
              <div
                className={`${labelSizes[size]} text-muted-foreground font-medium`}
              >
                {label}
              </div>
            )}
          </div>
        ) : (
          <span className={`${textSizes[size]} font-bold`} style={{ color }}>
            {count}
          </span>
        )}
      </div>
      {showLabel && size !== "lg" && (
        <span className="text-xs text-muted-foreground font-medium text-center">
          {label}
        </span>
      )}
    </div>
  );

  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{circle}</TooltipTrigger>
          <TooltipContent side="right">
            <p>{label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return circle;
}
