import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground h-8 w-full min-w-0 rounded-fluent border border-border bg-background px-3 py-1.5 text-sm duration-fast ease-fluent-standard outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-muted",
        "hover:border-[#c8c6c4] dark:hover:border-[#605e5c]",
        "focus:border-ring focus:outline-2 focus:outline-offset-0 focus:outline-ring",
        "aria-invalid:border-destructive aria-invalid:outline-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
