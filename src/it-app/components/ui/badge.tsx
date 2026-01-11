import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none duration-fast ease-fluent-standard overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-[#106ebe] [a&]:active:bg-[#005a9e]",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-[#edebe9] [a&]:active:bg-[#e1dfdd]",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-[#a4282c] [a&]:active:bg-[#751d1f]",
        outline:
          "text-foreground border-border [a&]:hover:bg-muted [a&]:active:bg-accent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
