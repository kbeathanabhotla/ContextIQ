import sys
import time
import psycopg2
from psycopg2 import OperationalError


def wait_for_postgres(host, port, user, password, database, max_retries=30, delay=2):
    """Wait for PostgreSQL to be ready to accept connections"""
    print(f"Waiting for PostgreSQL at {host}:{port}...")
    
    for i in range(max_retries):
        try:
            conn = psycopg2.connect(
                host=host,
                port=port,
                user=user,
                password=password,
                database=database
            )
            conn.close()
            print("PostgreSQL is ready!")
            return True
        except OperationalError as e:
            if i < max_retries - 1:
                print(f"PostgreSQL is not ready yet. Retrying in {delay} seconds... ({i+1}/{max_retries})")
                time.sleep(delay)
            else:
                print(f"Failed to connect to PostgreSQL after {max_retries} attempts")
                print(f"Error: {e}")
                return False
    
    return False


if __name__ == '__main__':
    import os
    
    # Get database connection details from environment
    db_host = os.getenv('POSTGRES_HOST', 'postgres')
    db_port = os.getenv('POSTGRES_PORT', '5432')
    db_user = os.getenv('POSTGRES_USER', 'contextiq_user')
    db_password = os.getenv('POSTGRES_PASSWORD', 'contextiq_password')
    db_name = os.getenv('POSTGRES_DB', 'contextiq_db')
    
    if not wait_for_postgres(db_host, db_port, db_user, db_password, db_name):
        sys.exit(1)

