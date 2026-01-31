"use client";

import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { OUTreeNode } from "@/types/ou-tree";

interface OUTreeNodeProps {
  node: OUTreeNode;
  level: number;
  expanded: Set<string>;
  isSelected: (dn: string) => boolean;
  isIndeterminate: (dn: string) => boolean;
  onToggleExpand: (dn: string) => void;
  onToggleSelect: (node: OUTreeNode, checked: boolean) => void;
  isParentSelected?: boolean;
}

export function OUTreeNodeComponent({
  node,
  level,
  expanded,
  isSelected,
  isIndeterminate,
  onToggleExpand,
  onToggleSelect,
  isParentSelected = false,
}: OUTreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.ouDn);
  const selected = isSelected(node.ouDn);
  const indeterminate = isIndeterminate(node.ouDn);

  return (
    <div>
      {/* Node Row */}
      <div
        className="flex items-center gap-2 py-1.5 px-2 hover:bg-accent rounded-md group"
        style={{ paddingLeft: `${level * 24 + 8}px` }}
      >
        {/* Expand/Collapse Button */}
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0"
            onClick={() => onToggleExpand(node.ouDn)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <div className="w-5" /> // Spacer for alignment
        )}

        {/* Checkbox */}
        <Checkbox
          checked={indeterminate ? "indeterminate" : selected}
          onCheckedChange={(checked) =>
            onToggleSelect(node, checked === true)
          }
          disabled={isParentSelected}
          className="data-[state=indeterminate]:bg-primary"
        />

        {/* Folder Icon */}
        <Folder className="h-4 w-4 text-muted-foreground" />

        {/* OU Name */}
        <span className="flex-1 text-sm font-medium">{node.ouName}</span>

        {/* Badges */}
        <div className="flex items-center gap-2">
{node.userCount > 0 && (
            <Badge variant="outline" className="text-xs">
              {node.userCount} users
            </Badge>
          )}
        </div>
      </div>

      {/* Children (Recursive) */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <OUTreeNodeComponent
              key={child.ouDn}
              node={child}
              level={level + 1}
              expanded={expanded}
              isSelected={isSelected}
              isIndeterminate={isIndeterminate}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
              isParentSelected={isParentSelected || selected || node.alreadyExists}
            />
          ))}
        </div>
      )}
    </div>
  );
}
