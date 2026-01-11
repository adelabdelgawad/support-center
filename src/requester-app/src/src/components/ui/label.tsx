/**
 * Label Component
 * Styled form label
 */

import { cn } from "@/lib/utils";
import type { JSX, ParentComponent } from "solid-js";
import { splitProps } from "solid-js";

export interface LabelProps extends JSX.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label: ParentComponent<LabelProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <label
      class={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        local.class
      )}
      {...others}
    >
      {local.children}
    </label>
  );
};
