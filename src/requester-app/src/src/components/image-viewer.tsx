/**
 * ImageViewer Component - WhatsApp-style full-screen image viewer
 *
 * Features:
 * - Full-screen overlay with blurred backdrop
 * - Large centered image display
 * - Thumbnail strip for multiple images
 * - Keyboard navigation (arrow keys, Escape)
 * - Navigation arrows for prev/next
 * - Close button and click-outside-to-close
 */

import { Show, For, createEffect, onCleanup } from "solid-js";
import { useImageViewer } from "@/context/image-viewer-context";
import { X, ChevronLeft, ChevronRight } from "lucide-solid";
import { cn } from "@/lib/utils";

export function ImageViewer() {
  const viewer = useImageViewer();

  // Keyboard navigation handler
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!viewer.isOpen()) return;

    switch (e.key) {
      case "Escape":
        viewer.closeViewer();
        break;
      case "ArrowLeft":
        e.preventDefault();
        viewer.previousImage();
        break;
      case "ArrowRight":
        e.preventDefault();
        viewer.nextImage();
        break;
    }
  };

  // Setup keyboard listeners when viewer is open
  createEffect(() => {
    if (viewer.isOpen()) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when viewer is open
      document.body.style.overflow = "hidden";

      onCleanup(() => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      });
    }
  });

  // Backdrop click handler (close viewer)
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      viewer.closeViewer();
    }
  };

  const hasMultipleImages = () => viewer.images().length > 1;
  const hasPrevious = () => viewer.currentIndex() > 0;
  const hasNext = () => viewer.currentIndex() < viewer.images().length - 1;

  return (
    <Show when={viewer.isOpen()}>
      {/* Full-screen overlay with backdrop */}
      <div
        class="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-label="Image viewer"
      >
        {/* Close button - top right */}
        <button
          onClick={() => viewer.closeViewer()}
          class="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors duration-150 backdrop-blur-sm"
          aria-label="Close viewer"
          title="Close (Esc)"
        >
          <X class="h-6 w-6" />
        </button>

        {/* Main image container */}
        <div class="flex-1 flex items-center justify-center w-full px-4 py-16">
          <Show when={viewer.currentImage()}>
            {(image) => (
              <div class="relative max-w-7xl max-h-full w-full h-full flex items-center justify-center">
                {/* Previous button */}
                <Show when={hasMultipleImages() && hasPrevious()}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      viewer.previousImage();
                    }}
                    class="absolute left-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-150 backdrop-blur-sm hover:scale-110"
                    aria-label="Previous image"
                    title="Previous (←)"
                  >
                    <ChevronLeft class="h-6 w-6" />
                  </button>
                </Show>

                {/* Main image */}
                <img
                  src={image().url}
                  alt={image().caption || "Screenshot"}
                  class="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
                  style={{ "pointer-events": "none" }}
                />

                {/* Next button */}
                <Show when={hasMultipleImages() && hasNext()}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      viewer.nextImage();
                    }}
                    class="absolute right-4 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-150 backdrop-blur-sm hover:scale-110"
                    aria-label="Next image"
                    title="Next (→)"
                  >
                    <ChevronRight class="h-6 w-6" />
                  </button>
                </Show>

                {/* Image counter */}
                <Show when={hasMultipleImages()}>
                  <div class="absolute top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-full bg-black/50 text-white text-sm font-medium backdrop-blur-sm">
                    {viewer.currentIndex() + 1} / {viewer.images().length}
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </div>

        {/* Thumbnail strip - bottom */}
        <Show when={hasMultipleImages()}>
          <div class="w-full px-4 pb-4">
            <div class="max-w-5xl mx-auto bg-black/30 backdrop-blur-sm rounded-lg p-3">
              <div class="flex gap-2 overflow-x-auto">
                <For each={viewer.images()}>
                  {(image, index) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        viewer.selectImage(index());
                      }}
                      class={cn(
                        "flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden transition-all duration-150 border-2",
                        viewer.currentIndex() === index()
                          ? "border-white shadow-lg scale-105"
                          : "border-transparent opacity-60 hover:opacity-100 hover:scale-105"
                      )}
                      aria-label={`View image ${index() + 1}`}
                    >
                      <img
                        src={image.url}
                        alt={`Thumbnail ${index() + 1}`}
                        class="w-full h-full object-cover"
                      />
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>

        {/* Inline animations */}
        <style>{`
          @keyframes fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes zoom-in-95 {
            from {
              opacity: 0;
              transform: scale(0.95);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
          .animate-in {
            animation-fill-mode: both;
          }
          .fade-in {
            animation-name: fade-in;
          }
          .zoom-in-95 {
            animation-name: zoom-in-95;
          }
          .duration-200 {
            animation-duration: 200ms;
          }
        `}</style>
      </div>
    </Show>
  );
}
