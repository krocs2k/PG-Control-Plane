#!/bin/bash
set -e

# This script wraps the default PostgreSQL entrypoint
# It ensures pgdb_broadplane superuser exists on every start

# Function to create control plane user
create_control_plane_user() {
    local max_attempts=30
    local attempt=1
    
    echo "[pgdb_broadplane] Waiting for PostgreSQL to be ready..."
    
    # Wait for PostgreSQL to accept connections
    while [ $attempt -le $max_attempts ]; do
        if pg_isready -U "${POSTGRES_USER:-postgres}" -q; then
            echo "[pgdb_broadplane] PostgreSQL is ready"
            break
        fi
        echo "[pgdb_broadplane] Waiting... (attempt $attempt/$max_attempts)"
        sleep 1
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        echo "[pgdb_broadplane] ERROR: PostgreSQL did not become ready in time"
        return 1
    fi
    
    # Check if pgdb_broadplane user exists
    local user_exists=$(psql -U "${POSTGRES_USER:-postgres}" -tAc "SELECT 1 FROM pg_roles WHERE rolname='pgdb_broadplane'" 2>/dev/null || echo "")
    
    if [ "$user_exists" = "1" ]; then
        echo "[pgdb_broadplane] User 'pgdb_broadplane' already exists"
        
        # Update password if PGDB_BROADPLANE_PASSWORD is set
        if [ -n "$PGDB_BROADPLANE_PASSWORD" ]; then
            echo "[pgdb_broadplane] Updating password for 'pgdb_broadplane'"
            psql -U "${POSTGRES_USER:-postgres}" -c "ALTER USER pgdb_broadplane WITH PASSWORD '${PGDB_BROADPLANE_PASSWORD}'" 2>/dev/null || true
        fi
    else
        echo "[pgdb_broadplane] Creating superuser 'pgdb_broadplane'..."
        
        # Use provided password or generate one
        local password="${PGDB_BROADPLANE_PASSWORD:-$(openssl rand -base64 24)}"
        
        psql -U "${POSTGRES_USER:-postgres}" <<-EOSQL
            CREATE USER pgdb_broadplane WITH 
                SUPERUSER 
                CREATEDB 
                CREATEROLE 
                REPLICATION 
                LOGIN 
                PASSWORD '${password}';
            
            -- Grant additional privileges
            GRANT ALL PRIVILEGES ON DATABASE postgres TO pgdb_broadplane;
EOSQL
        
        echo "[pgdb_broadplane] ✅ User 'pgdb_broadplane' created successfully"
        
        # Output connection string if password was auto-generated
        if [ -z "$PGDB_BROADPLANE_PASSWORD" ]; then
            echo "[pgdb_broadplane] ========================================"
            echo "[pgdb_broadplane] AUTO-GENERATED CREDENTIALS"
            echo "[pgdb_broadplane] Username: pgdb_broadplane"
            echo "[pgdb_broadplane] Password: ${password}"
            echo "[pgdb_broadplane] Connection String:"
            echo "[pgdb_broadplane] postgresql://pgdb_broadplane:${password}@localhost:5432/postgres"
            echo "[pgdb_broadplane] ========================================"
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
