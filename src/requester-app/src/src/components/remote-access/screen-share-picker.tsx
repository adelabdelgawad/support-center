/**
 * Screen Share Picker Dialog
 *
 * Modern, intuitive screen/window picker for remote access sessions.
 * Features:
 * - Auto-selects primary monitor on open
 * - Large preview thumbnails
 * - Tabbed interface for Screen/Window selection
 * - Share button active by default
 */

import { createSignal, createEffect, onMount, onCleanup, Show, For } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { X, Monitor, AppWindow, Check, Search, Share2, Loader2 } from "lucide-solid";
import { cn } from "@/lib/utils";

// Types
export interface MonitorInfo {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isPrimary: boolean;
  thumbnail?: string;
}

export interface WindowInfo {
  id: number;
  title: string;
  appName: string;
  thumbnail?: string;
}

export type SourceType = "screen" | "window";

export interface SelectedSource {
  type: SourceType;
  id: number;
  name: string;
  width?: number;
  height?: number;
}

interface ScreenSharePickerProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when user selects a source and clicks Share */
  onShare: (source: SelectedSource) => void;
  /** Callback when user cancels or closes */
  onCancel: () => void;
}

export function ScreenSharePicker(props: ScreenSharePickerProps) {
  const [activeTab, setActiveTab] = createSignal<SourceType>("screen");
  const [selectedSource, setSelectedSource] = createSignal<SelectedSource | null>(null);
  const [monitors, setMonitors] = createSignal<MonitorInfo[]>([]);
  const [windows, setWindows] = createSignal<WindowInfo[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [previewImage, setPreviewImage] = createSignal<string | null>(null);

  // Track if we've loaded data for this session
  let hasLoadedForCurrentSession = false;

  // Load monitors when dialog opens
  createEffect(() => {
    if (props.isOpen && !hasLoadedForCurrentSession) {
      hasLoadedForCurrentSession = true;
      console.log("[ScreenSharePicker] Dialog opened, loading monitors...");
      loadMonitors();
    } else if (!props.isOpen) {
      // Reset when dialog closes
      hasLoadedForCurrentSession = false;
      setSelectedSource(null);
      setPreviewImage(null);
      setActiveTab("screen");
      setSearchQuery("");
    }
  });

  // Generate preview when source changes
  createEffect(() => {
    const source = selectedSource();
    if (props.isOpen && source && source.type === "screen") {
      generateScreenPreview(source.id);
    }
  });

  async function loadMonitors() {
    setIsLoading(true);
    try {
      const result = await invoke<string>("get_monitors");
      const monitorData: MonitorInfo[] = JSON.parse(result);
      setMonitors(monitorData);

      // Auto-select primary monitor
      const primary = monitorData.find(m => m.isPrimary) || monitorData[0];
      if (primary) {
        selectScreen(primary);
      }
    } catch (error) {
      console.error("[ScreenSharePicker] Failed to get monitors:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadWindows() {
    try {
      const result = await invoke<string>("get_windows");
      const windowData: WindowInfo[] = JSON.parse(result);
      console.log("[ScreenSharePicker] Loaded windows:", windowData.length);
      setWindows(windowData);
    } catch (error) {
      console.error("[ScreenSharePicker] Failed to get windows:", error);
    }
  }

  async function generateScreenPreview(monitorId: number) {
    try {
      // Use capture_monitor_preview for smaller, faster preview
      const base64 = await invoke<string>("capture_monitor_preview", { monitorId });
      setPreviewImage(`data:image/png;base64,${base64}`);
    } catch (error) {
      console.error("[ScreenSharePicker] Failed to capture preview:", error);
      // Fallback to full capture_screen if preview fails
      try {
        const base64 = await invoke<string>("capture_screen");
        setPreviewImage(`data:image/png;base64,${base64}`);
      } catch {
        setPreviewImage(null);
      }
    }
  }

  function selectScreen(monitor: MonitorInfo) {
    setSelectedSource({
      type: "screen",
      id: monitor.id,
      name: monitor.isPrimary ? "Primary Monitor" : monitor.name,
      width: monitor.width,
      height: monitor.height,
    });
  }

  function selectWindow(window: WindowInfo) {
    setSelectedSource({
      type: "window",
      id: window.id,
      name: window.title,
    });
  }

  function handleTabChange(tab: SourceType) {
    setActiveTab(tab);
    if (tab === "screen") {
      // Re-select primary monitor
      const primary = monitors().find(m => m.isPrimary) || monitors()[0];
      if (primary) {
        selectScreen(primary);
      }
    } else {
      // Clear selection for window tab - user must pick
      setSelectedSource(null);
      // Load windows if not already loaded
      if (windows().length === 0) {
        loadWindows();
      }
    }
  }

  function handleShare() {
    const source = selectedSource();
    if (source) {
      props.onShare(source);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      props.onCancel();
    } else if (e.key === "Enter" && selectedSource()) {
      handleShare();
    }
  }

  // Filter windows by search query
  const filteredWindows = () => {
    const query = searchQuery().toLowerCase();
    if (!query) return windows();
    return windows().filter(w =>
      w.title.toLowerCase().includes(query) ||
      w.appName.toLowerCase().includes(query)
    );
  };

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
        onKeyDown={handleKeyDown}
      >
      <div class="bg-[#1e1e1e] rounded-xl shadow-2xl w-full max-w-[720px] h-[560px] mx-4 animate-zoom-in border border-[#404040] flex flex-col overflow-hidden">
        {/* Header */}
        <div class="flex items-center justify-between px-6 py-4 border-b border-[#404040]">
          <h2 class="text-lg font-semibold text-white">
            Choose what to share
          </h2>
          <button
            onClick={props.onCancel}
            class="p-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close dialog"
          >
            <X class="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tab Bar */}
        <div class="flex px-6 bg-[#2d2d2d] border-b border-[#404040]">
          <button
            class={cn(
              "px-6 py-3 text-sm font-medium transition-all relative",
              activeTab() === "screen"
                ? "text-white"
                : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
            )}
            onClick={() => handleTabChange("screen")}
          >
            <div class="flex items-center gap-2">
              <Monitor class="w-4 h-4" />
              Entire Screen
            </div>
            <Show when={activeTab() === "screen"}>
              <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0078d4]" />
            </Show>
          </button>
          <button
            class={cn(
              "px-6 py-3 text-sm font-medium transition-all relative",
              activeTab() === "window"
                ? "text-white"
                : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
            )}
            onClick={() => handleTabChange("window")}
          >
            <div class="flex items-center gap-2">
              <AppWindow class="w-4 h-4" />
              Window
            </div>
            <Show when={activeTab() === "window"}>
              <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0078d4]" />
            </Show>
          </button>
        </div>

        {/* Content Area */}
        <div class="flex-1 overflow-auto p-6">
          <Show when={isLoading()}>
            <div class="flex items-center justify-center h-full">
              <Loader2 class="w-8 h-8 text-[#0078d4] animate-spin" />
            </div>
          </Show>

          <Show when={!isLoading() && activeTab() === "screen"}>
            <EntireScreenContent
              monitors={monitors()}
              selectedMonitorId={selectedSource()?.type === "screen" ? selectedSource()?.id : undefined}
              previewImage={previewImage()}
              onSelect={selectScreen}
            />
          </Show>

          <Show when={!isLoading() && activeTab() === "window"}>
            <WindowContent
              windows={filteredWindows()}
              selectedWindowId={selectedSource()?.type === "window" ? selectedSource()?.id : undefined}
              searchQuery={searchQuery()}
              onSearchChange={setSearchQuery}
              onSelect={selectWindow}
            />
          </Show>
        </div>

        {/* Footer */}
        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#404040] bg-[#252525]">
          <Button
            variant="outline"
            onClick={props.onCancel}
            class="min-w-[100px] border-[#404040] text-gray-300 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </Button>
          <button
            onClick={handleShare}
            disabled={!selectedSource()}
            class={cn(
              "inline-flex items-center justify-center gap-2 min-w-[140px] h-10 px-6 rounded-md text-sm font-semibold transition-all",
              selectedSource()
                ? "bg-[#0078d4] text-white hover:bg-[#106ebe] hover:scale-[1.02] shadow-lg shadow-[#0078d4]/30"
                : "bg-[#404040] text-gray-500 cursor-not-allowed opacity-50"
            )}
          >
            <Share2 class="w-4 h-4" />
            Share
          </button>
        </div>
      </div>

      {/* Animation styles */}
      <style>
        {`
          @keyframes fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          @keyframes zoom-in {
            from {
              opacity: 0;
              transform: scale(0.95) translateY(-20px);
            }
            to {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }

          .animate-fade-in {
            animation: fade-in 0.2s ease-out;
          }

          .animate-zoom-in {
            animation: zoom-in 0.2s ease-out;
          }
        `}
      </style>
    </div>
    </Show>
  );
}

// Entire Screen Tab Content
interface EntireScreenContentProps {
  monitors: MonitorInfo[];
  selectedMonitorId?: number;
  previewImage: string | null;
  onSelect: (monitor: MonitorInfo) => void;
}

function EntireScreenContent(props: EntireScreenContentProps) {
  const selectedMonitor = () => props.monitors.find(m => m.id === props.selectedMonitorId);

  return (
    <div class="space-y-4">
      {/* Large Preview */}
      <div
        class={cn(
          "relative w-full h-[300px] rounded-lg overflow-hidden border-2 transition-all",
          props.selectedMonitorId !== undefined
            ? "border-[#0078d4] shadow-lg shadow-[#0078d4]/20"
            : "border-[#404040]"
        )}
      >
        <Show
          when={props.previewImage}
          fallback={
            <div class="w-full h-full bg-[#2d2d2d] flex items-center justify-center">
              <div class="text-center">
                <Monitor class="w-16 h-16 text-gray-600 mx-auto mb-3" />
                <p class="text-gray-500 text-sm">Preview loading...</p>
              </div>
            </div>
          }
        >
          <img
            src={props.previewImage!}
            alt="Screen preview"
            class="w-full h-full object-contain bg-black"
          />
        </Show>

        {/* Selection indicator */}
        <Show when={props.selectedMonitorId !== undefined}>
          <div class="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#0078d4] flex items-center justify-center">
            <Check class="w-4 h-4 text-white" />
          </div>
        </Show>
      </div>

      {/* Monitor Info */}
      <Show when={selectedMonitor()}>
        <div class="flex items-center gap-2 text-sm">
          <span class="text-white font-medium">
            {selectedMonitor()!.isPrimary ? "Primary Monitor" : selectedMonitor()!.name}
          </span>
          <span class="text-gray-500">-</span>
          <span class="text-gray-400">
            {selectedMonitor()!.width} × {selectedMonitor()!.height}
          </span>
          <Show when={selectedMonitor()!.isPrimary}>
            <span class="text-[#0078d4] ml-1">
              <Check class="w-4 h-4 inline" />
            </span>
          </Show>
        </div>
      </Show>

      {/* Multiple Monitors Grid (if more than 1) */}
      <Show when={props.monitors.length > 1}>
        <div class="pt-4 border-t border-[#404040]">
          <p class="text-xs text-gray-500 mb-3">Available displays:</p>
          <div class="grid grid-cols-3 gap-3">
            <For each={props.monitors}>
              {(monitor) => (
                <button
                  onClick={() => props.onSelect(monitor)}
                  class={cn(
                    "p-3 rounded-lg border-2 transition-all text-left hover:scale-[1.02]",
                    props.selectedMonitorId === monitor.id
                      ? "border-[#0078d4] bg-[#0078d4]/10"
                      : "border-[#404040] bg-[#2d2d2d] hover:border-gray-500"
                  )}
                >
                  <div class="flex items-center gap-2 mb-1">
                    <Monitor class="w-4 h-4 text-gray-400" />
                    <span class="text-white text-sm font-medium truncate">
                      {monitor.isPrimary ? "Primary" : monitor.name}
                    </span>
                    <Show when={props.selectedMonitorId === monitor.id}>
                      <Check class="w-4 h-4 text-[#0078d4] ml-auto" />
                    </Show>
                  </div>
                  <p class="text-xs text-gray-500">
                    {monitor.width} × {monitor.height}
                  </p>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

// Window Tab Content
interface WindowContentProps {
  windows: WindowInfo[];
  selectedWindowId?: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (window: WindowInfo) => void;
}

function WindowContent(props: WindowContentProps) {
  return (
    <div class="space-y-4">
      {/* Search Bar */}
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search windows..."
          value={props.searchQuery}
          onInput={(e) => props.onSearchChange(e.currentTarget.value)}
          class="w-full h-10 pl-10 pr-4 rounded-lg bg-[#2d2d2d] border border-[#404040] text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#0078d4] transition-colors"
        />
      </div>

      {/* Windows Grid */}
      <Show
        when={props.windows.length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center h-[280px] text-center">
            <AppWindow class="w-16 h-16 text-gray-600 mb-3" />
            <p class="text-gray-400 text-sm">
              {props.searchQuery
                ? "No windows match your search"
                : "Window sharing coming soon"}
            </p>
            <p class="text-gray-500 text-xs mt-1">
              Use "Entire Screen" tab to share your desktop
            </p>
          </div>
        }
      >
        <div class="grid grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-1">
          <For each={props.windows}>
            {(window) => (
              <button
                onClick={() => props.onSelect(window)}
                class={cn(
                  "group relative p-3 rounded-lg border-2 transition-all text-left hover:scale-[1.02]",
                  props.selectedWindowId === window.id
                    ? "border-[#0078d4] bg-[#0078d4]/10"
                    : "border-[#404040] bg-[#2d2d2d] hover:border-gray-500"
                )}
              >
                {/* App Icon & Name */}
                <div class="flex items-center gap-2 mb-2">
                  <div class="w-6 h-6 rounded bg-[#404040] flex items-center justify-center">
                    <AppWindow class="w-4 h-4 text-gray-400" />
                  </div>
                  <span class="text-xs text-gray-400 truncate flex-1">
                    {window.appName}
                  </span>
                </div>

                {/* Window Title */}
                <p class="text-sm text-white font-medium truncate mb-2">
                  {window.title}
                </p>

                {/* Thumbnail Preview */}
                <div class="w-full h-[80px] rounded bg-[#1e1e1e] overflow-hidden">
                  <Show
                    when={window.thumbnail}
                    fallback={
                      <div class="w-full h-full flex items-center justify-center">
                        <span class="text-xs text-gray-600">No preview</span>
                      </div>
                    }
                  >
                    <img
                      src={window.thumbnail}
                      alt={window.title}
                      class="w-full h-full object-cover"
                    />
                  </Show>
                </div>

                {/* Selection indicator */}
                <Show when={props.selectedWindowId === window.id}>
                  <div class="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#0078d4] flex items-center justify-center">
                    <Check class="w-3 h-3 text-white" />
                  </div>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
