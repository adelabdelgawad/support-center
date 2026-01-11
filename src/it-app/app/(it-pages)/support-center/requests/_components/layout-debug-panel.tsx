'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Maximize2, AlertCircle, X, Eye, EyeOff } from 'lucide-react';

interface DebugMeasurements {
  leftNavWidth: number;
  viewsSidebarWidth: number;
  mainContentWidth: number;
  contentBodyWidth: number;
  tableWrapperWidth: number;
  tableContainerWidth: number;
  tableActualWidth: number;
  paginationWidth: number;
  viewportWidth: number;
  hasHorizontalOverflow: boolean;
  hasHorizontalScrollbar: boolean;
}

interface LayoutDebugPanelProps {
  viewsSidebarVisible: boolean;
}

/**
 * Layout Debug Panel for Real Requests Page
 *
 * Provides real-time measurements and layout issue detection
 * Can be toggled on/off with a floating button
 */
export function LayoutDebugPanel({ viewsSidebarVisible }: LayoutDebugPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [measurements, setMeasurements] = useState<DebugMeasurements | null>(null);
  const [layoutIssues, setLayoutIssues] = useState<string[]>([]);
  const [leftNavState, setLeftNavState] = useState<'expanded' | 'collapsed'>('expanded');

  // Measure layout
  const measureLayout = () => {
    // Find the REAL left navigation sidebar
    const leftNavSidebar = document.querySelector('[data-sidebar="sidebar"]')?.parentElement?.parentElement;
    const leftNavWidth = leftNavSidebar?.getBoundingClientRect().width || 0;

    // Find components by data attributes
    const viewsSidebar = document.querySelector('[data-debug="views-sidebar"]');
    const mainContent = document.querySelector('[data-debug="main-content"]');
    const contentBody = document.querySelector('[data-debug="content-body"]');
    const tableWrapper = document.querySelector('[data-debug="table-wrapper"]');
    const tableContainer = document.querySelector('.scrollbar-fluent-always');
    const table = tableContainer?.querySelector('table');
    const pagination = document.querySelector('[data-debug="pagination"]');

    const m: DebugMeasurements = {
      leftNavWidth: leftNavWidth,
      viewsSidebarWidth: viewsSidebar?.getBoundingClientRect().width || 0,
      mainContentWidth: mainContent?.getBoundingClientRect().width || 0,
      contentBodyWidth: contentBody?.getBoundingClientRect().width || 0,
      tableWrapperWidth: tableWrapper?.getBoundingClientRect().width || 0,
      tableContainerWidth: tableContainer?.getBoundingClientRect().width || 0,
      tableActualWidth: table?.getBoundingClientRect().width || 0,
      paginationWidth: pagination?.getBoundingClientRect().width || 0,
      viewportWidth: window.innerWidth,
      hasHorizontalOverflow: false,
      hasHorizontalScrollbar: false,
    };

    // Detect horizontal overflow
    if (tableContainer) {
      m.hasHorizontalScrollbar = tableContainer.scrollWidth > tableContainer.clientWidth;
      m.hasHorizontalOverflow = tableContainer.scrollWidth > (tableContainer as HTMLElement).offsetWidth;
    }

    setMeasurements(m);

    // Detect layout issues
    const issues: string[] = [];

    // Issue 1: Table wider than container but no scrollbar
    if (m.tableActualWidth > m.tableContainerWidth && !m.hasHorizontalScrollbar) {
      issues.push('⚠️ Table wider than container but no scrollbar!');
    }

    // Issue 2: Main content overflow
    const totalSidebarWidth = m.leftNavWidth + m.viewsSidebarWidth;
    const availableWidth = m.viewportWidth - totalSidebarWidth;
    if (m.mainContentWidth > availableWidth + 5) {
      issues.push(`⚠️ Main content overflow: ${m.mainContentWidth}px > ${availableWidth}px available`);
    }

    // Issue 3: Content body wider than main
    if (m.contentBodyWidth > m.mainContentWidth + 5) {
      issues.push(`⚠️ Content body overflow: ${m.contentBodyWidth}px > ${m.mainContentWidth}px main`);
    }

    // Issue 4: Pagination wider than content body
    if (m.paginationWidth > m.contentBodyWidth + 5) {
      issues.push(`⚠️ Pagination overflow: ${m.paginationWidth}px > ${m.contentBodyWidth}px body`);
    }

    // Issue 5: Check if overflow-x-hidden is blocking scroll on table container
    if (tableContainer) {
      const computed = window.getComputedStyle(tableContainer);
      if (computed.overflowX === 'hidden') {
        issues.push('❌ Table container has overflow-x: hidden!');
      }
    }

    // Issue 6: Check table wrapper for overflow-x-hidden (SHOULD have it)
    if (tableWrapper) {
      const computed = window.getComputedStyle(tableWrapper);
      if (computed.overflowX !== 'hidden') {
        issues.push('⚠️ Table wrapper missing overflow-x: hidden!');
      }
    }

    setLayoutIssues(issues);

    // Console log
    if (isVisible) {
      console.group('🔍 Production Layout Measurements');
      console.log('Left Nav (REAL):', m.leftNavWidth, 'px');
      console.log('Views Sidebar:', m.viewsSidebarWidth, 'px');
      console.log('Main Content:', m.mainContentWidth, 'px');
      console.log('Content Body:', m.contentBodyWidth, 'px');
      console.log('Table Wrapper:', m.tableWrapperWidth, 'px');
      console.log('Table Container:', m.tableContainerWidth, 'px');
      console.log('Table Actual:', m.tableActualWidth, 'px');
      console.log('Pagination:', m.paginationWidth, 'px');
      console.log('Viewport:', m.viewportWidth, 'px');
      console.log('Has Horizontal Scrollbar:', m.hasHorizontalScrollbar);
      if (issues.length > 0) {
        console.warn('Issues detected:', issues);
      }
      console.groupEnd();
    }
  };

  // Measure on mount and when sidebar toggles
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(measureLayout, 250);
      return () => clearTimeout(timer);
    }
  }, [viewsSidebarVisible, isVisible]);

  // Re-measure when REAL left nav toggles
  useEffect(() => {
    if (!isVisible) return;

    const observer = new MutationObserver(() => {
      setTimeout(measureLayout, 250);
    });

    const leftNavSidebar = document.querySelector('[data-sidebar="sidebar"]');
    if (leftNavSidebar) {
      observer.observe(leftNavSidebar.parentElement?.parentElement || document.body, {
        attributes: true,
        attributeFilter: ['data-state'],
      });
    }

    return () => observer.disconnect();
  }, [isVisible]);

  // Track left nav state
  useEffect(() => {
    const checkSidebarState = () => {
      const sidebarElement = document.querySelector('[data-sidebar="sidebar"]')?.parentElement?.parentElement;
      const state = sidebarElement?.getAttribute('data-state');
      if (state === 'expanded' || state === 'collapsed') {
        setLeftNavState(state);
      }
    };

    const interval = setInterval(checkSidebarState, 100);
    checkSidebarState();

    return () => clearInterval(interval);
  }, []);

  // Measure on window resize
  useEffect(() => {
    if (!isVisible) return;
    window.addEventListener('resize', measureLayout);
    return () => window.removeEventListener('resize', measureLayout);
  }, [isVisible]);

  return (
    <>
      {/* Toggle Button */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
        <Button
          onClick={() => setIsVisible(!isVisible)}
          variant={isVisible ? 'default' : 'outline'}
          size="sm"
          className="shadow-lg"
        >
          {isVisible ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
          {isVisible ? 'Hide' : 'Show'} Debug
        </Button>
      </div>

      {/* Debug Panel */}
      {isVisible && measurements && (
        <div className="fixed bottom-20 right-4 bg-card border-2 border-primary rounded-lg shadow-2xl max-w-2xl z-50 max-h-[70vh] overflow-auto">
          <div className="p-4 border-b border-border bg-primary text-primary-foreground flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">🔬 Production Layout Debug</h3>
              {layoutIssues.length > 0 && (
                <span className="bg-destructive text-destructive-foreground px-2 py-0.5 rounded text-xs">
                  {layoutIssues.length} Issues
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={measureLayout}
                className="text-primary-foreground hover:bg-primary-foreground/10 h-8"
              >
                <Maximize2 className="h-4 w-4 mr-1" />
                Measure
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsVisible(false)}
                className="text-primary-foreground hover:bg-primary-foreground/10 h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Sidebar States */}
            <div className="grid grid-cols-2 gap-3">
              <div className={cn('p-3 rounded border', leftNavState === 'expanded' ? 'bg-green-50 dark:bg-green-950/20 border-green-500' : 'bg-orange-50 dark:bg-orange-950/20 border-orange-500')}>
                <p className="text-xs font-semibold mb-1">Left Nav (REAL)</p>
                <p className="text-2xl font-bold">{measurements.leftNavWidth}px</p>
                <p className="text-xs text-muted-foreground capitalize">{leftNavState}</p>
              </div>
              <div className={cn('p-3 rounded border', viewsSidebarVisible ? 'bg-green-50 dark:bg-green-950/20 border-green-500' : 'bg-orange-50 dark:bg-orange-950/20 border-orange-500')}>
                <p className="text-xs font-semibold mb-1">Views Sidebar</p>
                <p className="text-2xl font-bold">{measurements.viewsSidebarWidth}px</p>
                <p className="text-xs text-muted-foreground">{viewsSidebarVisible ? 'Visible' : 'Hidden'}</p>
              </div>
            </div>

            {/* Width Measurements */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Container Widths:</h4>
              <div className="space-y-1 text-xs font-mono">
                <div className="flex justify-between p-2 bg-muted rounded">
                  <span>Viewport:</span>
                  <span className="font-bold">{measurements.viewportWidth}px</span>
                </div>
                <div className="flex justify-between p-2 bg-muted rounded">
                  <span>Main Content:</span>
                  <span className="font-bold">{measurements.mainContentWidth}px</span>
                </div>
                <div className="flex justify-between p-2 bg-muted rounded">
                  <span>Content Body:</span>
                  <span className="font-bold">{measurements.contentBodyWidth}px</span>
                </div>
                <div className="flex justify-between p-2 bg-muted rounded">
                  <span>Table Wrapper:</span>
                  <span className="font-bold">{measurements.tableWrapperWidth}px</span>
                </div>
                <div className="flex justify-between p-2 bg-muted rounded">
                  <span>Table Container:</span>
                  <span className="font-bold">{measurements.tableContainerWidth}px</span>
                </div>
                <div className="flex justify-between p-2 bg-blue-100 dark:bg-blue-950/50 rounded border border-blue-500">
                  <span>Table Actual:</span>
                  <span className="font-bold text-blue-700 dark:text-blue-300">{measurements.tableActualWidth}px</span>
                </div>
                <div className="flex justify-between p-2 bg-muted rounded">
                  <span>Pagination:</span>
                  <span className="font-bold">{measurements.paginationWidth}px</span>
                </div>
              </div>
            </div>

            {/* Scrollbar Status */}
            <div className="p-3 bg-muted rounded">
              <h4 className="text-sm font-semibold mb-2">Scrollbar Status:</h4>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <div className={cn('w-3 h-3 rounded-full', measurements.hasHorizontalScrollbar ? 'bg-green-500' : 'bg-red-500')}></div>
                  <span>Has Horizontal Scrollbar: <strong>{measurements.hasHorizontalScrollbar ? 'YES ✓' : 'NO ✗'}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn('w-3 h-3 rounded-full', measurements.hasHorizontalOverflow ? 'bg-green-500' : 'bg-gray-400')}></div>
                  <span>Has Overflow: <strong>{measurements.hasHorizontalOverflow ? 'YES' : 'NO'}</strong></span>
                </div>
              </div>
            </div>

            {/* Layout Issues */}
            {layoutIssues.length > 0 ? (
              <div className="p-3 bg-destructive/10 border border-destructive rounded">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Layout Issues Detected:
                </h4>
                <ul className="space-y-1 text-xs">
                  {layoutIssues.map((issue, idx) => (
                    <li key={idx} className="text-destructive">{issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-500 rounded">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-green-700 dark:text-green-300">
                  ✅ No Layout Issues Detected!
                </h4>
                <p className="text-xs text-green-600 dark:text-green-400">
                  All measurements look good. Layout is working correctly.
                </p>
              </div>
            )}

            {/* Available Space Calculation */}
            <div className="p-3 bg-muted rounded text-xs">
              <h4 className="text-sm font-semibold mb-2">Space Calculation:</h4>
              <p>Viewport: {measurements.viewportWidth}px</p>
              <p>- Left Nav: -{measurements.leftNavWidth}px</p>
              <p>- Views Sidebar: -{measurements.viewsSidebarWidth}px</p>
              <p className="pt-1 border-t mt-1 font-bold">
                = Available: {measurements.viewportWidth - measurements.leftNavWidth - measurements.viewsSidebarWidth}px
              </p>
              <p className="mt-2">
                Main Content Width: <strong>{measurements.mainContentWidth}px</strong>
              </p>
              {measurements.mainContentWidth > (measurements.viewportWidth - measurements.leftNavWidth - measurements.viewsSidebarWidth) && (
                <p className="text-destructive mt-1 font-semibold">⚠️ OVERFLOW DETECTED!</p>
              )}
            </div>

            {/* Instructions */}
            <div className="text-xs bg-blue-50 dark:bg-blue-950/20 border border-blue-500 rounded p-3">
              <p className="font-semibold mb-1">How to use:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>Toggle left nav to see width changes (256px ↔ 48px)</li>
                <li>Toggle views sidebar if available</li>
                <li>Click "Measure" button to force remeasure</li>
                <li>Check console for detailed logs</li>
                <li>Look for red warnings if issues detected</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
