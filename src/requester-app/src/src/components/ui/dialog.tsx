import type { JSX, Accessor, Component, ComponentProps } from "solid-js"
import { splitProps, createEffect, onCleanup, Show, createSignal, createContext, useContext } from "solid-js"
import { Portal } from "solid-js/web"

import { cn } from "@/lib/utils"

type DialogContextValue = {
  open: Accessor<boolean>
  setOpen: (open: boolean) => void
}

const DialogContext = createContext<DialogContextValue>()

type DialogProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: JSX.Element
}

const Dialog = (props: DialogProps) => {
  const [local, others] = splitProps(props, ["open", "defaultOpen", "onOpenChange", "children"])
  const [internalOpen, setInternalOpen] = createSignal(local.defaultOpen ?? false)

  const isOpen = () => local.open ?? internalOpen()
  const setIsOpen = (value: boolean) => {
    setInternalOpen(value)
    local.onOpenChange?.(value)
  }

  createEffect(() => {
    if (isOpen()) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsOpen(false)
        }
      }
      document.addEventListener("keydown", handleEscape)
      onCleanup(() => document.removeEventListener("keydown", handleEscape))
    }
  })

  return (
    <DialogContext.Provider value={{ open: isOpen, setOpen: setIsOpen }}>
      {local.children}
    </DialogContext.Provider>
  )
}

type DialogTriggerProps = {
  class?: string
  children?: JSX.Element
  onClick?: (e: MouseEvent) => void
}

const DialogTrigger = (props: DialogTriggerProps) => {
  const context = useContext(DialogContext)
  const [local, others] = splitProps(props, ["onClick", "children"])

  const handleClick = (e: MouseEvent) => {
    local.onClick?.(e)
    context?.setOpen(true)
  }

  return (
    <button onClick={handleClick} {...others}>
      {local.children}
    </button>
  )
}

type DialogContentProps = {
  class?: string
  children?: JSX.Element
}

const DialogContent = (props: DialogContentProps) => {
  const context = useContext(DialogContext)
  const [local, others] = splitProps(props, ["class", "children"])

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      context?.setOpen(false)
    }
  }

  return (
    <Show when={context?.open()}>
      <Portal>
        <div
          data-expanded={context?.open() ? "" : undefined}
          data-closed={!context?.open() ? "" : undefined}
          class="fixed inset-0 z-50 bg-background/80 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0"
          onClick={handleOverlayClick}
        />
        <div
          role="dialog"
          aria-modal="true"
          data-expanded={context?.open() ? "" : undefined}
          data-closed={!context?.open() ? "" : undefined}
          class={cn(
            "fixed left-1/2 top-1/2 z-50 grid max-h-screen w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto border bg-background p-6 shadow-lg duration-200 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 data-[closed]:slide-out-to-left-1/2 data-[closed]:slide-out-to-top-[48%] data-[expanded]:slide-in-from-left-1/2 data-[expanded]:slide-in-from-top-[48%] sm:rounded-lg",
            local.class
          )}
          {...others}
        >
          {local.children}
          <button
            onClick={() => context?.setOpen(false)}
            class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[expanded]:bg-accent data-[expanded]:text-muted-foreground"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="size-4"
            >
              <path d="M18 6l-12 12" />
              <path d="M6 6l12 12" />
            </svg>
            <span class="sr-only">Close</span>
          </button>
        </div>
      </Portal>
    </Show>
  )
}

const DialogHeader: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div class={cn("flex flex-col space-y-1.5 text-center sm:text-left", local.class)} {...others} />
  )
}

const DialogFooter: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      class={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", local.class)}
      {...others}
    />
  )
}

type DialogTitleProps = {
  class?: string
  children?: JSX.Element
}

const DialogTitle = (props: DialogTitleProps) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <h2
      class={cn("text-lg font-semibold leading-none tracking-tight", local.class)}
      {...others}
    />
  )
}

type DialogDescriptionProps = {
  class?: string
  children?: JSX.Element
}

const DialogDescription = (props: DialogDescriptionProps) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <p
      class={cn("text-sm text-muted-foreground", local.class)}
      {...others}
    />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription
}
