from contextlib import asynccontextmanager
from pathlib import Path
import sqlite3 

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.database import get_connection, init_db

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend" 

@asynccontextmanager
async def lifespan(app: FastAPI):
  init_db()  # Initialize the database when the app starts
  yield  # Allow the app to run

app = FastAPI(
    title="MY Todo",
    description="A simple Todo API built with FastAPI and SQLite.",
    version="1.0.0",
    lifespan=lifespan
)

app.mount(
  "/static", 
  StaticFiles(directory=FRONTEND_DIR),
  name="static"
)

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)

class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    completed: bool | None = None

def serialize_task(row: sqlite3.Row) -> dict  :
    """Convert a database row to a dictionary.""" 
    return {
        "id": row["id"],
        "title": row["title"],
        "completed": bool(row["completed"])
    }

@app.get("/")
def home():
    return FileResponse(FRONTEND_DIR / "index.html")

@app.get("/api/tasks")
def get_tasks():
    """Get all tasks."""
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tasks")
        rows = cursor.fetchall()
        tasks = [serialize_task(row) for row in rows]
    return tasks

@app.post("/api/tasks", status_code=status.HTTP_201_CREATED)
def create_task(task: TaskCreate):
    """Create a new task."""
    title = task.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title cannot be empty.")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO tasks (title, completed) VALUES (?, ?)", (title, False))
        conn.commit()
        task_id = cursor.lastrowid
        cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        return serialize_task(row)

@app.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int):
    """Delete a task by ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
        conn.commit()
    return None

@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, task: TaskUpdate):
    """Update a task's title and/or completion state."""
    with get_connection() as conn:
        cursor = conn.cursor()
        assignments = []
        values = []
        if task.title is not None:
            title = task.title.strip()
            if not title:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title cannot be empty.")
            assignments.append("title = ?")
            values.append(title)
        if task.completed is not None:
            assignments.append("completed = ?")
            values.append(int(task.completed))
        if not assignments:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a title or completion state to update.")

        values.append(task_id)
        cursor.execute(f"UPDATE tasks SET {', '.join(assignments)} WHERE id = ?", values)
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
        cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        return serialize_task(row)

# Also serve the assets from the frontend root so /style.css and /script.js
# resolve when the page is opened from the FastAPI app.
app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="frontend")
