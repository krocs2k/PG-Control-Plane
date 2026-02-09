#!/bin/bash
set -e

# This script wraps the default PostgreSQL entrypoint
# It ensures broadplane_db superuser exists on every start

# Function to create control plane user
create_control_plane_user() {
    local max_attempts=30
    local attempt=1
    
    echo "[broadplane_db] Waiting for PostgreSQL to be ready..."
    
    # Wait for PostgreSQL to accept connections
    while [ $attempt -le $max_attempts ]; do
        if pg_isready -U "${POSTGRES_USER:-postgres}" -q; then
            echo "[broadplane_db] PostgreSQL is ready"
            break
        fi
        echo "[broadplane_db] Waiting... (attempt $attempt/$max_attempts)"
        sleep 1
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        echo "[broadplane_db] ERROR: PostgreSQL did not become ready in time"
        return 1
    fi
    
    # Check if broadplane_db user exists
    local user_exists=$(psql -U "${POSTGRES_USER:-postgres}" -tAc "SELECT 1 FROM pg_roles WHERE rolname='broadplane_db'" 2>/dev/null || echo "")
    
    if [ "$user_exists" = "1" ]; then
        echo "[broadplane_db] User 'broadplane_db' already exists"
        
        # Update password if BROADPLANE_DB_PASSWORD is set
        if [ -n "$BROADPLANE_DB_PASSWORD" ]; then
            echo "[broadplane_db] Updating password for 'broadplane_db'"
            psql -U "${POSTGRES_USER:-postgres}" -c "ALTER USER broadplane_db WITH PASSWORD '${BROADPLANE_DB_PASSWORD}'" 2>/dev/null || true
        fi
    else
        echo "[broadplane_db] Creating superuser 'broadplane_db'..."
        
        # Use provided password or generate one
        local password="${BROADPLANE_DB_PASSWORD:-$(openssl rand -base64 24)}"
        
        psql -U "${POSTGRES_USER:-postgres}" <<-EOSQL
            CREATE USER broadplane_db WITH 
                SUPERUSER 
                CREATEDB 
                CREATEROLE 
                REPLICATION 
                LOGIN 
                PASSWORD '${password}';
            
            -- Grant additional privileges
            GRANT ALL PRIVILEGES ON DATABASE postgres TO broadplane_db;
EOSQL
        
        echo "[broadplane_db] ✅ User 'broadplane_db' created successfully"
        
        # Output connection string if password was auto-generated
        if [ -z "$BROADPLANE_DB_PASSWORD" ]; then
            echo "[broadplane_db] ========================================"
            echo "[broadplane_db] AUTO-GENERATED CREDENTIALS"
            echo "[broadplane_db] Username: broadplane_db"
            echo "[broadplane_db] Password: ${password}"
            echo "[broadplane_db] Connection String:"
            echo "[broadplane_db] postgresql://broadplane_db:${password}@localhost:5432/postgres"
            echo "[broadplane_db] ========================================"
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
