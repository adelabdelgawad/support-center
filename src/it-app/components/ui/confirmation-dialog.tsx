// components/ui/confirmation-dialog.tsx
"use client";

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Info, CheckCircle, XCircle } from "lucide-react";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: 'default' | 'destructive' | 'warning' | 'info' | 'success';
  _isLoading?: boolean;
  icon?: boolean;
}

const variantConfig = {
  default: {
    icon: Info,
    actionVariant: 'default' as const,
    iconColor: 'text-blue-500'
  },
  destructive: {
    icon: XCircle,
    actionVariant: 'destructive' as const,
    iconColor: 'text-red-500'
  },
  warning: {
    icon: AlertTriangle,
    actionVariant: 'default' as const,
    iconColor: 'text-yellow-500'
  },
  info: {
    icon: Info,
    actionVariant: 'default' as const,
    iconColor: 'text-blue-500'
  },
  success: {
    icon: CheckCircle,
    actionVariant: 'default' as const,
    iconColor: 'text-green-500'
  }
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  variant = 'default',
  _isLoading = false,
  icon = true
}: ConfirmationDialogProps) {
  const config = variantConfig[variant];
  const IconComponent = config.icon;

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onOpenChange(false);
    }
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {icon && <IconComponent className={`h-5 w-5 ${config.iconColor}`} />}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={_isLoading}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleConfirm}
            disabled={_isLoading}
            className={config.actionVariant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {_isLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Loading...
              </div>
            ) : (
              confirmText
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
