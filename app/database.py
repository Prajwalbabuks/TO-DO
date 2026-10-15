import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path


DATABASE_PATH = os.getenv("TODO_DB_PATH", "todos.db")


def init_db() -> None:
    """Create the task table if it does not already exist."""
    db_path = Path(DATABASE_PATH)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL CHECK(length(trim(title)) > 0),
                completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
            )
            """
        )
        connection.commit()
    finally:
        connection.close()


@contextmanager
def get_connection():
    """Yield a row-aware SQLite connection and always close it afterward."""
    db_path = Path(DATABASE_PATH)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
