import { useState, useCallback, useMemo, useEffect } from "react";
import type { OUTreeNode, OUSelectionState } from "@/types/ou-tree";

/**
 * Hook for managing OU tree selection with cascading behavior
 *
 * Features:
 * - Checking a parent auto-checks all children
 * - Unchecking a parent auto-unchecks all children
 * - Indeterminate state when some (but not all) children are selected
 * - User can manually uncheck individual children
 */

// Helper functions defined outside component to avoid dependency issues
function addNodeAndDescendants(node: OUTreeNode, set: Set<string>) {
  set.add(node.ouDn);
  node.children.forEach((child) => addNodeAndDescendants(child, set));
}

function removeNodeAndDescendants(node: OUTreeNode, set: Set<string>) {
  set.delete(node.ouDn);
  node.children.forEach((child) => removeNodeAndDescendants(child, set));
}

// Helper function to check node selection state (outside hook to avoid immutability issue)
function checkNodeSelectionState(
  node: OUTreeNode,
  selected: Set<string>
): "all" | "some" | "none" {
  if (node.children.length === 0) {
    // Leaf node
    return selected.has(node.ouDn) ? "all" : "none";
  }

  // Check children states
  const allChildrenSelected = node.children.every((child) =>
    checkNodeSelectionState(child, selected) === "all"
  ) && selected.has(node.ouDn);

  const noChildrenSelected = node.children.every((child) =>
    checkNodeSelectionState(child, selected) === "none"
  ) && !selected.has(node.ouDn);

  if (allChildrenSelected) return "all";
  if (noChildrenSelected) return "none";
  return "some"; // Partial selection
}

export function useOUTreeSelection(
  tree: OUTreeNode[],
  initialSelected: string[] = []
) {
  // Auto-select alreadyExists nodes when tree loads
  // Compute the initial selected set directly from tree and initialSelected
  const selected = useMemo(() => {
    const result = new Set(initialSelected);

    const collectExisting = (nodes: OUTreeNode[]) => {
      for (const node of nodes) {
        if (node.alreadyExists) {
          addNodeAndDescendants(node, result);
        } else if (node.children.length > 0) {
          collectExisting(node.children);
        }
      }
    };

    if (tree.length > 0) {
      collectExisting(tree);
    }

    return result;
  }, [tree, initialSelected]);

  // Calculate indeterminate states
  const indeterminate = useMemo(() => {
    const indeterminateSet = new Set<string>();

    const traverse = (nodes: OUTreeNode[]) => {
      for (const node of nodes) {
        const state = checkNodeSelectionState(node, selected);
        if (state === "some") {
          indeterminateSet.add(node.ouDn);
        }
        if (node.children.length > 0) {
          traverse(node.children);
        }
      }
    };

    traverse(tree);
    return indeterminateSet;
  }, [tree, selected]);

  // Toggle node selection
  const toggleNode = useCallback(
    (node: OUTreeNode, checked: boolean) => {
      const newSelected = new Set(selected);

      if (checked) {
        // Add node and all descendants
        addNodeAndDescendants(node, newSelected);
      } else {
        // Remove node and all descendants
        removeNodeAndDescendants(node, newSelected);
      }

      setSelected(newSelected);
    },
    [selected]
  );

  // Check if node is selected
  const isNodeSelected = useCallback(
    (nodeDn: string) => selected.has(nodeDn),
    [selected]
  );

  // Check if node is indeterminate
  const isNodeIndeterminate = useCallback(
    (nodeDn: string) => indeterminate.has(nodeDn),
    [indeterminate]
  );

  // Get top-level selected OUs with both name and DN.
  // If a parent is selected, skip its children (SUBTREE search covers them).
  const getSelectedOUs = useCallback(() => {
    const result: { ouName: string; ouDn: string; alreadyExists: boolean }[] = [];

    const extract = (nodes: OUTreeNode[]) => {
      for (const node of nodes) {
        if (selected.has(node.ouDn)) {
          result.push({ ouName: node.ouName, ouDn: node.ouDn, alreadyExists: node.alreadyExists });
          // Skip children — parent SUBTREE search covers them
        } else if (node.children.length > 0) {
          extract(node.children);
        }
      }
    };

    extract(tree);
    return result;
  }, [tree, selected]);

  return {
    selected,
    indeterminate,
    toggleNode,
    isNodeSelected,
    isNodeIndeterminate,
    getSelectedOUs,
  };
}
