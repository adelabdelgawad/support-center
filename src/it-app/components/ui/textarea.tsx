import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      _data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex field-sizing-content min-h-16 w-full rounded-fluent border border-border bg-background px-3 py-2 text-sm duration-fast ease-fluent-standard outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-muted resize-y",
        "hover:border-[#c8c6c4] dark:hover:border-[#605e5c]",
        "focus:border-ring focus:outline-2 focus:outline-offset-0 focus:outline-ring",
        "aria-invalid:border-destructive aria-invalid:outline-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
