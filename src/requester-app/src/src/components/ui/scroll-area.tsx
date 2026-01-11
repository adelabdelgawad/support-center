/**
 * ScrollArea Component
 * Scrollable container with overflow handling and custom scrollbar
 * - Scrollbar hidden by default
 * - Shows on hover
 * - Always functional
 */

import { cn } from "@/lib/utils";
import type { JSX, ParentComponent } from "solid-js";
import { splitProps } from "solid-js";

export interface ScrollAreaProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const ScrollArea: ParentComponent<ScrollAreaProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <div
      class={cn(
        "relative overflow-auto",
        // Custom scrollbar styles - hidden by default, visible on hover
        "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-transparent",
        "hover:scrollbar-thumb-foreground/20 active:scrollbar-thumb-foreground/30",
        "scrollbar-thumb-rounded-full",
        local.class
      )}
      style={{
        // Webkit browsers (Chrome, Safari, Edge)
        "scrollbar-width": "thin",
        "scrollbar-color": "transparent transparent",
      }}
      {...others}
    >
      <style>{`
        /* Webkit scrollbar styling for hidden-on-hover effect */
        .scrollbar-thin::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }

        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 9999px;
          transition: background-color 0.2s ease;
        }

        .scrollbar-thin:hover::-webkit-scrollbar-thumb {
          background: hsl(var(--foreground) / 0.2); /* Theme-aware */
        }

        .scrollbar-thin:hover::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--foreground) / 0.3); /* Theme-aware */
        }

        /* Firefox scrollbar styling */
        .scrollbar-thin {
          scrollbar-width: thin;
          scrollbar-color: transparent transparent;
        }

        .scrollbar-thin:hover {
          scrollbar-color: hsl(var(--foreground) / 0.2) transparent;
        }
      `}</style>
      {local.children}
    </div>
  );
};
