/**
 * Card Components
 * Container components for content sections
 */

import { cn } from "@/lib/utils";
import type { JSX, ParentComponent } from "solid-js";
import { splitProps } from "solid-js";

// Card Root
export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const Card: ParentComponent<CardProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <div
      class={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        local.class
      )}
      {...others}
    >
      {local.children}
    </div>
  );
};

// Card Header
export const CardHeader: ParentComponent<CardProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <div
      class={cn("flex flex-col space-y-1.5 p-6", local.class)}
      {...others}
    >
      {local.children}
    </div>
  );
};

// Card Title
export const CardTitle: ParentComponent<JSX.HTMLAttributes<HTMLHeadingElement>> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <h3
      class={cn(
        "text-2xl font-semibold leading-none tracking-tight",
        local.class
      )}
      {...others}
    >
      {local.children}
    </h3>
  );
};

// Card Description
export const CardDescription: ParentComponent<JSX.HTMLAttributes<HTMLParagraphElement>> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <p
      class={cn("text-sm text-muted-foreground", local.class)}
      {...others}
    >
      {local.children}
    </p>
  );
};

// Card Content
export const CardContent: ParentComponent<CardProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <div class={cn("p-6 pt-0", local.class)} {...others}>
      {local.children}
    </div>
  );
};

// Card Footer
export const CardFooter: ParentComponent<CardProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <div
      class={cn("flex items-center p-6 pt-0", local.class)}
      {...others}
    >
      {local.children}
    </div>
  );
};
