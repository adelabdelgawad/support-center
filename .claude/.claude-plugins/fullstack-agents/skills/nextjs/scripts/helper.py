#!/usr/bin/env python3
"""
Next.js Template Helper Script

Utilities for generating Next.js components.

Usage:
    python helper.py validate          # Validate project structure
    python helper.py generate NAME     # Generate full page with components
    python helper.py page NAME         # Generate page only
    python helper.py context NAME      # Generate context only
    python helper.py table NAME        # Generate table components only
    python helper.py actions NAME      # Generate server actions only
"""

import sys
import os
import re

def to_pascal(name: str) -> str:
    """Convert to PascalCase."""
    return ''.join(word.capitalize() for word in name.replace('-', '_').split('_'))

def to_kebab(name: str) -> str:
    """Convert to kebab-case."""
    s = re.sub(r'(?<!^)(?=[A-Z])', '-', name).lower()
    return s.replace('_', '-')

def validate_structure():
    """Validate Next.js project structure."""
    print("Validating Next.js project structure...")
    
    required_dirs = [
        'app',
        'components',
        'lib',
        'lib/fetch',
        'lib/actions',
    ]
    
    required_files = [
        'lib/fetch/client.ts',
        'lib/fetch/server.ts',
    ]
    
    issues = []
    
    for dir_path in required_dirs:
        if os.path.isdir(dir_path):
            print(f"✓ {dir_path}/")
        else:
            issues.append(f"✗ Missing directory: {dir_path}/")
    
    for file_path in required_files:
        if os.path.exists(file_path):
            print(f"✓ {file_path}")
        else:
            issues.append(f"⚠ Missing file: {file_path}")
    
    if issues:
        print("\nIssues found:")
        for issue in issues:
            print(f"  {issue}")
    else:
        print("\n✓ Project structure is valid!")

def generate_page(name: str, base_path: str = "setting"):
    """Generate page.tsx file."""
    pascal = to_pascal(name)
    kebab = to_kebab(name)
    
    dir_path = f"app/(pages)/{base_path}/{kebab}"
    os.makedirs(dir_path, exist_ok=True)
    
    template = f'''import {{ auth }} from "@/lib/auth/server-auth";
import {{ redirect }} from "next/navigation";
import {{ get{pascal}s }} from "@/lib/actions/{kebab}.actions";
import {pascal}sTable from "./_components/table/{kebab}s-table";
import {{ {pascal}sProvider }} from "./_components/context/{kebab}s-context";

interface PageProps {{
  searchParams: Promise<{{
    page?: string;
    limit?: string;
    search?: string;
  }}>;
}}

export default async function {pascal}sPage({{ searchParams }}: PageProps) {{
  const session = await auth();
  if (!session?.accessToken) redirect("/login");

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 10;
  const search = params.search || "";

  const initialData = await get{pascal}s(limit, (page - 1) * limit, {{ search }});

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{pascal}s</h1>
      </div>
      
      <{pascal}sProvider initialData={{initialData}}>
        <{pascal}sTable />
      </{pascal}sProvider>
    </div>
  );
}}
'''
    
    filepath = f"{dir_path}/page.tsx"
    with open(filepath, 'w') as f:
        f.write(template)
    print(f"✓ Created {filepath}")

def generate_context(name: str, base_path: str = "setting"):
    """Generate context provider file."""
    pascal = to_pascal(name)
    kebab = to_kebab(name)
    
    dir_path = f"app/(pages)/{base_path}/{kebab}/_components/context"
    os.makedirs(dir_path, exist_ok=True)
    
    template = f'''"use client";

import {{ createContext, useContext, useState, useCallback, ReactNode }} from "react";
import useSWR, {{ mutate }} from "swr";
import {{ fetchClient }} from "@/lib/fetch/client";
import type {{ {pascal}, {pascal}sResponse }} from "@/types/{kebab}";

interface {pascal}sContextType {{
  {kebab.replace('-', '')}s: {pascal}[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  refresh: () => void;
  page: number;
  setPage: (page: number) => void;
  limit: number;
  setLimit: (limit: number) => void;
  search: string;
  setSearch: (search: string) => void;
}}

const {pascal}sContext = createContext<{pascal}sContextType | null>(null);

const fetcher = (url: string) => fetchClient.get<{pascal}sResponse>(url).then(r => r.data);

interface {pascal}sProviderProps {{
  children: ReactNode;
  initialData: {pascal}sResponse;
}}

export function {pascal}sProvider({{ children, initialData }}: {pascal}sProviderProps) {{
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");

  const queryParams = new URLSearchParams({{
    limit: limit.toString(),
    skip: ((page - 1) * limit).toString(),
    ...(search && {{ search }}),
  }});

  const {{ data, error, isLoading }} = useSWR(
    `/api/{base_path}/{kebab}?${{queryParams.toString()}}`,
    fetcher,
    {{
      fallbackData: initialData,
      revalidateOnFocus: false,
    }}
  );

  const refresh = useCallback(() => {{
    mutate(`/api/{base_path}/{kebab}?${{queryParams.toString()}}`);
  }}, [queryParams]);

  return (
    <{pascal}sContext.Provider
      value={{{{
        {kebab.replace('-', '')}s: data?.items || [],
        total: data?.total || 0,
        isLoading,
        error,
        selectedIds,
        setSelectedIds,
        refresh,
        page,
        setPage,
        limit,
        setLimit,
        search,
        setSearch,
      }}}}
    >
      {{children}}
    </{pascal}sContext.Provider>
  );
}}

export function use{pascal}s() {{
  const context = useContext({pascal}sContext);
  if (!context) {{
    throw new Error("use{pascal}s must be used within {pascal}sProvider");
  }}
  return context;
}}
'''
    
    filepath = f"{dir_path}/{kebab}s-context.tsx"
    with open(filepath, 'w') as f:
        f.write(template)
    print(f"✓ Created {filepath}")

def generate_table(name: str, base_path: str = "setting"):
    """Generate table component files."""
    pascal = to_pascal(name)
    kebab = to_kebab(name)
    
    dir_path = f"app/(pages)/{base_path}/{kebab}/_components/table"
    os.makedirs(dir_path, exist_ok=True)
    
    # Main table component
    table_template = f'''"use client";

import {{ use{pascal}s }} from "../context/{kebab}s-context";
import {{ DataTable }} from "@/components/ui/data-table";
import {{ columns }} from "./columns";

export default function {pascal}sTable() {{
  const {{ {kebab.replace('-', '')}s, isLoading, selectedIds, setSelectedIds }} = use{pascal}s();

  return (
    <div className="space-y-4">
      <DataTable
        columns={{columns}}
        data={{{kebab.replace('-', '')}s}}
        isLoading={{isLoading}}
        selectedIds={{selectedIds}}
        onSelectionChange={{setSelectedIds}}
      />
    </div>
  );
}}
'''
    
    # Columns definition
    columns_template = f'''"use client";

import {{ ColumnDef }} from "@tanstack/react-table";
import {{ Checkbox }} from "@/components/ui/checkbox";
import type {{ {pascal} }} from "@/types/{kebab}";

export const columns: ColumnDef<{pascal}>[] = [
  {{
    id: "select",
    header: ({{ table }}) => (
      <Checkbox
        checked={{table.getIsAllPageRowsSelected()}}
        onCheckedChange={{(value) => table.toggleAllPageRowsSelected(!!value)}}
      />
    ),
    cell: ({{ row }}) => (
      <Checkbox
        checked={{row.getIsSelected()}}
        onCheckedChange={{(value) => row.toggleSelected(!!value)}}
      />
    ),
    enableSorting: false,
  }},
  {{
    accessorKey: "name",
    header: "Name",
  }},
  // Add more columns here
];
'''
    
    with open(f"{dir_path}/{kebab}s-table.tsx", 'w') as f:
        f.write(table_template)
    print(f"✓ Created {dir_path}/{kebab}s-table.tsx")
    
    with open(f"{dir_path}/columns.tsx", 'w') as f:
        f.write(columns_template)
    print(f"✓ Created {dir_path}/columns.tsx")

def generate_actions(name: str, base_path: str = "setting"):
    """Generate server actions file."""
    pascal = to_pascal(name)
    kebab = to_kebab(name)
    
    os.makedirs('lib/actions', exist_ok=True)
    
    template = f'''"use server";

import {{ serverGet, serverPost, serverPut, serverDelete }} from "@/lib/fetch/server";
import {{ revalidatePath }} from "next/cache";
import type {{ {pascal}, {pascal}Create, {pascal}sResponse }} from "@/types/{kebab}";

export async function get{pascal}s(
  limit: number = 10,
  skip: number = 0,
  filters?: Record<string, string | undefined>
): Promise<{pascal}sResponse> {{
  const params = new URLSearchParams();
  params.append('limit', limit.toString());
  params.append('skip', skip.toString());
  
  if (filters) {{
    Object.entries(filters).forEach(([key, value]) => {{
      if (value) params.append(key, value);
    }});
  }}
  
  return serverGet<{pascal}sResponse>(`/api/{base_path}/{kebab}?${{params.toString()}}`);
}}

export async function get{pascal}(id: string): Promise<{pascal}> {{
  return serverGet<{pascal}>(`/api/{base_path}/{kebab}/${{id}}`);
}}

export async function create{pascal}(
  data: {pascal}Create
): Promise<{{ success: boolean; data?: {pascal}; error?: string }}> {{
  try {{
    const result = await serverPost<{pascal}>("/api/{base_path}/{kebab}", data);
    revalidatePath("/{base_path}/{kebab}");
    return {{ success: true, data: result }};
  }} catch (error) {{
    return {{ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to create" 
    }};
  }}
}}

export async function update{pascal}(
  id: string,
  data: Partial<{pascal}>
): Promise<{{ success: boolean; error?: string }}> {{
  try {{
    await serverPut(`/api/{base_path}/{kebab}/${{id}}`, data);
    revalidatePath("/{base_path}/{kebab}");
    return {{ success: true }};
  }} catch (error) {{
    return {{ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to update" 
    }};
  }}
}}

export async function delete{pascal}(
  id: string
): Promise<{{ success: boolean; error?: string }}> {{
  try {{
    await serverDelete(`/api/{base_path}/{kebab}/${{id}}`);
    revalidatePath("/{base_path}/{kebab}");
    return {{ success: true }};
  }} catch (error) {{
    return {{ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to delete" 
    }};
  }}
}}
'''
    
    filepath = f"lib/actions/{kebab}.actions.ts"
    with open(filepath, 'w') as f:
        f.write(template)
    print(f"✓ Created {filepath}")

def generate_all(name: str, base_path: str = "setting"):
    """Generate all components for an entity."""
    print(f"Generating Next.js page components for: {name}")
    generate_page(name, base_path)
    generate_context(name, base_path)
    generate_table(name, base_path)
    generate_actions(name, base_path)
    
    kebab = to_kebab(name)
    print(f"\n✓ All components generated for {name}")
    print(f"\nDon't forget to:")
    print(f"  1. Create types in types/{kebab}.ts")
    print(f"  2. Create API routes in app/api/{base_path}/{kebab}/")

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    command = sys.argv[1]
    base_path = "setting"  # Default base path
    
    if command == 'validate':
        validate_structure()
    elif command in ['generate', 'page', 'context', 'table', 'actions']:
        if len(sys.argv) < 3:
            print(f"Usage: python helper.py {command} NAME [BASE_PATH]")
            sys.exit(1)
        
        name = sys.argv[2]
        if len(sys.argv) > 3:
            base_path = sys.argv[3]
        
        if command == 'generate':
            generate_all(name, base_path)
        elif command == 'page':
            generate_page(name, base_path)
        elif command == 'context':
            generate_context(name, base_path)
        elif command == 'table':
            generate_table(name, base_path)
        elif command == 'actions':
            generate_actions(name, base_path)
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)

if __name__ == '__main__':
    main()
