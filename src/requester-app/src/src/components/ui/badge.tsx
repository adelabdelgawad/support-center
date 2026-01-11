/**
 * Badge Component
 * Small status indicator with variants
 */

import { cn } from "@/lib/utils";
import type { JSX, ParentComponent } from "solid-js";
import { splitProps } from "solid-js";

export interface BadgeProps extends JSX.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

const badgeVariants = {
  default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
  secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
  destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
  outline: "text-foreground",
};

export const Badge: ParentComponent<BadgeProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "variant", "children"]);

  return (
    <div
      class={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        badgeVariants[local.variant || "default"],
        local.class
      )}
      {...others}
    >
      {local.children}
    </div>
  );
};
