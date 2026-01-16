/**
 * Cache Settings Component (T063-T072)
 *
 * Desktop settings UI for managing message cache in the Requester App.
 *
 * Features:
 * - T063: Display storage usage with progress bar
 * - T063: Show total size, hit rate, last sync timestamp
 * - T063: Per-chat breakdown (message count, media size)
 * - T064: "Clear All Cache" button
 * - T065: "Clear by Date Range" functionality
 * - T069: "Download All Chats" toggle (disabled by default)
 * - T071: Cancel button for full download in progress
 * - T072: Persist "full download enabled" preference
 */

import { createSignal, onMount, Show, For, Index } from "solid-js";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RTLSwitch } from "@/components/rtl-switch";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  messageCache,
  type DetailedCacheStatistics,
  type ChatCacheStats,
} from "@/lib/message-cache";
import { syncEngine } from "@/lib/sync-engine";
import { TauriStorage } from "@/lib/storage";
import {
  Database,
  HardDrive,
  Trash2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  RefreshCw,
} from "lucide-solid";

// ============================================================================
// Types
// ============================================================================

/**
 * Format timestamp to relative time string
 * Simple implementation without external dependencies
 */
function formatDistanceToNow(timestamp: number, options?: { addSuffix?: boolean }): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) return 'just now';

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  let value: number;
  let unit: string;

  if (seconds < 60) {
    value = seconds;
    unit = 'second';
  } else if (minutes < 60) {
    value = minutes;
    unit = 'minute';
  } else if (hours < 24) {
    value = hours;
    unit = 'hour';
  } else if (days < 30) {
    value = days;
    unit = 'day';
  } else if (months < 12) {
    value = months;
    unit = 'month';
  } else {
    value = years;
    unit = 'year';
  }

  const plural = value !== 1 ? 's' : '';
  const suffix = options?.addSuffix ? ' ago' : '';

  return `${value} ${unit}${plural}${suffix}`;
}

// ============================================================================
// Types
// ============================================================================

interface CacheSettingsProps {
  onRefresh?: () => void;
}

// Full download state
interface FullDownloadState {
  inProgress: boolean;
  currentChat: number;
  totalChats: number;
  currentChatId: string | null;
  cancelled: boolean;
  error: string | null;
}

// ============================================================================
// Component
// ============================================================================

export function CacheSettings(props: CacheSettingsProps) {
  // Statistics state (T063)
  const [stats, setStats] = createSignal<DetailedCacheStatistics | null>(null);
  const [isLoadingStats, setIsLoadingStats] = createSignal(false);
  const [statsError, setStatsError] = createSignal<string | null>(null);

  // Clear all cache dialog (T064)
  const [showClearAllDialog, setShowClearAllDialog] = createSignal(false);
  const [isClearingAll, setIsClearingAll] = createSignal(false);

  // Clear by date range dialog (T065)
  const [showDateRangeDialog, setShowDateRangeDialog] = createSignal(false);
  const [dateRangeStart, setDateRangeStart] = createSignal<string>("");
  const [dateRangeEnd, setDateRangeEnd] = createSignal<string>("");
  const [isClearingByDate, setIsClearingByDate] = createSignal(false);
  const [dateRangeError, setDateRangeError] = createSignal<string | null>(null);

  // Full download settings (T069, T072)
  const [fullDownloadEnabled, setFullDownloadEnabled] = createSignal(false);

  // Full download progress (T070, T071)
  const [fullDownload, setFullDownload] = createSignal<FullDownloadState>({
    inProgress: false,
    currentChat: 0,
    totalChats: 0,
    currentChatId: null,
    cancelled: false,
    error: null,
  });

  // Chat breakdown expansion
  const [expandedChats, setExpandedChats] = createSignal<Set<string>>(new Set());

  // ============================================================================
  // Initialization
  // ============================================================================

  onMount(() => {
    loadStats();
    loadFullDownloadPreference();
  });

  // ============================================================================
  // Data Loading
  // ============================================================================

  /**
   * Load detailed cache statistics (T063)
   */
  async function loadStats() {
    setIsLoadingStats(true);
    setStatsError(null);

    try {
      const detailedStats = await messageCache.getDetailedStats();
      setStats(detailedStats);
    } catch (error) {
      console.error("[CacheSettings] Failed to load stats:", error);
      setStatsError(error instanceof Error ? error.message : "Failed to load statistics");
    } finally {
      setIsLoadingStats(false);
    }
  }

  /**
   * Load full download enabled preference (T072)
   */
  async function loadFullDownloadPreference() {
    try {
      const enabled = await TauriStorage.get("full_download_enabled", false);
      setFullDownloadEnabled(enabled ?? false);
    } catch (error) {
      console.error("[CacheSettings] Failed to load full download preference:", error);
    }
  }

  /**
   * Save full download enabled preference (T072)
   */
  async function saveFullDownloadPreference(enabled: boolean) {
    try {
      await TauriStorage.set("full_download_enabled", enabled);
      setFullDownloadEnabled(enabled);
    } catch (error) {
      console.error("[CacheSettings] Failed to save full download preference:", error);
    }
  }

  // ============================================================================
  // Cache Clearing (T064, T065, T066)
  // ============================================================================

  /**
   * Clear all cache (T064)
   */
  async function handleClearAll() {
    setIsClearingAll(true);
    setShowClearAllDialog(false);

    try {
      await messageCache.clearAll();
      await loadStats();
      console.log("[CacheSettings] All cache cleared");
    } catch (error) {
      console.error("[CacheSettings] Failed to clear all cache:", error);
      setStatsError(error instanceof Error ? error.message : "Failed to clear cache");
    } finally {
      setIsClearingAll(false);
    }
  }

  /**
   * Clear cache by date range (T065, T066)
   */
  async function handleClearByDateRange() {
    // Validate dates
    const start = new Date(dateRangeStart());
    const end = new Date(dateRangeEnd());

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setDateRangeError("Please enter valid dates");
      return;
    }

    if (start > end) {
      setDateRangeError("Start date must be before end date");
      return;
    }

    setIsClearingByDate(true);
    setDateRangeError(null);
    setShowDateRangeDialog(false);

    try {
      const messagesCleared = await messageCache.clearByDateRange(
        start.getTime(),
        end.getTime()
      );
      console.log(`[CacheSettings] Cleared ${messagesCleared} messages by date range`);
      await loadStats();
    } catch (error) {
      console.error("[CacheSettings] Failed to clear by date range:", error);
      setStatsError(error instanceof Error ? error.message : "Failed to clear cache by date range");
    } finally {
      setIsClearingByDate(false);
      setDateRangeStart("");
      setDateRangeEnd("");
    }
  }

  // ============================================================================
  // Full Download All Chats (T069, T070, T071)
  // ============================================================================

  /**
   * Start full download of all chats (T070)
   */
  async function startFullDownload() {
    if (!stats() || fullDownload().inProgress) return;

    setFullDownload({
      inProgress: true,
      currentChat: 0,
      totalChats: stats()!.chatBreakdown.length,
      currentChatId: null,
      cancelled: false,
      error: null,
    });

    const STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // 500MB

    try {
      // Check current storage usage
      const currentStats = await messageCache.getDetailedStats();
      if (currentStats.totalSize >= STORAGE_LIMIT_BYTES * 0.9) {
        setFullDownload((prev) => ({
          ...prev,
          inProgress: false,
          error: "Storage limit (90%) reached. Cannot download more chats.",
        }));
        return;
      }

      // Use syncEngine.fullDownloadAllChats (T070)
      const result = await syncEngine.fullDownloadAllChats(
        // onProgress callback
        (current, total, chatId) => {
          setFullDownload((prev) => ({
            ...prev,
            currentChat: current,
            totalChats: total,
            currentChatId: chatId,
          }));
        },
        // onCancelled callback (T071)
        () => fullDownload().cancelled
      );

      console.log(`[CacheSettings] Full download complete: ${result.downloaded}/${result.total} chats`);
      await loadStats();

      if (result.error) {
        setFullDownload((prev) => ({
          ...prev,
          error: result.error,
        }));
      }
    } catch (error) {
      console.error("[CacheSettings] Full download failed:", error);
      setFullDownload((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Download failed",
      }));
    } finally {
      setFullDownload((prev) => ({
        ...prev,
        inProgress: false,
        currentChatId: null,
      }));
    }
  }

  /**
   * Cancel full download (T071)
   */
  function cancelFullDownload() {
    setFullDownload((prev) => ({
      ...prev,
      cancelled: true,
    }));
  }

  // ============================================================================
  // UI Helpers
  // ============================================================================

  /**
   * Toggle chat expansion
   */
  function toggleChatExpansion(requestId: string) {
    const expanded = new Set(expandedChats());
    if (expanded.has(requestId)) {
      expanded.delete(requestId);
    } else {
      expanded.add(requestId);
    }
    setExpandedChats(expanded);
  }

  /**
   * Format bytes to human readable size
   */
  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div class="space-y-6">
      {/* Storage Usage Overview (T063) */}
      <div class="space-y-3">
        <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
          <HardDrive class="h-4 w-4" />
          <span>Storage Usage</span>
          <Show when={isLoadingStats()}>
            <RefreshCw class="h-3 w-3 animate-spin text-muted-foreground" />
          </Show>
        </div>

        <Show when={statsError()} keyed>
          {(error) => (
            <Card class="p-3 bg-destructive/10 border-destructive text-destructive">
              <div class="flex items-center gap-2 text-sm">
                <AlertTriangle class="h-4 w-4" />
                <span>{error}</span>
              </div>
            </Card>
          )}
        </Show>

        <Show when={stats()}>
          {(currentStats) => (
            <Card class="p-4 bg-secondary/50 border-border">
              {/* Progress Bar */}
              <div class="space-y-2">
                <div class="flex items-center justify-between text-sm">
                  <span class="text-muted-foreground">Cache Size</span>
                  <span class="font-medium text-foreground">
                    {currentStats().totalSizeMB.toFixed(2)} MB / {currentStats().storageLimitMB} MB
                  </span>
                </div>

                <div class="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    class="h-full bg-primary transition-all duration-500"
                    style={`width: ${currentStats().usagePercentage}%`}
                  />
                </div>

                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{currentStats().usagePercentage.toFixed(1)}% used</span>
                  <span>{currentStats().totalChats} chats, {currentStats().totalMessages} messages</span>
                </div>
              </div>

              {/* Statistics Grid */}
              <div class="grid grid-cols-3 gap-4 mt-4">
                {/* Hit Rate */}
                <div class="text-center">
                  <div class="text-2xl font-bold text-foreground">
                    {currentStats().hitRate.toFixed(0)}%
                  </div>
                  <div class="text-xs text-muted-foreground">Cache Hit Rate</div>
                </div>

                {/* Total Messages */}
                <div class="text-center">
                  <div class="text-2xl font-bold text-foreground">
                    {currentStats().totalMessages}
                  </div>
                  <div class="text-xs text-muted-foreground">Total Messages</div>
                </div>

                {/* Last Sync */}
                <div class="text-center">
                  <div class="text-sm font-medium text-foreground">
                    {currentStats().lastSyncTimestamp > 0
                      ? formatDistanceToNow(currentStats().lastSyncTimestamp, { addSuffix: true })
                      : "Never"}
                  </div>
                  <div class="text-xs text-muted-foreground">Last Sync</div>
                </div>
              </div>
            </Card>
          )}
        </Show>
      </div>

      {/* Cache Actions (T064, T065) */}
      <div class="space-y-3">
        <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Database class="h-4 w-4" />
          <span>Cache Management</span>
        </div>

        <div class="flex flex-col gap-2">
          {/* Clear All Cache Button (T064) */}
          <Button
            onClick={() => setShowClearAllDialog(true)}
            disabled={isClearingAll() || isLoadingStats()}
            variant="outline"
            class="w-full justify-start"
          >
            <Trash2 class="h-4 w-4 mr-2" />
            {isClearingAll() ? "Clearing..." : "Clear All Cache"}
          </Button>

          {/* Clear by Date Range Button (T065) */}
          <Button
            onClick={() => setShowDateRangeDialog(true)}
            disabled={isClearingByDate() || isLoadingStats()}
            variant="outline"
            class="w-full justify-start"
          >
            <Calendar class="h-4 w-4 mr-2" />
            {isClearingByDate() ? "Clearing..." : "Clear by Date Range"}
          </Button>

          {/* Refresh Stats Button */}
          <Button
            onClick={loadStats}
            disabled={isLoadingStats()}
            variant="ghost"
            class="w-full justify-start"
          >
            <RefreshCw class={`h-4 w-4 mr-2 ${isLoadingStats() ? "animate-spin" : ""}`} />
            Refresh Statistics
          </Button>
        </div>
      </div>

      {/* Full Download Settings (T069, T070, T071) */}
      <div class="space-y-3">
        <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Download class="h-4 w-4" />
          <span>Offline Chat Download</span>
        </div>

        <Card class="p-4 bg-secondary/50 border-border">
          {/* Download All Chats Toggle (T069) */}
          <div class="flex items-center justify-between">
            <div class="space-y-1">
              <Label class="text-sm font-medium text-foreground">
                Download All Chats
              </Label>
              <p class="text-xs text-muted-foreground">
                Enable to download all chats for offline access (uses ~{stats()?.totalSizeMB.toFixed(0) || 0}MB)
              </p>
            </div>

            <RTLSwitch
              checked={fullDownloadEnabled()}
              onChange={(checked) => saveFullDownloadPreference(checked)}
              aria-label="Enable download all chats"
            />
          </div>

          {/* Warning about storage usage (T069) */}
          <Show when={fullDownloadEnabled() && stats()}>
            <div class="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div class="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle class="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div class="space-y-1">
                  <p class="font-medium">Storage Warning</p>
                  <p>
                    Downloading all chats will use approximately{" "}
                    <span class="font-semibold">{stats()!.totalSizeMB.toFixed(0)}MB</span> of storage.
                    Make sure you have enough disk space.
                  </p>
                </div>
              </div>
            </div>
          </Show>

          {/* Progress Indicator (T070) */}
          <Show when={fullDownload().inProgress}>
            <div class="mt-3 space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-muted-foreground">Downloading chats...</span>
                <span class="font-medium text-foreground">
                  {fullDownload().currentChat} / {fullDownload().totalChats}
                </span>
              </div>

              <div class="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  class="h-full bg-accent transition-all duration-300"
                  style={`width: ${(fullDownload().currentChat / fullDownload().totalChats) * 100}%`}
                />
              </div>

              {/* Cancel Button (T071) */}
              <Button
                onClick={cancelFullDownload}
                variant="outline"
                size="sm"
                class="w-full"
                disabled={fullDownload().cancelled}
              >
                <X class="h-4 w-4 mr-2" />
                {fullDownload().cancelled ? "Cancelling..." : "Cancel Download"}
              </Button>
            </div>
          </Show>

          {/* Start Download Button (T070) */}
          <Show when={fullDownloadEnabled() && !fullDownload().inProgress}>
            <Button
              onClick={startFullDownload}
              disabled={!fullDownloadEnabled() || fullDownload().inProgress}
              variant="default"
              class="w-full mt-3"
            >
              <Download class="h-4 w-4 mr-2" />
              Start Full Download
            </Button>
          </Show>

          {/* Download Error */}
          <Show when={fullDownload().error && !fullDownload().inProgress}>
            <div class="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div class="flex items-center gap-2 text-xs text-destructive">
                <XCircle class="h-4 w-4 flex-shrink-0" />
                <span>{fullDownload().error}</span>
              </div>
            </div>
          </Show>

          {/* Download Success */}
          <Show when={!fullDownload().inProgress && fullDownload().currentChat > 0 && !fullDownload().error}>
            <div class="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div class="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 class="h-4 w-4 flex-shrink-0" />
                <span>
                  Downloaded {fullDownload().currentChat} of {fullDownload().totalChats} chats
                </span>
              </div>
            </div>
          </Show>
        </Card>
      </div>

      {/* Per-Chat Breakdown (T063) */}
      <Show when={stats() && stats()!.chatBreakdown.length > 0}>
        <div class="space-y-3">
          <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Database class="h-4 w-4" />
            <span>Per-Chat Breakdown</span>
            <span class="text-xs text-muted-foreground">
              ({stats()!.chatBreakdown.length} chats)
            </span>
          </div>

          <Card class="p-4 bg-secondary/50 border-border">
            <div class="space-y-2 max-h-64 overflow-y-auto">
              <For each={stats()!.chatBreakdown}>
                {(chat) => (
                  <ChatBreakdownItem
                    chat={chat}
                    isExpanded={expandedChats().has(chat.requestId)}
                    onToggle={() => toggleChatExpansion(chat.requestId)}
                    formatBytes={formatBytes}
                  />
                )}
              </For>
            </div>
          </Card>
        </div>
      </Show>

      {/* Clear All Cache Confirmation Dialog (T064) */}
      <ConfirmationDialog
        isOpen={showClearAllDialog()}
        onClose={() => setShowClearAllDialog(false)}
        onConfirm={handleClearAll}
        title="Clear All Cache?"
        message="This will delete all cached messages from all chats. You will need to sync again to view messages."
        confirmText="Clear All"
        cancelText="Cancel"
        variant="destructive"
      />

      {/* Clear by Date Range Dialog (T065) */}
      <Show when={showDateRangeDialog()}>
        <div class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div class="w-full max-w-md bg-card rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div class="border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 class="text-lg font-semibold text-foreground">Clear Cache by Date Range</h3>
              <button
                onClick={() => setShowDateRangeDialog(false)}
                class="p-2 rounded-lg hover:bg-secondary transition-colors"
              >
                <X class="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div class="p-6 space-y-4">
              <p class="text-sm text-muted-foreground">
                Delete all messages cached between the specified dates.
              </p>

              {/* Error Message */}
              <Show when={dateRangeError()}>
                {(error) => (
                  <div class="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <div class="flex items-center gap-2 text-xs text-destructive">
                      <AlertTriangle class="h-4 w-4" />
                      <span>{error()}</span>
                    </div>
                  </div>
                )}
              </Show>

              {/* Date Inputs */}
              <div class="space-y-3">
                <div class="space-y-1">
                  <Label class="text-sm font-medium text-foreground">From Date</Label>
                  <input
                    type="date"
                    value={dateRangeStart()}
                    onInput={(e) => setDateRangeStart(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                  />
                </div>

                <div class="space-y-1">
                  <Label class="text-sm font-medium text-foreground">To Date</Label>
                  <input
                    type="date"
                    value={dateRangeEnd()}
                    onInput={(e) => setDateRangeEnd(e.currentTarget.value)}
                    class="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div class="border-t border-border p-4 bg-secondary/50 rounded-b-2xl">
              <div class="flex items-center justify-end gap-3">
                <Button
                  onClick={() => setShowDateRangeDialog(false)}
                  variant="outline"
                  disabled={isClearingByDate()}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleClearByDateRange}
                  variant="destructive"
                  disabled={isClearingByDate() || !dateRangeStart() || !dateRangeEnd()}
                >
                  {isClearingByDate() ? "Clearing..." : "Clear Range"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

interface ChatBreakdownItemProps {
  chat: ChatCacheStats;
  isExpanded: boolean;
  onToggle: () => void;
  formatBytes: (bytes: number) => string;
}

function ChatBreakdownItem(props: ChatBreakdownItemProps) {
  return (
    <div class="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={props.onToggle}
        class="w-full px-3 py-2 flex items-center justify-between hover:bg-secondary/50 transition-colors text-left"
      >
        <div class="flex items-center gap-2 text-sm">
          <span class="font-medium text-foreground truncate max-w-[150px]">
            {props.chat.requestId.slice(0, 8)}...
          </span>
          <span class="text-muted-foreground">
            {props.chat.messageCount} msgs
          </span>
        </div>

        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{props.formatBytes(props.chat.totalSize)}</span>
          <svg
            class={`h-4 w-4 transition-transform ${props.isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Expanded Details */}
      <Show when={props.isExpanded}>
        <div class="px-3 py-2 bg-secondary/30 border-t border-border space-y-1 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Request ID:</span>
            <span class="text-foreground font-mono">{props.chat.requestId}</span>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Messages:</span>
            <span class="text-foreground">{props.chat.messageCount}</span>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Media Size:</span>
            <span class="text-foreground">{props.formatBytes(props.chat.mediaSize)}</span>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Total Size:</span>
            <span class="text-foreground font-medium">{props.formatBytes(props.chat.totalSize)}</span>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Last Synced:</span>
            <span class="text-foreground">
              {formatDistanceToNow(props.chat.lastSyncedAt, { addSuffix: true })}
            </span>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Last Accessed:</span>
            <span class="text-foreground">
              {formatDistanceToNow(props.chat.lastAccessedAt, { addSuffix: true })}
            </span>
          </div>
        </div>
      </Show>
    </div>
  );
}

// Missing lucide-solid icon for Download - using a placeholder
function Download(props: { class?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

export default CacheSettings;
