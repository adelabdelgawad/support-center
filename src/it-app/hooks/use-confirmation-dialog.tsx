 
// hooks/use-confirmation-dialog.tsx
"use client";

import { useState, useCallback } from 'react';

interface UseConfirmationDialogProps {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive' | 'warning' | 'info' | 'success';
  autoClose?: boolean; // New optional parameter
}

export function useConfirmationDialog({
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = 'default',
  autoClose = true // Default to true for backward compatibility
}: UseConfirmationDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [_isLoading, setIsLoading] = useState(false);
  const [onConfirmCallback, setOnConfirmCallback] = useState<(() => void | Promise<void>) | null>(null);

  const openDialog = useCallback((onConfirm: () => void | Promise<void>) => {
    setOnConfirmCallback(() => onConfirm);
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setIsLoading(false);
    setOnConfirmCallback(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (onConfirmCallback) {
      setIsLoading(true);
      try {
        await onConfirmCallback();
        
        // Only auto-close if autoClose is true
        if (autoClose) {
          closeDialog();
        } else {
          // Just reset loading state but keep dialog open
          setIsLoading(false);
          // Optionally clear the callback to prevent multiple executions
          setOnConfirmCallback(null);
        }
      } catch (error) {
        setIsLoading(false);
        // Don't close dialog on error, let the parent handle it
      }
    }
  }, [onConfirmCallback, closeDialog, autoClose]);

  return {
    isOpen,
    _isLoading,
    openDialog,
    closeDialog,
    handleConfirm,
    dialogProps: {
      title,
      description,
      confirmText,
      cancelText,
      variant
    }
  };
}
