"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { OUTreeNodeComponent } from "./ou-tree-node";
import { useOUTreeSelection } from "./use-ou-tree-selection";
import { getOUTree } from "@/lib/api/active-directory-config";
import type { OUTreeNode } from "@/types/ou-tree";

interface OUTreeViewProps {
  configId: string;
  initialSelected?: string[];
  onSelectionChange?: (selectedOUs: { ouName: string; ouDn: string; alreadyExists: boolean }[]) => void;
  onInitialLoad?: (initialOUs: Map<string, string>) => void; // dn -> ouName
}

export function OUTreeView({
  configId,
  initialSelected = [],
  onSelectionChange,
  onInitialLoad,
}: OUTreeViewProps) {
  const [tree, setTree] = useState<OUTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection management with cascading logic
  const {
    toggleNode,
    isNodeSelected,
    isNodeIndeterminate,
    getSelectedOUs,
  } = useOUTreeSelection(tree, initialSelected);

  // Fetch OU tree from API
  useEffect(() => {
    async function fetchTree() {
      try {
        setLoading(true);
        setError(null);
        const data = await getOUTree(configId);
        setTree(data);

        // Start with all nodes collapsed
        setExpanded(new Set());
      } catch (err: any) {
        console.error("Failed to fetch OU tree:", err);
        setError(err.message || "Failed to load OU tree");
      } finally {
        setLoading(false);
      }
    }

    if (configId) {
      fetchTree();
    }
  }, [configId]);

  // Notify parent of initial alreadyExists OUs once tree loads
  const onInitialLoadRef = useRef(onInitialLoad);
  onInitialLoadRef.current = onInitialLoad;
  const initialLoadFired = useRef(false);

  useEffect(() => {
    if (tree.length === 0 || initialLoadFired.current) return;
    initialLoadFired.current = true;

    const existingMap = new Map<string, string>();
    const collect = (nodes: OUTreeNode[]) => {
      for (const node of nodes) {
        if (node.alreadyExists) existingMap.set(node.ouDn, node.ouName);
        if (node.children.length > 0) collect(node.children);
      }
    };
    collect(tree);

    if (onInitialLoadRef.current) {
      onInitialLoadRef.current(existingMap);
    }
  }, [tree]);

  // Keep a stable ref to avoid re-render loops
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChangeRef.current) {
      const selected = getSelectedOUs();
      onSelectionChangeRef.current(selected);
    }
  }, [getSelectedOUs]);

  // Toggle expansion of a node
  const handleToggleExpand = (dn: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dn)) {
        next.delete(dn);
      } else {
        next.add(dn);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading OU tree...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm font-medium text-destructive">
          Failed to load OU tree
        </p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No organizational units found in Active Directory.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-[500px] overflow-y-auto border rounded-lg p-2">
      {tree.map((node) => (
        <OUTreeNodeComponent
          key={node.ouDn}
          node={node}
          level={0}
          expanded={expanded}
          isSelected={isNodeSelected}
          isIndeterminate={isNodeIndeterminate}
          onToggleExpand={handleToggleExpand}
          onToggleSelect={toggleNode}
          isParentSelected={false}
        />
      ))}
    </div>
  );
}
