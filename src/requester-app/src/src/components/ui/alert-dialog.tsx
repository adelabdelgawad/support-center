import type { JSX, Accessor } from "solid-js"
import { splitProps, createEffect, onCleanup, Show, createSignal, createContext, useContext } from "solid-js"
import { Portal } from "solid-js/web"

import { cn } from "@/lib/utils"

type AlertDialogContextValue = {
  open: Accessor<boolean>
  setOpen: (open: boolean) => void
}

const AlertDialogContext = createContext<AlertDialogContextValue>()

type AlertDialogProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: JSX.Element
}

const AlertDialog = (props: AlertDialogProps) => {
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
    <AlertDialogContext.Provider value={{ open: isOpen, setOpen: setIsOpen }}>
      {local.children}
    </AlertDialogContext.Provider>
  )
}

type AlertDialogTriggerProps = {
  class?: string
  children?: JSX.Element
  onClick?: (e: MouseEvent) => void
}

const AlertDialogTrigger = (props: AlertDialogTriggerProps) => {
  const context = useContext(AlertDialogContext)
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

const AlertDialogPortal = (props: { children?: JSX.Element }) => {
  return <Portal>{props.children}</Portal>
}

type AlertDialogOverlayProps = {
  class?: string
}

const AlertDialogOverlay = (props: AlertDialogOverlayProps) => {
  const context = useContext(AlertDialogContext)
  const [local, others] = splitProps(props, ["class"])

  return (
    <Show when={context?.open()}>
      <div
        data-expanded={context?.open() ? "" : undefined}
        data-closed={!context?.open() ? "" : undefined}
        class={cn(
          "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0",
          local.class
        )}
        {...others}
      />
    </Show>
  )
}

type AlertDialogContentProps = {
  class?: string
  children?: JSX.Element
}

const AlertDialogContent = (props: AlertDialogContentProps) => {
  const context = useContext(AlertDialogContext)
  const [local, others] = splitProps(props, ["class", "children"])

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      context?.setOpen(false)
    }
  }

  return (
    <Show when={context?.open()}>
      <AlertDialogPortal>
        <AlertDialogOverlay />
        <div
          role="alertdialog"
          aria-modal="true"
          data-expanded={context?.open() ? "" : undefined}
          data-closed={!context?.open() ? "" : undefined}
          class={cn(
            "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 data-[closed]:slide-out-to-left-1/2 data-[closed]:slide-out-to-top-[48%] data-[expanded]:slide-in-from-left-1/2 data-[expanded]:slide-in-from-top-[48%] sm:rounded-lg md:w-full",
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
      </AlertDialogPortal>
    </Show>
  )
}

type AlertDialogTitleProps = {
  class?: string
  children?: JSX.Element
}

const AlertDialogTitle = (props: AlertDialogTitleProps) => {
  const [local, others] = splitProps(props, ["class"])
  return <h2 class={cn("text-lg font-semibold", local.class)} {...others} />
}

type AlertDialogDescriptionProps = {
  class?: string
  children?: JSX.Element
}

const AlertDialogDescription = (props: AlertDialogDescriptionProps) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <p
      class={cn("text-sm text-muted-foreground", local.class)}
      {...others}
    />
  )
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription
}
