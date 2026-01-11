// Window management utilities for Tauri
import { invoke } from '@tauri-apps/api/core';

/**
 * Window management functions for the floating IT Support Center app
 */
export class WindowManager {
  /**
   * Show the main application window
   */
  static async showWindow(): Promise<void> {
    try {
      await invoke('show_window');
    } catch (error) {
      console.error('Failed to show window:', error);
      throw error;
    }
  }

  /**
   * Hide the main application window (minimize to tray)
   */
  static async hideWindow(): Promise<void> {
    try {
      await invoke('hide_window');
    } catch (error) {
      console.error('Failed to hide window:', error);
      throw error;
    }
  }

  /**
   * Toggle window visibility (show if hidden, hide if shown)
   */
  static async toggleWindow(): Promise<void> {
    try {
      await invoke('toggle_window');
    } catch (error) {
      console.error('Failed to toggle window:', error);
      throw error;
    }
  }

  /**
   * Check if the main window is currently focused
   */
  static async isWindowFocused(): Promise<boolean> {
    try {
      return await invoke('is_window_focused');
    } catch (error) {
      console.error('Failed to check window focus:', error);
      return false;
    }
  }

  /**
   * Quit the application completely
   */
  static async quitApp(): Promise<void> {
    try {
      await invoke('quit_app');
    } catch (error) {
      console.error('Failed to quit app:', error);
      throw error;
    }
  }

  /**
   * Handle clean application shutdown
   */
  static async handleShutdown(): Promise<void> {
    try {
      await invoke('handle_shutdown');
    } catch (error) {
      console.error('Failed to shutdown app:', error);
      throw error;
    }
  }
}

/**
 * Hook for React components to manage window state
 */
export function useWindowManager() {
  return {
    showWindow: WindowManager.showWindow,
    hideWindow: WindowManager.hideWindow,
    toggleWindow: WindowManager.toggleWindow,
    isWindowFocused: WindowManager.isWindowFocused,
    quitApp: WindowManager.quitApp,
    handleShutdown: WindowManager.handleShutdown,
  };
}