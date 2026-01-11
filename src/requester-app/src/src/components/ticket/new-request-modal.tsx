/**
 * New Request Modal Component - Modern WhatsApp-style Design
 *
 * Modal dialog for creating a new support request with dual language support.
 * Uses the Andalusia Health brand theme (warm browns and golds).
 * Clean, minimal design inspired by WhatsApp.
 */

import { createSignal, Show, For, createResource, onMount, onCleanup } from "solid-js";
import { X, Send, CheckCircle2, ChevronDown } from "lucide-solid";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getRequestTypes } from "@/api/request-types";
import { useLanguage } from "@/context/language-context";
import type { RequestType } from "@/types";

interface NewRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, requestTypeId?: number) => Promise<void>;
  isSubmitting?: boolean;
  error?: string | null;
}

export function NewRequestModal(props: NewRequestModalProps) {
  const { language, direction, t } = useLanguage();
  const [title, setTitle] = createSignal("");
  const [requestTypeId, setRequestTypeId] = createSignal<number | undefined>(undefined);
  const [validationError, setValidationError] = createSignal<string | null>(null);
  const [showSuccessFeedback, setShowSuccessFeedback] = createSignal(false);
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const [windowHeight, setWindowHeight] = createSignal(window.innerHeight);

  onMount(() => {
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener("resize", handleResize);
    onCleanup(() => window.removeEventListener("resize", handleResize));
  });

  const isCompactMode = () => windowHeight() < 500;

  const [requestTypes] = createResource<RequestType[]>(
    async () => {
      try {
        return await getRequestTypes(true);
      } catch (error) {
        console.error("Internal Server Error request types:", error);
        return [];
      }
    }
  );

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedTitle = title().trim();
    if (trimmedTitle.length < 5) {
      setValidationError(t("modal.errorShort"));
      return;
    }
    if (trimmedTitle.length > 200) {
      setValidationError(t("modal.errorLong"));
      return;
    }

    await props.onSubmit(trimmedTitle, requestTypeId());

    setShowSuccessFeedback(true);
    setTimeout(() => {
      setTitle("");
      setRequestTypeId(undefined);
      setShowSuccessFeedback(false);
    }, 500);
  };

  const handleClose = () => {
    if (!props.isSubmitting) {
      setTitle("");
      setRequestTypeId(undefined);
      setValidationError(null);
      props.onClose();
    }
  };

  const displayError = () => validationError() || props.error;
  const charCount = () => title().trim().length;
  const isValid = () => charCount() >= 5 && charCount() <= 200;

  const selectedTypeName = () => {
    if (!requestTypeId()) return null;
    const type = requestTypes()?.find(t => t.id === requestTypeId());
    if (!type) return null;
    return language() === "ar" ? type.nameAr : type.nameEn;
  };

  const selectedTypeBrief = () => {
    if (!requestTypeId()) return null;
    const type = requestTypes()?.find(t => t.id === requestTypeId());
    if (!type) return null;
    return language() === "ar" ? type.briefAr : type.briefEn;
  };

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center p-3"
        dir={direction()}
      >
        {/* Backdrop */}
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-sm modal-backdrop"
          onClick={handleClose}
        />

        {/* Modal */}
        <div
          class="relative w-full max-w-sm bg-card rounded-2xl shadow-xl overflow-hidden modal-content"
          style={{ "max-height": `${Math.min(windowHeight() - 40, 480)}px` }}
        >
          {/* Header */}
          <div class="flex items-center justify-between px-4 py-3 bg-primary">
            <h2 class="text-base font-semibold text-primary-foreground">
              {t("modal.title")}
            </h2>
            <button
              onClick={handleClose}
              disabled={props.isSubmitting}
              class="p-1.5 rounded-full text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10 transition-colors"
            >
              <X class="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} class="p-4 space-y-4">
            {/* Error Message */}
            <Show when={displayError()}>
              <div class="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 modal-shake">
                <span class="text-destructive text-sm">{displayError()}</span>
              </div>
            </Show>

            {/* Success Feedback */}
            <Show when={showSuccessFeedback()}>
              <div class="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20 modal-slide-in">
                <CheckCircle2 class="h-4 w-4 text-success" />
                <span class="text-success text-sm font-medium">{t("modal.success")}</span>
              </div>
            </Show>

            {/* Request Type Dropdown */}
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-foreground">
                {t("modal.classification")}
              </label>
              <div class="relative">
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen())}
                  disabled={props.isSubmitting || requestTypes.loading}
                  class="w-full h-11 px-3 rounded-lg border bg-background text-start flex items-center justify-between transition-all disabled:opacity-50"
                  classList={{
                    "border-accent ring-2 ring-accent/20": dropdownOpen(),
                    "border-border hover:border-primary/30": !dropdownOpen(),
                  }}
                >
                  <span
                    class="truncate text-sm"
                    classList={{
                      "text-muted-foreground": !requestTypeId(),
                      "text-foreground": !!requestTypeId(),
                    }}
                  >
                    {selectedTypeName() || t("modal.classificationPlaceholder")}
                  </span>
                  <ChevronDown
                    class="h-4 w-4 text-muted-foreground transition-transform"
                    classList={{ "rotate-180": dropdownOpen() }}
                  />
                </button>

                {/* Dropdown Menu */}
                <Show when={dropdownOpen()}>
                  <div
                    class="absolute z-10 w-full mt-1 rounded-lg border border-border bg-card shadow-lg overflow-hidden modal-slide-in"
                    style={{ "max-height": "180px" }}
                  >
                    <div class="overflow-y-auto" style={{ "max-height": "180px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setRequestTypeId(undefined);
                          setDropdownOpen(false);
                        }}
                        class="w-full px-3 py-2.5 text-start text-sm text-muted-foreground hover:bg-secondary transition-colors"
                      >
                        {t("modal.classificationPlaceholder")}
                      </button>

                      <Show when={!requestTypes.loading && requestTypes()}>
                        <For each={requestTypes()}>
                          {(type) => (
                            <button
                              type="button"
                              onClick={() => {
                                setRequestTypeId(type.id);
                                setDropdownOpen(false);
                              }}
                              class="w-full px-3 py-2.5 text-start text-sm text-foreground hover:bg-secondary transition-colors border-t border-border/50"
                              classList={{ "bg-accent/10": requestTypeId() === type.id }}
                            >
                              {language() === "ar" ? type.nameAr : type.nameEn}
                            </button>
                          )}
                        </For>
                      </Show>

                      <Show when={requestTypes.loading}>
                        <div class="px-3 py-3 flex justify-center">
                          <Spinner size="sm" />
                        </div>
                      </Show>
                    </div>
                  </div>
                </Show>
              </div>
            </div>

            {/* Description Input */}
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="text-sm font-medium text-foreground">
                  {t("modal.description")}
                </label>
                <span
                  class="text-xs px-1.5 py-0.5 rounded"
                  classList={{
                    "text-accent bg-accent/10": isValid(),
                    "text-muted-foreground bg-muted/50": !isValid() && charCount() < 5,
                    "text-warning bg-warning/10": charCount() > 200,
                  }}
                >
                  {charCount()}/200
                </span>
              </div>
              <Show when={selectedTypeBrief()}>
                <p class="text-xs text-muted-foreground">{selectedTypeBrief()}</p>
              </Show>
              <textarea
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                placeholder={selectedTypeBrief() || t("modal.descriptionPlaceholder")}
                disabled={props.isSubmitting}
                rows={3}
                class="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground resize-none transition-all focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
                autofocus
              />
            </div>

            {/* Actions */}
            <div class="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={props.isSubmitting}
                class="flex-1 h-10 rounded-lg"
              >
                {t("modal.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={props.isSubmitting || !isValid()}
                class="flex-1 h-10 rounded-lg gap-2 font-medium transition-all"
                classList={{
                  "bg-accent hover:bg-accent/90 text-white": isValid(),
                  "bg-muted text-muted-foreground cursor-not-allowed": !isValid(),
                }}
              >
                <Show when={props.isSubmitting} fallback={
                  <>
                    <Send class="h-4 w-4" />
                    {t("modal.submit")}
                  </>
                }>
                  <Spinner size="sm" />
                  {t("modal.submitting")}
                </Show>
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Click outside to close dropdown */}
      <Show when={dropdownOpen()}>
        <div class="fixed inset-0 z-[5]" onClick={() => setDropdownOpen(false)} />
      </Show>

      {/* Animations */}
      <style>{`
        .modal-backdrop {
          animation: fadeIn 0.2s ease-out;
        }
        .modal-content {
          animation: scaleIn 0.2s ease-out;
        }
        .modal-shake {
          animation: shake 0.3s ease-in-out;
        }
        .modal-slide-in {
          animation: slideIn 0.2s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Show>
  );
}

export default NewRequestModal;
