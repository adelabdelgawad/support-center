import type { JSX, Accessor } from "solid-js"
import { splitProps, createUniqueId, mergeProps } from "solid-js"

import { cn } from "@/lib/utils"

type SwitchRootProps = {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  required?: boolean
  name?: string
  value?: string
  id?: string
  class?: string
  children?: JSX.Element
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
}

const Switch = (props: SwitchRootProps) => {
  const merged = mergeProps({ id: createUniqueId() }, props)
  const [local, others] = splitProps(merged, [
    "checked",
    "defaultChecked",
    "onChange",
    "disabled",
    "required",
    "name",
    "value",
    "id",
    "class",
    "children",
    "aria-label",
    "aria-labelledby",
    "aria-describedby"
  ])

  const handleClick = () => {
    if (!local.disabled && local.onChange) {
      local.onChange(!local.checked)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div
      role="switch"
      aria-checked={local.checked}
      aria-label={local["aria-label"]}
      aria-labelledby={local["aria-labelledby"]}
      aria-describedby={local["aria-describedby"]}
      data-checked={local.checked ? "" : undefined}
      data-disabled={local.disabled ? "" : undefined}
      tabindex={local.disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      class={cn("inline-flex", local.class)}
      {...others}
    >
      <input
        type="checkbox"
        checked={local.checked}
        disabled={local.disabled}
        required={local.required}
        name={local.name}
        value={local.value}
        id={local.id}
        aria-hidden="true"
        tabindex={-1}
        style={{ position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", "white-space": "nowrap", "border-width": "0" }}
      />
      {local.children}
    </div>
  )
}

const SwitchDescription = (props: { class?: string; children?: JSX.Element }) => {
  const [local, others] = splitProps(props, ["class"])
  return <div class={cn("text-sm text-muted-foreground", local.class)} {...others} />
}

const SwitchErrorMessage = (props: { class?: string; children?: JSX.Element }) => {
  const [local, others] = splitProps(props, ["class"])
  return <div class={cn("text-sm text-destructive", local.class)} {...others} />
}

type SwitchControlProps = {
  class?: string
  children?: JSX.Element
}

const SwitchControl = (props: SwitchControlProps) => {
  const [local, others] = splitProps(props, ["class", "children"])
  return (
    <div
      class={cn(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input transition-[color,background-color,box-shadow] data-[disabled]:cursor-not-allowed data-[checked]:bg-primary data-[disabled]:opacity-50",
        local.class
      )}
      {...others}
    >
      {local.children}
    </div>
  )
}

type SwitchThumbProps = {
  class?: string
}

const SwitchThumb = (props: SwitchThumbProps) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      class={cn(
        "pointer-events-none block size-5 translate-x-0 rounded-full bg-background shadow-lg ring-0 transition-transform data-[checked]:translate-x-5",
        local.class
      )}
      {...others}
    />
  )
}

type SwitchLabelProps = {
  class?: string
  children?: JSX.Element
}

const SwitchLabel = (props: SwitchLabelProps) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      class={cn(
        "text-sm font-medium leading-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-70",
        local.class
      )}
      {...others}
    />
  )
}

export { Switch, SwitchControl, SwitchThumb, SwitchLabel, SwitchDescription, SwitchErrorMessage }
