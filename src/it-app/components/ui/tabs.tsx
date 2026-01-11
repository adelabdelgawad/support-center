"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      _data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      _data-slot="tabs-list"
      className={cn(
        "bg-transparent text-muted-foreground inline-flex h-10 w-fit items-center justify-start border-b border-border gap-1",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      _data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-full items-center justify-center gap-2 px-4 py-2 text-sm font-semibold whitespace-nowrap duration-fast ease-fluent-standard disabled:pointer-events-none disabled:opacity-40 border-b-2 border-transparent relative",
        "_data-[state=active]:text-primary _data-[state=active]:border-primary",
        "_data-[state=inactive]:text-muted-foreground _data-[state=inactive]:hover:text-foreground _data-[state=inactive]:hover:bg-muted/50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      _data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
