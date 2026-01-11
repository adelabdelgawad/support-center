"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => {
  const [direction, setDirection] = React.useState<'ltr' | 'rtl'>('ltr');
  const switchRef = React.useRef<React.ElementRef<typeof SwitchPrimitives.Root>>(null);

  React.useLayoutEffect(() => {
    // Function to get direction from element or its parents
    const getDirection = (element: Element | null): 'ltr' | 'rtl' => {
      let current = element;
      while (current) {
        const dir = current.getAttribute?.('dir');
        if (dir === 'rtl') return 'rtl';
        if (dir === 'ltr') return 'ltr';
        // Also check computed direction from CSS
        const computed = window.getComputedStyle(current as Element).direction;
        if (computed === 'rtl') return 'rtl';
        current = current.parentElement;
      }
      return 'ltr';
    };

    if (switchRef.current) {
      const currentDir = getDirection(switchRef.current);
      setDirection(currentDir);

      // Listen for dir attribute changes on parents
      const observer = new MutationObserver(() => {
        const newDir = getDirection(switchRef.current);
        setDirection(newDir);
      });

      // Observe the element itself and its parents
      let parent = switchRef.current.parentElement;
      while (parent) {
        observer.observe(parent, { attributes: true, attributeFilter: ['dir'], subtree: false });
        parent = parent.parentElement;
      }
      observer.observe(switchRef.current, { attributes: true, attributeFilter: ['dir'] });

      return () => observer.disconnect();
    }
  }, []);

  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full border border-border duration-fast ease-fluent-standard focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-muted data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=unchecked]:bg-muted data-[state=unchecked]:border-border",
        className
      )}
      {...props}
      ref={(node) => {
        switchRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-fluent-2 ring-0 duration-fast ease-fluent-standard",
          direction === 'rtl'
            ? "data-[state=checked]:-translate-x-5 data-[state=unchecked]:-translate-x-0"
            : "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitives.Root>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
