"""Database helper — Supabase REST API client (replaces Turso/libsql)."""
import os
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


def init_schema() -> None:
    """No-op — schema is managed via Supabase dashboard (supabase/schema.sql)."""
    pass
