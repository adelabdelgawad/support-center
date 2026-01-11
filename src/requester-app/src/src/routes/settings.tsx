/**
 * Settings Page
 *
 * Provides access to:
 * - Notification preferences (sound, volume)
 * - Theme selection (light, dark, system)
 * - Language preferences
 * - Account information
 *
 * Features:
 * - Change tracking: Save button disabled when no changes
 * - Confirmation dialogs for save/cancel operations
 * - Persistent footer with Save/Cancel buttons
 * - Bilingual support (English/Arabic)
 */

import { createSignal, onMount, createMemo, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-shell";
import { authStore } from "@/stores";
import { NotificationPreferencesCard } from "@/components/notification-preferences";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useLanguage, type Language } from "@/context/language-context";
import { useTheme } from "@/context/theme-context";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notifications";
import { logger } from "@/logging";
import { Monitor, Moon, Sun, Languages, FolderOpen } from "lucide-solid";

export default function SettingsPage() {
  const navigate = useNavigate();
  const user = () => authStore.state.user;
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  // Current state (what user is editing)
  const [currentPreferences, setCurrentPreferences] =
    createSignal<NotificationPreferences>({
      notificationsEnabled: true,
      soundEnabled: true,
      soundVolume: 0.5,
    });
  const [currentTheme, setCurrentTheme] = createSignal(theme());
  const [currentLanguage, setCurrentLanguage] = createSignal<Language>(language());

  // Saved state (what's in localStorage)
  const [savedPreferences, setSavedPreferences] =
    createSignal<NotificationPreferences>({
      notificationsEnabled: true,
      soundEnabled: true,
      soundVolume: 0.5,
    });
  const [savedTheme, setSavedTheme] = createSignal(theme());
  const [savedLanguage, setSavedLanguage] = createSignal<Language>(language());

  // Dialog states
  const [showSaveDialog, setShowSaveDialog] = createSignal(false);
  const [showCancelDialog, setShowCancelDialog] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);

  // App version
  const [appVersion, setAppVersion] = createSignal("...");

  // Logs folder
  const [logsDir, setLogsDir] = createSignal<string | null>(null);
  const [logsTotalSize, setLogsTotalSize] = createSignal<number>(0);

  // Open logs folder in file explorer
  const handleOpenLogsFolder = async () => {
    const dir = logsDir();
    if (dir) {
      try {
        await open(dir);
        logger.info('app', 'User opened logs folder');
      } catch (error) {
        console.error("Failed to open logs folder:", error);
      }
    }
  };

  // Format bytes to human-readable string
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Load initial preferences and app version
  onMount(async () => {
    const prefs = getNotificationPreferences();
    setCurrentPreferences(prefs);
    setSavedPreferences(prefs);
    setSavedTheme(theme());
    setSavedLanguage(language());

    // Fetch app version
    try {
      const version = await getVersion();
      setAppVersion(version);
    } catch (error) {
      console.error("Failed to get app version:", error);
      setAppVersion("1.0.0"); // Fallback
    }

    // Fetch logs info
    try {
      const [dir, size] = await Promise.all([
        logger.getLogsDirectory(),
        logger.getTotalSize(),
      ]);
      setLogsDir(dir);
      setLogsTotalSize(size);
    } catch (error) {
      console.error("Failed to get logs info:", error);
    }
  });

  // Detect changes
  const hasChanges = createMemo(() => {
    const current = currentPreferences();
    const saved = savedPreferences();
    return (
      current.notificationsEnabled !== saved.notificationsEnabled ||
      current.soundEnabled !== saved.soundEnabled ||
      current.soundVolume !== saved.soundVolume ||
      currentTheme() !== savedTheme() ||
      currentLanguage() !== savedLanguage()
    );
  });

  // Get list of changed settings for display in confirmation dialog
  const getChangedSettings = () => {
    const changes: string[] = [];
    const current = currentPreferences();
    const saved = savedPreferences();

    if (current.notificationsEnabled !== saved.notificationsEnabled) {
      changes.push(
        `${t("settings.notificationsEnabled")}: ${current.notificationsEnabled ? "On" : "Off"}`
      );
    }
    if (current.soundEnabled !== saved.soundEnabled) {
      changes.push(
        `${t("settings.sound")}: ${current.soundEnabled ? "On" : "Off"}`
      );
    }
    if (current.soundVolume !== saved.soundVolume) {
      changes.push(
        `${t("settings.volume")}: ${Math.round(current.soundVolume * 100)}%`
      );
    }
    if (currentTheme() !== savedTheme()) {
      changes.push(
        `${t("settings.theme")}: ${t(`theme.${currentTheme()}`)}`
      );
    }
    if (currentLanguage() !== savedLanguage()) {
      const langName = currentLanguage() === "en" ? "English" : "العربية";
      changes.push(
        `${t("settings.language")}: ${langName}`
      );
    }

    return changes;
  };

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Save notification preferences
      saveNotificationPreferences(currentPreferences());

      // Save theme
      setTheme(currentTheme());

      // Save language (if changed)
      if (currentLanguage() !== savedLanguage()) {
        setLanguage(currentLanguage());
      }

      // Update saved state
      setSavedPreferences(currentPreferences());
      setSavedTheme(currentTheme());
      setSavedLanguage(currentLanguage());

      setIsSaving(false);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setIsSaving(false);
      alert('Failed to save settings. Please try again.');
    }
  };

  // Handle cancel
  const handleCancel = () => {
    // Restore saved state
    setCurrentPreferences(savedPreferences());
    setCurrentTheme(savedTheme());
    setCurrentLanguage(savedLanguage());
  };

  // Handle back navigation
  const handleBack = () => {
    if (hasChanges()) {
      setShowCancelDialog(true);
    } else {
      navigate("/tickets");
    }
  };

  // Handle save button click
  const handleSaveClick = () => {
    if (hasChanges()) {
      setShowSaveDialog(true);
    }
  };

  // Handle cancel button click
  const handleCancelClick = () => {
    if (hasChanges()) {
      setShowCancelDialog(true);
    }
  };

  // Handle discard and navigate
  const handleDiscardAndNavigate = () => {
    handleCancel();
    navigate("/tickets");
  };

  return (
    <div class="min-h-screen bg-background pb-24">
      {/* Header */}
      <div class="bg-card border-b border-border px-4 py-3 sticky top-0 z-10">
        <div class="flex items-center gap-3">
          <button
            onClick={handleBack}
            class="p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Go back"
          >
            <svg
              class="w-5 h-5 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 class="text-lg font-semibold text-foreground">
            {t("settings.title")}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div class="p-4 space-y-6">
        {/* User Info Card */}
        <Card class="p-6 max-w-md mx-auto">
          <h2 class="text-lg font-semibold mb-4 text-foreground">
            {t("settings.account")}
          </h2>
          <div class="space-y-3">
            <div>
              <p class="text-xs text-muted-foreground uppercase tracking-wide">
                {t("settings.username")}
              </p>
              <p class="text-sm font-medium text-foreground">
                {user()?.username}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground uppercase tracking-wide">
                {t("settings.fullName")}
              </p>
              <p class="text-sm font-medium text-foreground">
                {user()?.fullName || "N/A"}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted-foreground uppercase tracking-wide">
                {t("settings.email")}
              </p>
              <p class="text-sm font-medium text-foreground">
                {user()?.email || "N/A"}
              </p>
            </div>
            <div class="pt-3 mt-3 border-t border-border/50">
              <p class="text-xs text-muted-foreground uppercase tracking-wide">
                App Version
              </p>
              <p class="text-sm font-mono font-medium text-foreground">
                {appVersion()}
              </p>
            </div>
          </div>
        </Card>

        {/* Notification Preferences */}
        <NotificationPreferencesCard
          preferences={currentPreferences}
          onUpdate={setCurrentPreferences}
        />

        {/* Theme Settings */}
        <Card class="p-6 max-w-md mx-auto">
          <h2 class="text-lg font-semibold mb-4 text-foreground">
            {t("settings.theme")}
          </h2>
          <div class="space-y-3">
            <p class="text-xs text-muted-foreground">
              {t("settings.themeDesc")}
            </p>

            {/* Theme Options */}
            <div class="grid grid-cols-3 gap-3">
              {/* Light */}
              <button
                onClick={() => setCurrentTheme("light")}
                class={`
                  flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all
                  ${
                    currentTheme() === "light"
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/50"
                  }
                `}
              >
                <Sun
                  class={`w-6 h-6 ${
                    currentTheme() === "light"
                      ? "text-accent"
                      : "text-muted-foreground"
                  }`}
                />
                <span
                  class={`text-sm font-medium ${
                    currentTheme() === "light"
                      ? "text-accent-foreground"
                      : "text-foreground"
                  }`}
                >
                  {t("theme.light")}
                </span>
              </button>

              {/* Dark */}
              <button
                onClick={() => setCurrentTheme("dark")}
                class={`
                  flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all
                  ${
                    currentTheme() === "dark"
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/50"
                  }
                `}
              >
                <Moon
                  class={`w-6 h-6 ${
                    currentTheme() === "dark"
                      ? "text-accent"
                      : "text-muted-foreground"
                  }`}
                />
                <span
                  class={`text-sm font-medium ${
                    currentTheme() === "dark"
                      ? "text-accent-foreground"
                      : "text-foreground"
                  }`}
                >
                  {t("theme.dark")}
                </span>
              </button>

              {/* System */}
              <button
                onClick={() => setCurrentTheme("system")}
                class={`
                  flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all
                  ${
                    currentTheme() === "system"
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/50"
                  }
                `}
              >
                <Monitor
                  class={`w-6 h-6 ${
                    currentTheme() === "system"
                      ? "text-accent"
                      : "text-muted-foreground"
                  }`}
                />
                <span
                  class={`text-sm font-medium ${
                    currentTheme() === "system"
                      ? "text-accent-foreground"
                      : "text-foreground"
                  }`}
                >
                  {t("theme.system")}
                </span>
              </button>
            </div>
          </div>
        </Card>

        {/* Language Settings */}
        <Card class="p-6 max-w-md mx-auto">
          <h2 class="text-lg font-semibold mb-4 text-foreground">
            <Languages class="inline h-5 w-5 mr-2" />
            {t("settings.language")}
          </h2>
          <div class="space-y-3">
            <p class="text-xs text-muted-foreground">
              {t("settings.themeDesc")}
            </p>

            {/* Language Options */}
            <div class="space-y-2">
              {/* English */}
              <label
                class={`
                  flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer
                  ${
                    currentLanguage() === "en"
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/50"
                  }
                `}
              >
                <input
                  type="radio"
                  name="language"
                  value="en"
                  checked={currentLanguage() === "en"}
                  onChange={() => setCurrentLanguage("en")}
                  class="w-4 h-4 text-accent focus:ring-accent"
                />
                <span
                  class={`text-sm font-medium ${
                    currentLanguage() === "en"
                      ? "text-accent-foreground"
                      : "text-foreground"
                  }`}
                >
                  English
                </span>
              </label>

              {/* Arabic */}
              <label
                class={`
                  flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer
                  ${
                    currentLanguage() === "ar"
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/50"
                  }
                `}
              >
                <input
                  type="radio"
                  name="language"
                  value="ar"
                  checked={currentLanguage() === "ar"}
                  onChange={() => setCurrentLanguage("ar")}
                  class="w-4 h-4 text-accent focus:ring-accent"
                />
                <span
                  class={`text-sm font-medium ${
                    currentLanguage() === "ar"
                      ? "text-accent-foreground"
                      : "text-foreground"
                  }`}
                >
                  العربية (Arabic)
                </span>
              </label>
            </div>
          </div>
        </Card>

        {/* Debug Logs Card */}
        <Show when={logsDir()}>
          <Card class="p-6 max-w-md mx-auto">
            <h2 class="text-lg font-semibold mb-4 text-foreground">
              Debug Logs
            </h2>
            <div class="space-y-4">
              <p class="text-xs text-muted-foreground">
                Session logs are stored locally on your device for troubleshooting issues.
                They contain no sensitive data and are never sent automatically.
              </p>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-foreground">Log Files</p>
                  <p class="text-xs text-muted-foreground">
                    Total size: {formatBytes(logsTotalSize())}
                  </p>
                </div>
                <Button
                  onClick={handleOpenLogsFolder}
                  variant="outline"
                  size="sm"
                  class="flex items-center gap-2"
                >
                  <FolderOpen class="w-4 h-4" />
                  Open Folder
                </Button>
              </div>
            </div>
          </Card>
        </Show>

        {/* App Version */}
        <div class="text-center text-xs text-muted-foreground pt-4">
          {t("settings.version")}
        </div>
      </div>

      {/* Persistent Footer */}
      <div class="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 z-20">
        <div class="max-w-md mx-auto flex items-center justify-end gap-3">
          <Button
            onClick={handleCancelClick}
            variant="outline"
            disabled={!hasChanges()}
            class="min-w-[120px]"
          >
            {t("settings.cancel")}
          </Button>
          <Button
            onClick={handleSaveClick}
            disabled={!hasChanges() || isSaving()}
            class="min-w-[120px] bg-accent hover:bg-accent-600 text-accent-foreground disabled:opacity-50"
          >
            {isSaving() ? t("settings.saving") : t("settings.save")}
          </Button>
        </div>
      </div>

      {/* Save Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showSaveDialog()}
        onClose={() => setShowSaveDialog(false)}
        onConfirm={handleSave}
        title={t("confirm.saveTitle")}
        message={t("confirm.saveMessage")}
        confirmText={t("confirm.save")}
        cancelText={t("settings.cancel")}
      >
        <div class="space-y-2">
          <p class="text-xs font-semibold text-foreground">
            {t("confirm.changedSettings")}
          </p>
          <ul class="text-xs text-muted-foreground space-y-1">
            {getChangedSettings().map((change) => (
              <li class="flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-accent" />
                {change}
              </li>
            ))}
          </ul>
        </div>
      </ConfirmationDialog>

      {/* Cancel Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showCancelDialog()}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleDiscardAndNavigate}
        title={t("confirm.discardTitle")}
        message={t("confirm.discardMessage")}
        confirmText={t("confirm.discard")}
        cancelText={t("confirm.keepEditing")}
        variant="destructive"
      />
    </div>
  );
}
