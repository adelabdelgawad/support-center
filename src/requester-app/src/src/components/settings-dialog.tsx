/**
 * Settings Dialog Component
 *
 * Modal dialog for app settings, accessible from avatar dropdown.
 * Features:
 * - Account information (read-only)
 * - Notification preferences (sound toggle, volume slider)
 * - Theme selection (light, dark, system)
 * - Language toggle (English/Arabic)
 * - Change tracking with confirmation dialogs
 * - Persistent footer with Save/Cancel buttons
 */

import { createSignal, onMount, createMemo, Show } from "solid-js";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider, SliderTrack, SliderFill, SliderThumb } from "@/components/ui";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RTLSwitch } from "@/components/rtl-switch";
import { useUser } from "@/stores";
import { useLanguage, type Language } from "@/context/language-context";
import { useTheme } from "@/context/theme-context";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notifications";
import { X, User, Monitor, Moon, Sun, Languages, Bell, BellOff } from "lucide-solid";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const user = useUser();
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

  // Load preferences on mount
  onMount(() => {
    const prefs = getNotificationPreferences();
    setCurrentPreferences(prefs);
    setSavedPreferences(prefs);
    setSavedTheme(theme());
    setSavedLanguage(language());
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

  // Get list of changed settings
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
      changes.push(`${t("settings.theme")}: ${t(`theme.${currentTheme()}`)}`);
    }
    if (currentLanguage() !== savedLanguage()) {
      changes.push(
        `${t("settings.language")}: ${currentLanguage() === "en" ? "English" : "العربية"}`
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

      // Apply language change if different
      if (currentLanguage() !== savedLanguage()) {
        setLanguage(currentLanguage());
      }

      // Update saved state
      setSavedPreferences(currentPreferences());
      setSavedTheme(currentTheme());
      setSavedLanguage(currentLanguage());

      setIsSaving(false);

      // Close the settings dialog after successful save
      props.onClose();
    } catch (error) {
      console.error("Failed to save settings:", error);
      setIsSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setCurrentPreferences(savedPreferences());
    setCurrentTheme(savedTheme());
    setCurrentLanguage(savedLanguage());
  };

  // Toggle notifications
  const toggleNotifications = () => {
    setCurrentPreferences((prev) => ({
      ...prev,
      notificationsEnabled: !prev.notificationsEnabled,
    }));
  };

  // Toggle sound
  const toggleSound = () => {
    setCurrentPreferences((prev) => ({
      ...prev,
      soundEnabled: !prev.soundEnabled,
    }));
  };

  // Update volume
  const updateVolume = (value: number) => {
    setCurrentPreferences((prev) => ({
      ...prev,
      soundVolume: value,
    }));
  };

  // Handle close
  const handleClose = () => {
    if (hasChanges()) {
      setShowCancelDialog(true);
    } else {
      props.onClose();
    }
  };

  // Handle save click
  const handleSaveClick = () => {
    if (hasChanges()) {
      setShowSaveDialog(true);
    }
  };

  // Handle cancel click
  const handleCancelClick = () => {
    if (hasChanges()) {
      // Show confirmation dialog if there are unsaved changes
      setShowCancelDialog(true);
    } else {
      // Close immediately if no changes
      props.onClose();
    }
  };

  // Handle discard and close
  const handleDiscardAndClose = () => {
    handleCancel();
    props.onClose();
  };

  // Close on escape key
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !showSaveDialog() && !showCancelDialog()) {
      handleClose();
    }
  };

  // Close on backdrop click
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <Show when={props.isOpen}>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
      >
        {/* Dialog Card */}
        <div class="w-full max-w-lg bg-card rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div class="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
            <h2 class="text-xl font-semibold text-foreground">
              {t("settings.title")}
            </h2>
            <button
              onClick={handleClose}
              class="p-2 rounded-lg hover:bg-secondary transition-colors"
              aria-label="Close settings"
            >
              <X class="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          {/* Content - Scrollable */}
          <div class="overflow-y-auto flex-1 p-6 space-y-6">
            {/* Account Information Section */}
            <div class="space-y-3">
              <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
                <User class="h-4 w-4" />
                <span>{t("settings.account")}</span>
              </div>
              <Card class="p-4 bg-secondary/50 border-border">
                <div class="space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-sm text-muted-foreground">
                      {t("settings.username")}
                    </span>
                    <span class="text-sm font-medium text-foreground">
                      {user()?.username}
                    </span>
                  </div>
                  <Show when={user()?.fullName}>
                    <div class="flex justify-between items-center">
                      <span class="text-sm text-muted-foreground">
                        {t("settings.fullName")}
                      </span>
                      <span class="text-sm font-medium text-foreground">
                        {user()?.fullName}
                      </span>
                    </div>
                  </Show>
                  <Show when={user()?.email}>
                    <div class="flex justify-between items-center">
                      <span class="text-sm text-muted-foreground">
                        {t("settings.email")}
                      </span>
                      <span class="text-sm font-medium text-foreground">
                        {user()?.email}
                      </span>
                    </div>
                  </Show>
                </div>
              </Card>
            </div>

            {/* Divider */}
            <div class="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

            {/* Notification Settings Section */}
            <div class="space-y-4">
              <h3 class="text-sm font-semibold text-foreground">
                {t("settings.notifications")}
              </h3>

              {/* Notifications Enabled Toggle - Master control */}
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class={`p-2 rounded-lg ${currentPreferences().notificationsEnabled ? "bg-accent/10" : "bg-muted/50"}`}>
                    {currentPreferences().notificationsEnabled ? (
                      <Bell class="h-4 w-4 text-accent" />
                    ) : (
                      <BellOff class="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div class="space-y-1">
                    <Label class="text-sm font-medium text-foreground">
                      {t("settings.notificationsEnabled")}
                    </Label>
                    <p class="text-xs text-muted-foreground">
                      {t("settings.notificationsEnabledDesc")}
                    </p>
                  </div>
                </div>

                <RTLSwitch
                  checked={currentPreferences().notificationsEnabled}
                  onChange={() => toggleNotifications()}
                  aria-label={t("settings.notificationsEnabled")}
                />
              </div>

              {/* Sound Toggle - Only active when notifications enabled */}
              <Show when={currentPreferences().notificationsEnabled}>
                <div class="flex items-center justify-between ps-11 border-s-2 border-border ms-4">
                  <div class="space-y-1">
                    <Label class="text-sm font-medium text-foreground">
                      {t("settings.sound")}
                    </Label>
                    <p class="text-xs text-muted-foreground">
                      {t("settings.soundDesc")}
                    </p>
                  </div>

                  <RTLSwitch
                    checked={currentPreferences().soundEnabled}
                    onChange={() => toggleSound()}
                    aria-label={t("settings.sound")}
                  />
                </div>

                {/* Volume Slider - Only visible when sound enabled */}
                <Show when={currentPreferences().soundEnabled}>
                  <div class="space-y-2 ps-11 border-s-2 border-border ms-4">
                    <div class="flex items-center justify-between">
                      <Label class="text-sm font-medium text-foreground">
                        {t("settings.volume")}
                      </Label>
                      <span class="text-sm text-muted-foreground">
                        {Math.round(currentPreferences().soundVolume * 100)}%
                      </span>
                    </div>

                    <Slider
                      value={[currentPreferences().soundVolume]}
                      onChange={(value) => updateVolume(value[0])}
                      minValue={0}
                      maxValue={1}
                      step={0.1}
                      class="w-full"
                    >
                      <SliderTrack>
                        <SliderFill />
                        <SliderThumb />
                      </SliderTrack>
                    </Slider>
                  </div>
                </Show>
              </Show>
            </div>

            {/* Divider */}
            <div class="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

            {/* Theme Settings */}
            <div class="space-y-4">
              <h3 class="text-sm font-semibold text-foreground">
                {t("settings.theme")}
              </h3>
              <p class="text-xs text-muted-foreground">
                {t("settings.themeDesc")}
              </p>

              {/* Theme Options */}
              <div class="grid grid-cols-3 gap-3">
                {/* Light */}
                <button
                  onClick={() => setCurrentTheme("light")}
                  class={`
                    flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all
                    ${
                      currentTheme() === "light"
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-accent/50"
                    }
                  `}
                >
                  <Sun
                    class={`w-5 h-5 ${
                      currentTheme() === "light"
                        ? "text-accent"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span
                    class={`text-xs font-medium ${
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
                    flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all
                    ${
                      currentTheme() === "dark"
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-accent/50"
                    }
                  `}
                >
                  <Moon
                    class={`w-5 h-5 ${
                      currentTheme() === "dark"
                        ? "text-accent"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span
                    class={`text-xs font-medium ${
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
                    flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all
                    ${
                      currentTheme() === "system"
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-accent/50"
                    }
                  `}
                >
                  <Monitor
                    class={`w-5 h-5 ${
                      currentTheme() === "system"
                        ? "text-accent"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span
                    class={`text-xs font-medium ${
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

            {/* Divider */}
            <div class="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

            {/* Language Section */}
            <div class="space-y-4">
              <h3 class="text-sm font-semibold text-foreground">
                {t("settings.language")}
              </h3>
              <p class="text-xs text-muted-foreground">
                Choose your preferred language
              </p>

              {/* Language Options */}
              <div class="grid grid-cols-2 gap-3">
                {/* English */}
                <button
                  onClick={() => setCurrentLanguage("en")}
                  class={`
                    flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all
                    ${
                      currentLanguage() === "en"
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-accent/50"
                    }
                  `}
                  aria-label="Select English"
                >
                  <Languages
                    class={`w-5 h-5 ${
                      currentLanguage() === "en"
                        ? "text-accent"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span
                    class={`text-xs font-medium ${
                      currentLanguage() === "en"
                        ? "text-accent-foreground"
                        : "text-foreground"
                    }`}
                  >
                    English
                  </span>
                </button>

                {/* Arabic */}
                <button
                  onClick={() => setCurrentLanguage("ar")}
                  class={`
                    flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all
                    ${
                      currentLanguage() === "ar"
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-accent/50"
                    }
                  `}
                  aria-label="اختر العربية"
                >
                  <Languages
                    class={`w-5 h-5 ${
                      currentLanguage() === "ar"
                        ? "text-accent"
                        : "text-muted-foreground"
                    }`}
                  />
                  <span
                    class={`text-xs font-medium ${
                      currentLanguage() === "ar"
                        ? "text-accent-foreground"
                        : "text-foreground"
                    }`}
                  >
                    العربية
                  </span>
                </button>
              </div>
            </div>

            {/* App Version */}
            <div class="text-center pt-2">
              <p class="text-xs text-muted-foreground">
                {t("settings.version")}
              </p>
            </div>
          </div>

          {/* Persistent Footer */}
          <div class="border-t border-border p-4 bg-secondary/50/50 rounded-b-2xl">
            <div class="flex items-center justify-end gap-3">
              <Button
                onClick={handleCancelClick}
                variant="outline"
                class="min-w-[100px]"
              >
                {t("settings.cancel")}
              </Button>
              <Button
                onClick={handleSaveClick}
                disabled={!hasChanges() || isSaving()}
                class="min-w-[100px] bg-accent hover:bg-accent-600 text-accent-foreground disabled:opacity-50"
              >
                {isSaving() ? t("settings.saving") : t("settings.save")}
              </Button>
            </div>
          </div>
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
        onConfirm={handleDiscardAndClose}
        title={t("confirm.discardTitle")}
        message={t("confirm.discardMessage")}
        confirmText={t("confirm.discard")}
        cancelText={t("confirm.keepEditing")}
        variant="destructive"
      />
    </Show>
  );
}
