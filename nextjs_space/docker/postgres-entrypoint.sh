#!/bin/bash
set -e

# This script wraps the default PostgreSQL entrypoint
# It ensures pgbp superuser exists on every start

# Function to create control plane user
create_control_plane_user() {
    local max_attempts=30
    local attempt=1
    
    echo "[pgbp] Waiting for PostgreSQL to be ready..."
    
    # Wait for PostgreSQL to accept connections
    while [ $attempt -le $max_attempts ]; do
        if pg_isready -U "${POSTGRES_USER:-postgres}" -q; then
            echo "[pgbp] PostgreSQL is ready"
            break
        fi
        echo "[pgbp] Waiting... (attempt $attempt/$max_attempts)"
        sleep 1
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        echo "[pgbp] ERROR: PostgreSQL did not become ready in time"
        return 1
    fi
    
    # Check if pgbp user exists
    local user_exists=$(psql -U "${POSTGRES_USER:-postgres}" -tAc "SELECT 1 FROM pg_roles WHERE rolname='pgbp'" 2>/dev/null || echo "")
    
    if [ "$user_exists" = "1" ]; then
        echo "[pgbp] User 'pgbp' already exists"
        
        # Update password if PGBP_PASSWORD is set
        if [ -n "$PGBP_PASSWORD" ]; then
            echo "[pgbp] Updating password for 'pgbp'"
            psql -U "${POSTGRES_USER:-postgres}" -c "ALTER USER pgbp WITH PASSWORD '${PGBP_PASSWORD}'" 2>/dev/null || true
        fi
    else
        echo "[pgbp] Creating superuser 'pgbp'..."
        
        # Use provided password or generate one
        local password="${PGBP_PASSWORD:-$(openssl rand -base64 24)}"
        
        psql -U "${POSTGRES_USER:-postgres}" <<-EOSQL
            CREATE USER pgbp WITH 
                SUPERUSER 
                CREATEDB 
                CREATEROLE 
                REPLICATION 
                LOGIN 
                PASSWORD '${password}';
            
            -- Grant additional privileges
            GRANT ALL PRIVILEGES ON DATABASE postgres TO pgbp;
EOSQL
        
        echo "[pgbp] ✅ User 'pgbp' created successfully"
        
        # Output connection string if password was auto-generated
        if [ -z "$PGBP_PASSWORD" ]; then
            echo "[pgbp] ========================================"
            echo "[pgbp] AUTO-GENERATED CREDENTIALS"
            echo "[pgbp] Username: pgbp"
            echo "[pgbp] Password: ${password}"
            echo "[pgbp] Connection String:"
            echo "[pgbp] postgresql://pgbp:${password}@localhost:5432/postgres"
            echo "[pgbp] ========================================"
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
