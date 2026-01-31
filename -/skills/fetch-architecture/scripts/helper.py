#!/usr/bin/env python3
"""
Fetch Architecture Helper Script

Utilities for managing Next.js fetch utilities.

Usage:
    python helper.py validate        # Validate fetch configuration
    python helper.py routes          # List API routes
    python helper.py generate NAME   # Generate API route for entity
    python helper.py actions NAME    # Generate server actions for entity
"""

import sys
import os
import re

def validate_fetch_config():
    """Validate fetch architecture configuration."""
    print("Validating fetch architecture...")
    
    issues = []
    
    # Check directory structure
    required_files = [
        'lib/fetch/client.ts',
        'lib/fetch/server.ts',
        'lib/fetch/api-route-helper.ts',
        'lib/fetch/errors.ts',
        'lib/fetch/types.ts',
    ]
    
    for file in required_files:
        if os.path.exists(file):
            print(f"✓ {file}")
            
            # Check file content
            with open(file, 'r') as f:
                content = f.read()
                
                if file.endswith('client.ts'):
                    if '"use client"' not in content:
                        issues.append(f"⚠ {file}: Missing 'use client' directive")
                    if 'AbortController' not in content:
                        issues.append(f"ℹ {file}: No timeout handling")
                
                if file.endswith('server.ts'):
                    if '"use server"' not in content:
                        issues.append(f"⚠ {file}: Missing 'use server' directive")
                    if 'cookies()' not in content:
                        issues.append(f"ℹ {file}: No cookie forwarding")
                
                if file.endswith('api-route-helper.ts'):
                    if 'withAuth' not in content:
                        issues.append(f"⚠ {file}: Missing withAuth wrapper")
        else:
            issues.append(f"✗ {file}: Not found")
    
    # Check for auth
    auth_files = ['lib/auth/server-auth.ts', 'lib/auth.ts', 'auth.ts']
    auth_found = any(os.path.exists(f) for f in auth_files)
    if auth_found:
        print("✓ Auth module found")
    else:
        issues.append("ℹ No auth module found (lib/auth/server-auth.ts)")
    
    if issues:
        print("\nIssues found:")
        for issue in issues:
            print(f"  {issue}")
    else:
        print("\n✓ Fetch architecture validation passed!")

def list_api_routes():
    """List all API routes in the application."""
    print("Scanning API routes...")
    
    api_dir = 'app/api'
    if not os.path.isdir(api_dir):
        print(f"✗ {api_dir} directory not found")
        return
    
    routes = []
    
    for root, dirs, files in os.walk(api_dir):
        if 'route.ts' in files or 'route.tsx' in files:
            # Convert path to route
            route_path = root.replace(api_dir, '/api')
            route_path = re.sub(r'\[(\w+)\]', r':\1', route_path)
            
            route_file = os.path.join(root, 'route.ts')
            if not os.path.exists(route_file):
                route_file = os.path.join(root, 'route.tsx')
            
            # Check methods
            with open(route_file, 'r') as f:
                content = f.read()
                methods = []
                for method in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']:
                    if f'export async function {method}' in content or f'export function {method}' in content:
                        methods.append(method)
            
            routes.append({
                'path': route_path,
                'methods': methods,
                'file': route_file
            })
    
    if not routes:
        print("No API routes found")
        return
    
    print(f"\nFound {len(routes)} routes:\n")
    print(f"{'Path':<50} {'Methods':<30}")
    print("-" * 80)
    
    for route in sorted(routes, key=lambda r: r['path']):
        methods_str = ', '.join(route['methods'])
        print(f"{route['path']:<50} {methods_str:<30}")

def generate_api_route(entity_name: str):
    """Generate API route files for an entity."""
    print(f"Generating API route for: {entity_name}")
    
    # Convert to path format
    path_name = entity_name.lower().replace('_', '-')
    entity_id = f"{entity_name.lower()}Id"
    
    # Create directories
    base_dir = f"app/api/setting/{path_name}"
    dynamic_dir = f"{base_dir}/[{entity_id}]"
    status_dir = f"{dynamic_dir}/status"
    bulk_status_dir = f"{base_dir}/status"
    
    os.makedirs(base_dir, exist_ok=True)
    os.makedirs(dynamic_dir, exist_ok=True)
    os.makedirs(status_dir, exist_ok=True)
    os.makedirs(bulk_status_dir, exist_ok=True)
    
    # Base route template
    base_route = f'''import {{ NextRequest }} from "next/server";
import {{ withAuth, backendGet, backendPost }} from "@/lib/fetch/api-route-helper";

export async function GET(request: NextRequest) {{
  const params = request.nextUrl.searchParams.toString();
  return withAuth(token => 
    backendGet(`/setting/{path_name}/${{params ? "?" + params : ""}}`, token)
  );
}}

export async function POST(request: NextRequest) {{
  const body = await request.json();
  return withAuth(token => 
    backendPost('/setting/{path_name}/', token, body)
  );
}}
'''
    
    # Dynamic route template
    dynamic_route = f'''import {{ NextRequest }} from "next/server";
import {{ withAuth, backendGet, backendPut, backendDelete }} from "@/lib/fetch/api-route-helper";

interface RouteParams {{
  params: Promise<{{ {entity_id}: string }}>;
}}

export async function GET(request: NextRequest, {{ params }}: RouteParams) {{
  const {{ {entity_id} }} = await params;
  return withAuth(token => 
    backendGet(`/setting/{path_name}/${{{entity_id}}}`, token)
  );
}}

export async function PUT(request: NextRequest, {{ params }}: RouteParams) {{
  const {{ {entity_id} }} = await params;
  const body = await request.json();
  return withAuth(token => 
    backendPut(`/setting/{path_name}/${{{entity_id}}}`, token, body)
  );
}}

export async function DELETE(request: NextRequest, {{ params }}: RouteParams) {{
  const {{ {entity_id} }} = await params;
  return withAuth(token => 
    backendDelete(`/setting/{path_name}/${{{entity_id}}}`, token)
  );
}}
'''
    
    # Status route template
    status_route = f'''import {{ NextRequest }} from "next/server";
import {{ withAuth, backendPut }} from "@/lib/fetch/api-route-helper";

interface RouteParams {{
  params: Promise<{{ {entity_id}: string }}>;
}}

export async function PUT(request: NextRequest, {{ params }}: RouteParams) {{
  const {{ {entity_id} }} = await params;
  const body = await request.json();
  return withAuth(token => 
    backendPut(`/setting/{path_name}/${{{entity_id}}}/status`, token, body)
  );
}}
'''
    
    # Bulk status route template
    bulk_status_route = f'''import {{ NextRequest }} from "next/server";
import {{ withAuth, backendPut }} from "@/lib/fetch/api-route-helper";

export async function PUT(request: NextRequest) {{
  const body = await request.json();
  return withAuth(token => 
    backendPut('/setting/{path_name}/status', token, body)
  );
}}
'''
    
    # Write files
    files = [
        (f"{base_dir}/route.ts", base_route),
        (f"{dynamic_dir}/route.ts", dynamic_route),
        (f"{status_dir}/route.ts", status_route),
        (f"{bulk_status_dir}/route.ts", bulk_status_route),
    ]
    
    for filepath, content in files:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"✓ Created {filepath}")

def generate_server_actions(entity_name: str):
    """Generate server actions for an entity."""
    print(f"Generating server actions for: {entity_name}")
    
    os.makedirs('lib/actions', exist_ok=True)
    
    # Convert to path format
    path_name = entity_name.lower().replace('_', '-')
    entity_pascal = ''.join(word.capitalize() for word in entity_name.split('_'))
    
    template = f'''"use server";

import {{ serverGet, serverPost, serverPut, serverDelete }} from "@/lib/fetch/server";
import {{ revalidatePath }} from "next/cache";
import type {{ {entity_pascal}, {entity_pascal}Create, {entity_pascal}Response }} from "@/types/{path_name}";

export async function get{entity_pascal}s(
  limit: number = 10,
  skip: number = 0,
  filters?: Record<string, string | undefined>
): Promise<{entity_pascal}Response> {{
  const params = new URLSearchParams();
  params.append('limit', limit.toString());
  params.append('skip', skip.toString());
  
  if (filters) {{
    Object.entries(filters).forEach(([key, value]) => {{
      if (value) params.append(key, value);
    }});
  }}
  
  return serverGet<{entity_pascal}Response>(`/api/setting/{path_name}?${{params.toString()}}`);
}}

export async function get{entity_pascal}(id: string): Promise<{entity_pascal}> {{
  return serverGet<{entity_pascal}>(`/api/setting/{path_name}/${{id}}`);
}}

export async function create{entity_pascal}(
  data: {entity_pascal}Create
): Promise<{{ success: boolean; data?: {entity_pascal}; error?: string }}> {{
  try {{
    const result = await serverPost<{entity_pascal}>("/api/setting/{path_name}", data);
    revalidatePath("/setting/{path_name}");
    return {{ success: true, data: result }};
  }} catch (error) {{
    return {{ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to create {entity_name}" 
    }};
  }}
}}

export async function update{entity_pascal}(
  id: string,
  data: Partial<{entity_pascal}>
): Promise<{{ success: boolean; error?: string }}> {{
  try {{
    await serverPut(`/api/setting/{path_name}/${{id}}`, data);
    revalidatePath("/setting/{path_name}");
    return {{ success: true }};
  }} catch (error) {{
    return {{ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to update {entity_name}" 
    }};
  }}
}}

export async function delete{entity_pascal}(
  id: string
): Promise<{{ success: boolean; error?: string }}> {{
  try {{
    await serverDelete(`/api/setting/{path_name}/${{id}}`);
    revalidatePath("/setting/{path_name}");
    return {{ success: true }};
  }} catch (error) {{
    return {{ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to delete {entity_name}" 
    }};
  }}
}}

export async function toggle{entity_pascal}Status(
  id: string,
  isActive: boolean
): Promise<{{ success: boolean; error?: string }}> {{
  try {{
    await serverPut(`/api/setting/{path_name}/${{id}}/status`, {{ is_active: isActive }});
    revalidatePath("/setting/{path_name}");
    return {{ success: true }};
  }} catch (error) {{
    return {{ 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to update status" 
    }};
  }}
}}
'''
    
    filepath = f"lib/actions/{path_name}.actions.ts"
    with open(filepath, 'w') as f:
        f.write(template)
    
    print(f"✓ Created {filepath}")
    print(f"\nDon't forget to create types in types/{path_name}.ts")

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'validate':
        validate_fetch_config()
    elif command == 'routes':
        list_api_routes()
    elif command == 'generate' and len(sys.argv) > 2:
        generate_api_route(sys.argv[2])
    elif command == 'actions' and len(sys.argv) > 2:
        generate_server_actions(sys.argv[2])
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)

if __name__ == '__main__':
    main()
