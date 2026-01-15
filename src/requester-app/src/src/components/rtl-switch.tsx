/**
 * RTL-Aware Switch Component
 *
 * Wrapper around solid-ui Switch that adds RTL support
 * Matches the IT-app (Next.js) Switch implementation for consistency
 * Uses direction detection from language context
 */

import { Switch, SwitchControl, SwitchThumb } from "@/components/ui";
import { useLanguage } from "@/context/language-context";

interface RTLSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

export function RTLSwitch(props: RTLSwitchProps) {
  const { direction } = useLanguage();
  const isRTL = () => direction() === "rtl";

  return (
    <Switch
      checked={props.checked}
      onChange={props.onChange}
      disabled={props.disabled}
    >
      <SwitchControl
        class="h-5 w-10"
        style={{
          direction: isRTL() ? "rtl" : "ltr",
        }}
      >
        <SwitchThumb
          class={
            isRTL()
              ? "data-[checked]:-translate-x-5 data-[checked]:translate-x-0"
              : "data-[checked]:translate-x-5"
          }
        />
      </SwitchControl>
    </Switch>
  );
}
