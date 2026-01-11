/**
 * Select Component
 * A styled select dropdown for forms with dark theme support
 */

import { JSX, splitProps } from "solid-js";
import { cn } from "@/lib/utils";

export interface SelectProps extends JSX.SelectHTMLAttributes<HTMLSelectElement> {
  class?: string;
  variant?: "default" | "dark";
}

export function Select(props: SelectProps) {
  const [local, others] = splitProps(props, ["class", "children", "variant"]);
  const isDark = local.variant === "dark";

  return (
    <select
      class={cn(
        "flex h-12 w-full rounded-xl border px-4 py-2 text-base",
        "focus:outline-none focus:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-all appearance-none bg-no-repeat",
        "bg-[position:right_1rem_center] pr-10",
        // Dark variant (for modal)
        isDark && [
          "border-white/10 bg-white/5 text-white placeholder:text-white/40",
          "focus:border-accent focus:ring-accent/20",
          "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMUw2IDZMMTEgMSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuNiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=')]",
        ],
        // Default variant (light)
        !isDark && [
          "border-border bg-card text-foreground",
          "focus:border-blue-500 focus:ring-blue-500/20",
          "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMUw2IDZMMTEgMSIgc3Ryb2tlPSIjNjQ3NDhCIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==')]",
        ],
        local.class
      )}
      {...others}
    >
      {local.children}
    </select>
  );
}

export interface OptionProps extends JSX.OptionHTMLAttributes<HTMLOptionElement> {
  class?: string;
}

export function Option(props: OptionProps) {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <option
      class={cn(
        "bg-[hsl(195,25%,13%)] text-white py-2",
        local.class
      )}
      {...others}
    >
      {local.children}
    </option>
  );
}
