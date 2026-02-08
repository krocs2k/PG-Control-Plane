#!/bin/bash
set -e

# This script wraps the default PostgreSQL entrypoint
# It ensures pg_control_plane superuser exists on every start

# Function to create control plane user
create_control_plane_user() {
    local max_attempts=30
    local attempt=1
    
    echo "[pg_control_plane] Waiting for PostgreSQL to be ready..."
    
    # Wait for PostgreSQL to accept connections
    while [ $attempt -le $max_attempts ]; do
        if pg_isready -U "${POSTGRES_USER:-postgres}" -q; then
            echo "[pg_control_plane] PostgreSQL is ready"
            break
        fi
        echo "[pg_control_plane] Waiting... (attempt $attempt/$max_attempts)"
        sleep 1
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        echo "[pg_control_plane] ERROR: PostgreSQL did not become ready in time"
        return 1
    fi
    
    # Check if pg_control_plane user exists
    local user_exists=$(psql -U "${POSTGRES_USER:-postgres}" -tAc "SELECT 1 FROM pg_roles WHERE rolname='pg_control_plane'" 2>/dev/null || echo "")
    
    if [ "$user_exists" = "1" ]; then
        echo "[pg_control_plane] User 'pg_control_plane' already exists"
        
        # Update password if PG_CONTROL_PLANE_PASSWORD is set
        if [ -n "$PG_CONTROL_PLANE_PASSWORD" ]; then
            echo "[pg_control_plane] Updating password for 'pg_control_plane'"
            psql -U "${POSTGRES_USER:-postgres}" -c "ALTER USER pg_control_plane WITH PASSWORD '${PG_CONTROL_PLANE_PASSWORD}'" 2>/dev/null || true
        fi
    else
        echo "[pg_control_plane] Creating superuser 'pg_control_plane'..."
        
        # Use provided password or generate one
        local password="${PG_CONTROL_PLANE_PASSWORD:-$(openssl rand -base64 24)}"
        
        psql -U "${POSTGRES_USER:-postgres}" <<-EOSQL
            CREATE USER pg_control_plane WITH 
                SUPERUSER 
                CREATEDB 
                CREATEROLE 
                REPLICATION 
                LOGIN 
                PASSWORD '${password}';
            
            -- Grant additional privileges
            GRANT ALL PRIVILEGES ON DATABASE postgres TO pg_control_plane;
EOSQL
        
        echo "[pg_control_plane] ✅ User 'pg_control_plane' created successfully"
        
        # Output connection string if password was auto-generated
        if [ -z "$PG_CONTROL_PLANE_PASSWORD" ]; then
            echo "[pg_control_plane] ========================================"
            echo "[pg_control_plane] AUTO-GENERATED CREDENTIALS"
            echo "[pg_control_plane] Username: pg_control_plane"
            echo "[pg_control_plane] Password: ${password}"
            echo "[pg_control_plane] Connection String:"
            echo "[pg_control_plane] postgresql://pg_control_plane:${password}@localhost:5432/postgres"
            echo "[pg_control_plane] ========================================"
        fi
    fi
}

# Run the user creation in the background after PostgreSQL starts
(
    # Wait a bit for the main postgres process to initialize
    sleep 3
    create_control_plane_user
) &

# Execute the original PostgreSQL entrypoint
exec docker-entrypoint.sh "$@"
