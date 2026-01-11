/**
 * Notification Preferences Component
 *
 * Allows users to configure notification settings:
 * - Enable/disable sound notifications
 * - Adjust notification sound volume
 *
 * NOTE: This is a controlled component. Parent manages saving.
 */

import { type Accessor } from "solid-js";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import { type NotificationPreferences } from "@/lib/notifications";

interface NotificationPreferencesCardProps {
  /** Current preferences */
  preferences: Accessor<NotificationPreferences>;
  /** Update preferences callback */
  onUpdate: (preferences: NotificationPreferences) => void;
}

export function NotificationPreferencesCard(
  props: NotificationPreferencesCardProps
) {
  const { t, direction } = useLanguage();

  // Toggle notifications enabled (master toggle)
  const toggleNotifications = () => {
    props.onUpdate({
      ...props.preferences(),
      notificationsEnabled: !props.preferences().notificationsEnabled,
    });
  };

  // Toggle sound enabled
  const toggleSound = () => {
    props.onUpdate({
      ...props.preferences(),
      soundEnabled: !props.preferences().soundEnabled,
    });
  };

  // Update volume
  const updateVolume = (value: number) => {
    props.onUpdate({
      ...props.preferences(),
      soundVolume: value,
    });
  };

  return (
    <Card class="p-6 max-w-md mx-auto">
      <h2 class="text-lg font-semibold mb-4 text-foreground">
        {t("settings.notifications")}
      </h2>

      <div class="space-y-6">
        {/* Master Notifications Toggle */}
        <div class="flex items-center justify-between pb-4 border-b border-border">
          <div class="space-y-1">
            <Label class="text-sm font-semibold text-foreground">
              {t("settings.notificationsEnabled")}
            </Label>
            <p class="text-xs text-muted-foreground">
              {t("settings.notificationsEnabledDesc")}
            </p>
          </div>

          <button
            onClick={toggleNotifications}
            class={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${
                props.preferences().notificationsEnabled
                  ? "bg-accent"
                  : "bg-muted"
              }
            `}
            role="switch"
            aria-checked={props.preferences().notificationsEnabled}
          >
            <span
              class={`
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${
                  direction() === "rtl"
                    ? props.preferences().notificationsEnabled
                      ? "-translate-x-5"
                      : "translate-x-0"
                    : props.preferences().notificationsEnabled
                      ? "translate-x-5"
                      : "translate-x-0"
                }
              `}
            />
          </button>
        </div>

        {/* Sound Toggle */}
        <div class={`flex items-center justify-between ${!props.preferences().notificationsEnabled ? 'opacity-50' : ''}`}>
          <div class="space-y-1">
            <Label class="text-sm font-medium text-foreground">
              {t("settings.sound")}
            </Label>
            <p class="text-xs text-muted-foreground">
              {t("settings.soundDesc")}
            </p>
          </div>

          <button
            onClick={toggleSound}
            disabled={!props.preferences().notificationsEnabled}
            class={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${
                props.preferences().soundEnabled && props.preferences().notificationsEnabled
                  ? "bg-accent"
                  : "bg-muted"
              }
              ${!props.preferences().notificationsEnabled ? 'cursor-not-allowed' : ''}
            `}
            role="switch"
            aria-checked={props.preferences().soundEnabled}
          >
            <span
              class={`
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${
                  direction() === "rtl"
                    ? props.preferences().soundEnabled
                      ? "-translate-x-5"
                      : "translate-x-0"
                    : props.preferences().soundEnabled
                      ? "translate-x-5"
                      : "translate-x-0"
                }
              `}
            />
          </button>
        </div>

        {/* Volume Slider */}
        <div class={`space-y-2 ${!props.preferences().notificationsEnabled ? 'opacity-50' : ''}`}>
          <div class="flex items-center justify-between">
            <Label class="text-sm font-medium text-foreground">
              {t("settings.volume")}
            </Label>
            <span class="text-sm text-muted-foreground">
              {Math.round(props.preferences().soundVolume * 100)}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={props.preferences().soundVolume}
            onInput={(e) => updateVolume(parseFloat(e.currentTarget.value))}
            disabled={!props.preferences().soundEnabled || !props.preferences().notificationsEnabled}
            class={`
              w-full h-2 rounded-lg appearance-none cursor-pointer
              ${
                props.preferences().soundEnabled && props.preferences().notificationsEnabled
                  ? "bg-secondary hover:bg-muted"
                  : "bg-muted/50 cursor-not-allowed"
              }
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-accent
              [&::-webkit-slider-thumb]:cursor-pointer
              ${
                (!props.preferences().soundEnabled || !props.preferences().notificationsEnabled) &&
                "[&::-webkit-slider-thumb]:bg-muted-foreground"
              }
            `}
          />
        </div>
      </div>
    </Card>
  );
}
