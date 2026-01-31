/**
 * Organizational Unit Tree Types
 *
 * Types for displaying AD OU hierarchy as an expandable tree
 * with cascading checkbox selection.
 */

export interface OUTreeNode {
  ouName: string;
  ouDn: string;
  children: OUTreeNode[];
  alreadyExists: boolean;
  userCount: number;
}

export interface OUTreeState {
  /** DNs of expanded nodes */
  expanded: Set<string>;
  /** DNs of selected nodes */
  selected: Set<string>;
  /** DNs with partial child selection (indeterminate state) */
  indeterminate: Set<string>;
}

export interface OUSelectionState {
  /** Current selection state */
  selected: Set<string>;
  /** Nodes in indeterminate state */
  indeterminate: Set<string>;
}
