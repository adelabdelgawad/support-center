#!/usr/bin/env python3
"""
Docker Infrastructure Helper Script

Utilities for managing Docker infrastructure.

Usage:
    python helper.py validate        # Validate docker-compose.yml
    python helper.py health          # Check service health
    python helper.py env-check       # Check environment variables
    python helper.py security        # Security audit
    python helper.py generate        # Generate docker-compose template
"""

import sys
import os
import subprocess
import yaml
import re

def validate_docker_compose():
    """Validate docker-compose.yml syntax and structure."""
    print("Validating docker-compose.yml...")
    
    compose_file = 'docker-compose.yml'
    if not os.path.exists(compose_file):
        print(f"✗ {compose_file} not found")
        return False
    
    # Syntax validation
    result = subprocess.run(
        ['docker', 'compose', 'config', '-q'],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"✗ Syntax error: {result.stderr}")
        return False
    
    print("✓ Syntax valid")
    
    # Load and check structure
    with open(compose_file, 'r') as f:
        config = yaml.safe_load(f)
    
    services = config.get('services', {})
    issues = []
    
    for name, service in services.items():
        # Check health checks
        if 'healthcheck' not in service:
            issues.append(f"⚠ {name}: No healthcheck defined")
        
        # Check restart policy
        if 'restart' not in service:
            issues.append(f"⚠ {name}: No restart policy")
        
        # Check resource limits
        deploy = service.get('deploy', {})
        resources = deploy.get('resources', {})
        if not resources.get('limits'):
            issues.append(f"ℹ {name}: No resource limits")
        
        # Check network
        if 'networks' not in service:
            issues.append(f"ℹ {name}: Using default network")
    
    if issues:
        print("\nIssues found:")
        for issue in issues:
            print(f"  {issue}")
    else:
        print("✓ All services properly configured")
    
    return True

def check_service_health():
    """Check health status of running services."""
    print("Checking service health...")
    
    result = subprocess.run(
        ['docker', 'compose', 'ps', '--format', 'json'],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return
    
    import json
    try:
        services = json.loads(result.stdout) if result.stdout.strip() else []
        if isinstance(services, dict):
            services = [services]
    except json.JSONDecodeError:
        # Fallback to standard output
        subprocess.run(['docker', 'compose', 'ps'])
        return
    
    for service in services:
        name = service.get('Name', 'unknown')
        state = service.get('State', 'unknown')
        health = service.get('Health', 'N/A')
        
        status_icon = '✓' if state == 'running' else '✗'
        health_icon = '✓' if health == 'healthy' else ('⚠' if health == 'N/A' else '✗')
        
        print(f"{status_icon} {name}: {state} (health: {health_icon} {health})")

def check_env_variables():
    """Check environment variable configuration."""
    print("Checking environment variables...")
    
    # Find all .env files
    env_files = []
    for root, dirs, files in os.walk('.'):
        for file in files:
            if file.startswith('.env') or file.endswith('.env'):
                env_files.append(os.path.join(root, file))
    
    if not env_files:
        print("⚠ No .env files found")
        return
    
    all_vars = {}
    undefined_vars = set()
    
    for env_file in env_files:
        print(f"\n{env_file}:")
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    all_vars[key] = value
                    
                    # Check for undefined references
                    refs = re.findall(r'\$\{(\w+)\}', value)
                    for ref in refs:
                        if ref not in all_vars:
                            undefined_vars.add(ref)
                    
                    # Check for sensitive values
                    if any(s in key.lower() for s in ['password', 'secret', 'key', 'token']):
                        if value and value != f'${{{key}}}':
                            print(f"  ⚠ {key}: Contains sensitive value (consider using secrets)")
                        else:
                            print(f"  ✓ {key}: Referenced from parent")
    
    if undefined_vars:
        print(f"\n⚠ Undefined variable references: {', '.join(undefined_vars)}")

def security_audit():
    """Perform security audit on Docker configuration."""
    print("Running security audit...")
    
    issues = []
    
    compose_file = 'docker-compose.yml'
    if os.path.exists(compose_file):
        with open(compose_file, 'r') as f:
            config = yaml.safe_load(f)
        
        services = config.get('services', {})
        
        for name, service in services.items():
            # Check for privileged mode
            if service.get('privileged'):
                issues.append(f"✗ {name}: Running in privileged mode")
            
            # Check for host network
            if service.get('network_mode') == 'host':
                issues.append(f"⚠ {name}: Using host network mode")
            
            # Check for exposed ports
            ports = service.get('ports', [])
            for port in ports:
                if isinstance(port, str) and port.startswith('0.0.0.0'):
                    issues.append(f"⚠ {name}: Port {port} exposed on all interfaces")
            
            # Check for root user
            if not service.get('user'):
                issues.append(f"ℹ {name}: No user specified (may run as root)")
            
            # Check volumes for sensitive paths
            volumes = service.get('volumes', [])
            sensitive_paths = ['/etc', '/var/run/docker.sock', '/root']
            for vol in volumes:
                if isinstance(vol, str):
                    for path in sensitive_paths:
                        if path in vol:
                            issues.append(f"⚠ {name}: Mounts sensitive path: {vol}")
    
    # Check Dockerfiles
    for root, dirs, files in os.walk('.'):
        for file in files:
            if file == 'Dockerfile':
                filepath = os.path.join(root, file)
                with open(filepath, 'r') as f:
                    content = f.read()
                    
                    if 'USER' not in content:
                        issues.append(f"ℹ {filepath}: No USER instruction (runs as root)")
                    
                    if re.search(r'ADD\s+https?://', content):
                        issues.append(f"⚠ {filepath}: ADD from URL (use COPY + curl instead)")
    
    if issues:
        print("\nSecurity issues found:")
        for issue in issues:
            print(f"  {issue}")
    else:
        print("✓ No security issues found")

def generate_template():
    """Generate a basic docker-compose.yml template."""
    template = '''version: '3.8'

services:
  # Database
  postgres:
    image: postgres:16-alpine
    container_name: ${PROJECT_NAME}_postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app_network
    restart: unless-stopped

  # Cache
  redis:
    image: redis:7-alpine
    container_name: ${PROJECT_NAME}_redis
    command: redis-server --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app_network
    restart: unless-stopped

  # Backend API
  backend:
    build:
      context: ./src/backend
      dockerfile: ../../docker/backend/Dockerfile
    container_name: ${PROJECT_NAME}_backend
    env_file:
      - docker/env/.env.backend
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - app_network
    restart: unless-stopped

  # Frontend
  frontend:
    build:
      context: ./src/frontend
      dockerfile: ../../docker/frontend/Dockerfile
    container_name: ${PROJECT_NAME}_frontend
    env_file:
      - docker/env/.env.frontend
    depends_on:
      - backend
    networks:
      - app_network
    restart: unless-stopped

  # Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: ${PROJECT_NAME}_nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - backend
      - frontend
    networks:
      - app_network
    restart: unless-stopped

volumes:
  postgres_data:

networks:
  app_network:
    driver: bridge
'''
    
    if os.path.exists('docker-compose.yml'):
        confirm = input("docker-compose.yml exists. Overwrite? (y/N): ")
        if confirm.lower() != 'y':
            print("Cancelled.")
            return
    
    with open('docker-compose.yml', 'w') as f:
        f.write(template)
    
    print("✓ Generated docker-compose.yml")
    print("  Remember to create:")
    print("    - .env (root environment variables)")
    print("    - docker/env/.env.backend")
    print("    - docker/env/.env.frontend")
    print("    - docker/nginx/nginx.conf")

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    command = sys.argv[1]
    
    commands = {
        'validate': validate_docker_compose,
        'health': check_service_health,
        'env-check': check_env_variables,
        'security': security_audit,
        'generate': generate_template,
    }
    
    if command in commands:
        commands[command]()
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)

if __name__ == '__main__':
    main()
