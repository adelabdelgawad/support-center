/**
 * ChatLayout Component - SolidJS version
 *
 * Layout for the chat/tickets interface
 * Uses single-column mobile-style layout for requester app
 */

import { createSignal, Show, type ParentComponent, type JSX } from "solid-js";
import { authStore, useUser } from "@/stores";
import { useLanguage } from "@/context/language-context";
import { SettingsDialog } from "@/components/settings-dialog";
import {
  ChevronDown,
  Settings,
} from "lucide-solid";

interface ChatLayoutProps {
  variant?: "split" | "single";
  filterBar?: JSX.Element; // Optional filter section
}

/**
 * Profile Menu Component
 */
function ProfileMenu() {
  const [isOpen, setIsOpen] = createSignal(false);
  const [isSettingsOpen, setIsSettingsOpen] = createSignal(false);
  const user = useUser();
  const { t, direction } = useLanguage();

  const getUserInitials = () => {
    const currentUser = user();
    if (!currentUser?.fullName) {
      return currentUser?.username?.charAt(0)?.toUpperCase() || "U";
    }
    return currentUser.fullName
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getUserRole = () => {
    const currentUser = user();
    if (currentUser?.isTechnician) return t("chat.support");
    if (currentUser?.isSuperAdmin) return t("chat.administrator");
    return t("chat.requester");
  };

  const handleBackdropClick = () => {
    setIsOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <Show when={user()}>
      <div class="relative">
        {/* Avatar Trigger */}
        <button
          onClick={() => setIsOpen(!isOpen())}
          onKeyDown={handleKeyDown}
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-full hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-2 transition-all duration-200 group"
          aria-label="Profile menu"
          aria-expanded={isOpen()}
          aria-haspopup="menu"
        >
          {/* Circular Avatar */}
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-muted to-muted-foreground/20 flex items-center justify-center text-foreground font-semibold text-sm ring-2 ring-card shadow-sm transition-transform duration-200 group-hover:scale-105">
            {getUserInitials()}
          </div>
          {/* Chevron Indicator */}
          <ChevronDown
            class={`h-3.5 w-3.5 text-muted-foreground transition-all duration-300 ${
              isOpen() ? "rotate-180 text-foreground" : "rotate-0"
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        <Show when={isOpen()}>
          {/* Backdrop */}
          <div
            class="fixed inset-0 z-40 bg-black/5 backdrop-blur-[1px]"
            onClick={handleBackdropClick}
          />

          {/* Menu Card */}
          <div class="absolute end-0 top-full mt-2 w-80 bg-card rounded-2xl shadow-2xl border border-border/60 z-50 overflow-hidden">
            {/* Profile Section */}
            <div class="p-5 bg-gradient-to-br from-background to-card">
              <div class="flex items-center gap-3.5">
                {/* Larger Avatar */}
                <div class="relative">
                  <div class="w-12 h-12 rounded-full bg-gradient-to-br from-muted to-muted-foreground/30 flex items-center justify-center text-foreground font-bold text-lg ring-2 ring-card shadow-md">
                    {getUserInitials()}
                  </div>
                  {/* Online indicator */}
                  <div class="absolute bottom-0 end-0 w-3 h-3 bg-success rounded-full ring-2 ring-card shadow-sm" />
                </div>

                {/* User Info */}
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold text-foreground truncate leading-tight tracking-tight text-start">
                    {user()?.fullName || user()?.username}
                  </p>
                  <span class="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-md bg-secondary/70 text-[10px] font-semibold text-foreground uppercase tracking-wide">
                    {getUserRole()}
                  </span>
                  <Show when={user()?.email}>
                    <p class="text-xs text-muted-foreground mt-1.5 font-normal truncate text-start">
                      {user()?.email}
                    </p>
                  </Show>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div class="py-2 px-3">
              <button
                onClick={() => {
                  setIsOpen(false);
                  setIsSettingsOpen(true);
                }}
                class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary rounded-lg transition-colors duration-150 ltr:justify-start rtl:justify-end rtl:flex-row-reverse"
              >
                <Settings class="h-4 w-4 text-muted-foreground" />
                <span class="text-start">{t("layout.settings")}</span>
              </button>
            </div>
          </div>
        </Show>

        {/* Settings Dialog */}
        <SettingsDialog
          isOpen={isSettingsOpen()}
          onClose={() => setIsSettingsOpen(false)}
        />
      </div>
    </Show>
  );
}

export const ChatLayout: ParentComponent<ChatLayoutProps> = (props) => {
  const { t, direction } = useLanguage();

  // Single-column layout for requester tickets page (mobile-style)
  return (
    <div class="flex flex-col h-screen bg-background overflow-hidden">
      {/* Fixed Header - WhatsApp-style */}
      <div class="flex-shrink-0 bg-card px-3 py-2 flex items-center justify-between border-b border-border shadow-sm">
        <h1 class="text-lg font-semibold text-foreground">{t("layout.supportChat")}</h1>
        <div class="flex items-center gap-2">
          <ProfileMenu />
        </div>
      </div>

      {/* Fixed Filter Bar (optional) - includes search when provided */}
      <Show when={props.filterBar}>
        <div class="flex-shrink-0 px-3 py-2.5 bg-card border-b border-border">
          {props.filterBar}
        </div>
      </Show>

      {/* Scrollable Content Area - ONLY THIS SCROLLS */}
      <div class="flex-1 min-h-0 bg-card">
        {props.children}
      </div>
    </div>
  );
};

export default ChatLayout;
