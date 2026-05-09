"""Database connection factory — SQLite locally, Turso in production."""
import os
import sqlite3

TURSO_URL = os.getenv("TURSO_DATABASE_URL", "")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "")
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'stocksense.db')

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), '..', 'db', 'schema.sql')


def get_connection():
    if TURSO_URL.startswith("libsql://"):
        import libsql_experimental as libsql
        conn = libsql.connect("stocksense.db", sync_url=TURSO_URL, auth_token=TURSO_TOKEN)
        conn.sync()
        return conn
    return sqlite3.connect(DB_PATH)


def sync(conn) -> None:
    """Push local writes to Turso. No-op for plain SQLite."""
    if TURSO_URL.startswith("libsql://"):
        conn.sync()


def init_schema() -> None:
    """Ensure all tables exist. Safe to call on every startup."""
    if not os.path.exists(SCHEMA_PATH):
        return
    with open(SCHEMA_PATH) as f:
        schema = f.read()
    conn = get_connection()
    stmts = [s.strip() for s in schema.split(';') if s.strip() and not s.strip().startswith('--')]
    for stmt in stmts:
        try:
            conn.execute(stmt)
        except Exception:
            pass
    conn.commit()
    sync(conn)
    conn.close()
