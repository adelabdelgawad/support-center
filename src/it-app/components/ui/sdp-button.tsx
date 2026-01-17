import * as React from "react";
import { cn } from "@/lib/utils";

export interface SDPButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
}

const SDPButton = React.forwardRef<HTMLButtonElement, SDPButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          // Base styles - ServiceDesk Plus styled
          "inline-flex items-center justify-center",
          "h-7 px-3 py-1",
          "text-xs font-medium",
          "rounded",
          "transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          // Variant styles
          variant === "default" && [
            "bg-[var(--sdp-accent)]",
            "text-white",
            "border-0",
            "shadow-sm",
            "hover:shadow-md",
            "hover:brightness-110",
            "active:brightness-95",
          ],
          variant === "outline" && [
            "bg-transparent",
            "text-[var(--sdp-accent)]",
            "border border-[var(--sdp-accent)]",
            "hover:bg-[var(--sdp-accent)]/10",
          ],
          variant === "ghost" && [
            "bg-transparent",
            "text-[var(--sdp-accent)]",
            "border-0",
            "hover:bg-[var(--sdp-accent)]/10",
          ],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

SDPButton.displayName = "SDPButton";

export { SDPButton };
