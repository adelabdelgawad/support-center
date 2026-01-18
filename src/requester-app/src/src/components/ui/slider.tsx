import type { JSX, Accessor } from "solid-js"
import { splitProps, createSignal, createEffect, on } from "solid-js"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

type SliderRootProps = {
  value?: number[]
  defaultValue?: number[]
  onChange?: (value: number[]) => void
  onChangeEnd?: (value: number[]) => void
  minValue?: number
  maxValue?: number
  step?: number
  disabled?: boolean
  class?: string
  children?: JSX.Element
  "aria-label"?: string
  "aria-labelledby"?: string
}

const Slider = (props: SliderRootProps) => {
  const [local, others] = splitProps(props, [
    "value",
    "defaultValue",
    "onChange",
    "onChangeEnd",
    "minValue",
    "maxValue",
    "step",
    "disabled",
    "class",
    "children",
    "aria-label",
    "aria-labelledby"
  ])

  const currentValue = () => local.value?.[0] ?? local.defaultValue?.[0] ?? 0

  const handleInput = (e: InputEvent) => {
    const target = e.target as HTMLInputElement
    const newValue = parseFloat(target.value)
    local.onChange?.([newValue])
  }

  const handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    const newValue = parseFloat(target.value)
    local.onChangeEnd?.([newValue])
  }

  return (
    <div
      class={cn("relative flex w-full touch-none select-none flex-col items-center", local.class)}
      data-disabled={local.disabled ? "" : undefined}
      {...others}
    >
      <input
        type="range"
        min={local.minValue ?? 0}
        max={local.maxValue ?? 100}
        step={local.step ?? 1}
        value={currentValue()}
        onInput={handleInput}
        onChange={handleChange}
        disabled={local.disabled}
        aria-label={local["aria-label"]}
        aria-labelledby={local["aria-labelledby"]}
        class="sr-only"
      />
      {local.children}
    </div>
  )
}

type SliderTrackProps = {
  class?: string
  children?: JSX.Element
}

const SliderTrack = (props: SliderTrackProps) => {
  const [local, others] = splitProps(props, ["class", "children"])
  return (
    <div
      class={cn("relative h-2 w-full grow rounded-full bg-secondary", local.class)}
      {...others}
    >
      {local.children}
    </div>
  )
}

type SliderFillProps = {
  class?: string
}

const SliderFill = (props: SliderFillProps) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <div
      class={cn("absolute h-full rounded-full bg-primary", local.class)}
      style={{ width: "var(--slider-fill-width, 0%)" }}
      {...others}
    />
  )
}

type SliderThumbProps = {
  class?: string
  children?: JSX.Element
}

const SliderThumb = (props: SliderThumbProps) => {
  const [local, others] = splitProps(props, ["class", "children"])
  return (
    <div
      class={cn(
        "absolute top-[-6px] block size-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        local.class
      )}
      style={{ left: "var(--slider-thumb-position, 0%)", transform: "translateX(-50%)" }}
      {...others}
    >
      {local.children}
    </div>
  )
}

type SliderLabelProps = {
  class?: string
  children?: JSX.Element
}

const SliderLabel = (props: SliderLabelProps) => {
  return <Label {...props} />
}

const SliderValueLabel = (props: SliderLabelProps) => {
  return <Label {...props} />
}

export { Slider, SliderTrack, SliderFill, SliderThumb, SliderLabel, SliderValueLabel }
