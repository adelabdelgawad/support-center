/**
 * ImageViewer Context - WhatsApp-style image viewer state management
 *
 * Manages the state for the full-screen image viewer including:
 * - Open/close state
 * - Current image selection
 * - List of all images in the chat
 * - Navigation between images
 */

import { createContext, useContext, createSignal, type ParentComponent, type Accessor } from "solid-js";

export interface ImageViewerImage {
  id: string;
  url: string; // blob URL or authenticated URL
  messageId: string;
  createdAt: string;
  caption?: string;
}

interface ImageViewerContextValue {
  // State
  isOpen: Accessor<boolean>;
  images: Accessor<ImageViewerImage[]>;
  currentIndex: Accessor<number>;
  currentImage: Accessor<ImageViewerImage | null>;

  // Actions
  openViewer: (images: ImageViewerImage[], initialIndex: number) => void;
  closeViewer: () => void;
  nextImage: () => void;
  previousImage: () => void;
  selectImage: (index: number) => void;
}

const ImageViewerContext = createContext<ImageViewerContextValue>();

export const ImageViewerProvider: ParentComponent = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [images, setImages] = createSignal<ImageViewerImage[]>([]);
  const [currentIndex, setCurrentIndex] = createSignal(0);

  const currentImage = (): ImageViewerImage | null => {
    const imgs = images();
    const idx = currentIndex();
    return imgs[idx] || null;
  };

  const openViewer = (imageList: ImageViewerImage[], initialIndex: number) => {
    setImages(imageList);
    setCurrentIndex(initialIndex);
    setIsOpen(true);
  };

  const closeViewer = () => {
    setIsOpen(false);
    // Clear images after animation completes
    setTimeout(() => {
      setImages([]);
      setCurrentIndex(0);
    }, 300);
  };

  const nextImage = () => {
    const imgs = images();
    if (imgs.length > 0) {
      setCurrentIndex((prev) => (prev + 1) % imgs.length);
    }
  };

  const previousImage = () => {
    const imgs = images();
    if (imgs.length > 0) {
      setCurrentIndex((prev) => (prev - 1 + imgs.length) % imgs.length);
    }
  };

  const selectImage = (index: number) => {
    const imgs = images();
    if (index >= 0 && index < imgs.length) {
      setCurrentIndex(index);
    }
  };

  const value: ImageViewerContextValue = {
    isOpen,
    images,
    currentIndex,
    currentImage,
    openViewer,
    closeViewer,
    nextImage,
    previousImage,
    selectImage,
  };

  return (
    <ImageViewerContext.Provider value={value}>
      {props.children}
    </ImageViewerContext.Provider>
  );
};

export const useImageViewer = (): ImageViewerContextValue => {
  const context = useContext(ImageViewerContext);
  if (!context) {
    throw new Error("useImageViewer must be used within an ImageViewerProvider");
  }
  return context;
};
