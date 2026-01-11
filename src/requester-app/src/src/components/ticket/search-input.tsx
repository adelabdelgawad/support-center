/**
 * Search Input Component
 *
 * A debounced search input for searching tickets.
 * Features:
 * - 300ms debounce to avoid excessive API calls
 * - Clear button (X icon)
 * - Search icon
 * - Loading indicator when searching
 */

import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { Search, X, Loader2 } from "lucide-solid";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/language-context";

interface SearchInputProps {
  /** Current search value */
  value: string;
  /** Called when search value changes (debounced) */
  onSearch: (query: string) => void;
  /** Whether search is currently loading */
  isLoading?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** CSS class name */
  class?: string;
}

export function SearchInput(props: SearchInputProps) {
  const { t } = useLanguage();

  // Local input value (updates immediately for responsive UI)
  const [localValue, setLocalValue] = createSignal(props.value);

  // Debounce timer ref
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Debounce delay
  const debounceMs = () => props.debounceMs ?? 300;

  // Update local value when prop changes
  createEffect(() => {
    setLocalValue(props.value);
  });

  // Handle input change with debounce
  const handleInput = (e: InputEvent) => {
    const target = e.target as HTMLInputElement;
    const newValue = target.value;

    // Update local value immediately for responsive UI
    setLocalValue(newValue);

    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set new debounce timer
    debounceTimer = setTimeout(() => {
      props.onSearch(newValue);
    }, debounceMs());
  };

  // Handle clear button
  const handleClear = () => {
    setLocalValue("");
    props.onSearch("");

    // Clear any pending debounce
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  };

  // Handle Enter key for immediate search
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      // Clear debounce and search immediately
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      props.onSearch(localValue());
    }
  };

  // Cleanup timer on unmount
  onCleanup(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  });

  return (
    <div class={cn("relative", props.class)}>
      {/* Search icon */}
      <div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
        <Show
          when={!props.isLoading}
          fallback={<Loader2 class="h-4 w-4 text-muted-foreground animate-spin" />}
        >
          <Search class="h-4 w-4 text-muted-foreground" />
        </Show>
      </div>

      {/* Input field */}
      <input
        type="text"
        value={localValue()}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={props.placeholder || t("search.placeholder")}
        class={cn(
          "w-full h-10 ps-10 pe-10",
          "rounded-lg border border-border bg-secondary",
          "text-sm text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
          "transition-all duration-200"
        )}
        aria-label={t("search.label")}
      />

      {/* Clear button */}
      <Show when={localValue().length > 0}>
        <button
          type="button"
          onClick={handleClear}
          class={cn(
            "absolute inset-y-0 end-0 flex items-center pe-3",
            "text-muted-foreground hover:text-foreground",
            "transition-colors duration-150"
          )}
          aria-label={t("search.clear")}
        >
          <X class="h-4 w-4" />
        </button>
      </Show>
    </div>
  );
}

export default SearchInput;
