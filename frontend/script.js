(() => {
  "use strict";

  const API_URL = "/api/tasks";
  const state = { tasks: [], filter: "all", query: "", newestFirst: true, busy: false };
  const elements = {
    form: document.querySelector("#task-form"),
    input: document.querySelector("#task-input"),
    list: document.querySelector("#task-list"),
    empty: document.querySelector("#empty-state"),
    emptyTitle: document.querySelector("#empty-title"),
    emptyCopy: document.querySelector("#empty-copy"),
    status: document.querySelector("#status-message"),
    search: document.querySelector("#search-input"),
    sort: document.querySelector("#sort-button"),
    sortLabel: document.querySelector("#sort-label"),
    listTitle: document.querySelector("#list-title"),
    visibleCount: document.querySelector("#visible-count"),
    allCount: document.querySelector("#all-count"),
    activeCount: document.querySelector("#active-count"),
    completedCount: document.querySelector("#completed-count"),
    progressRing: document.querySelector("#progress-ring"),
    progressPercent: document.querySelector("#progress-percent"),
    progressTitle: document.querySelector("#progress-title"),
    progressCaption: document.querySelector("#progress-caption"),
    footer: document.querySelector("#list-footer"),
    clearCompleted: document.querySelector("#clear-completed"),
    today: document.querySelector("#today-label"),
    greeting: document.querySelector("#greeting")
  };

  const filterNames = { all: "All tasks", active: "To do", completed: "Completed" };

  function setMessage(message = "") {
    elements.status.textContent = message;
  }

  async function request(path = "", options = {}) {
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) }
      });
    } catch {
      throw new Error("Could not reach the task server. Check that the backend is running and try again.");
    }

    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = typeof body.detail === "string" ? body.detail : "";
      } catch { /* The response may not contain JSON. */ }

      if (response.status === 405) {
        throw new Error("This action is not available in the backend yet. Add the matching task API route and try again.");
      }
      throw new Error(detail || `The server returned an error (${response.status}). Please try again.`);
    }

    if (response.status === 204) return null;
    const contentType = response.headers.get("content-type") || "";
    return contentType.includes("application/json") ? response.json() : null;
  }

  function normalizeTasks(data) {
    if (!Array.isArray(data)) throw new Error("The task API returned an unexpected response. It should return a list of tasks.");
    return data.filter((task) => task && task.id !== undefined && typeof task.title === "string")
      .map((task) => ({ id: task.id, title: task.title, completed: Boolean(task.completed) }));
  }

  async function loadTasks() {
    elements.list.setAttribute("aria-busy", "true");
    try {
      state.tasks = normalizeTasks(await request());
      setMessage("");
      render();
    } catch (error) {
      state.tasks = [];
      render();
      setMessage(error.message);
    } finally {
      elements.list.setAttribute("aria-busy", "false");
    }
  }

  function visibleTasks() {
    const query = state.query.trim().toLocaleLowerCase();
    return state.tasks
      .filter((task) => state.filter === "all" || (state.filter === "active" ? !task.completed : task.completed))
      .filter((task) => !query || task.title.toLocaleLowerCase().includes(query))
      .slice()
      .sort((a, b) => {
        const aId = Number(a.id);
        const bId = Number(b.id);
        const order = Number.isFinite(aId) && Number.isFinite(bId) ? aId - bId : String(a.id).localeCompare(String(b.id));
        return state.newestFirst ? -order : order;
      });
  }

  function makeTaskRow(task) {
    const row = document.createElement("article");
    row.className = `task-row${task.completed ? " is-complete" : ""}`;

    const check = document.createElement("button");
    check.className = "task-check";
    check.type = "button";
    check.setAttribute("aria-label", task.completed ? `Mark ${task.title} as to do` : `Mark ${task.title} as completed`);
    check.setAttribute("aria-pressed", String(task.completed));
    check.addEventListener("click", () => updateTask(task, check));

    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const edit = document.createElement("button");
    edit.className = "task-action edit";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${task.title}`);

    const remove = document.createElement("button");
    remove.className = "task-action delete";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Delete ${task.title}`);
    remove.addEventListener("click", () => deleteTask(task, remove));

    edit.addEventListener("click", () => editTask(task, row, title, check, edit, remove, actions));

    actions.append(edit, remove);
    row.append(check, title, actions);
    return row;
  }

  function editTask(task, row, title, check, edit, remove, actions) {
    const input = document.createElement("input");
    input.className = "task-edit-input";
    input.type = "text";
    input.maxLength = 100;
    input.value = task.title;
    input.setAttribute("aria-label", `Edit task: ${task.title}`);

    const save = document.createElement("button");
    save.className = "task-action save";
    save.type = "button";
    save.textContent = "Save";

    const cancel = document.createElement("button");
    cancel.className = "task-action cancel";
    cancel.type = "button";
    cancel.textContent = "Cancel";

    title.replaceWith(input);
    check.disabled = true;
    edit.hidden = true;
    remove.hidden = true;
    actions.append(save, cancel);

    const closeEditor = () => {
      if (input.isConnected) input.replaceWith(title);
      check.disabled = false;
      edit.hidden = false;
      remove.hidden = false;
      save.remove();
      cancel.remove();
    };

    const saveEdit = async () => {
      const nextTitle = input.value.trim();
      if (!nextTitle) {
        setMessage("Task title cannot be empty.");
        input.focus();
        return;
      }
      if (nextTitle === task.title) {
        closeEditor();
        return;
      }

      const saved = await runMutation(save, () => request(`/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ title: nextTitle })
      }));
      if (saved) row.setAttribute("aria-label", `Task: ${nextTitle}`);
      else input.focus();
    };

    save.addEventListener("click", saveEdit);
    cancel.addEventListener("click", closeEditor);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") saveEdit();
      if (event.key === "Escape") closeEditor();
    });
    input.focus();
    input.select();
  }

  function render() {
    const filtered = visibleTasks();
    const completed = state.tasks.filter((task) => task.completed).length;
    const active = state.tasks.length - completed;
    const percent = state.tasks.length ? Math.round((completed / state.tasks.length) * 100) : 0;

    elements.list.replaceChildren(...filtered.map(makeTaskRow));
    elements.visibleCount.textContent = String(filtered.length);
    elements.allCount.textContent = String(state.tasks.length);
    elements.activeCount.textContent = String(active);
    elements.completedCount.textContent = String(completed);
    elements.listTitle.textContent = filterNames[state.filter];
    elements.progressPercent.textContent = `${percent}%`;
    elements.progressRing.style.setProperty("--progress", `${percent * 3.6}deg`);
    elements.progressTitle.textContent = !state.tasks.length ? "Getting started" : percent === 100 ? "All done — lovely" : `${completed} of ${state.tasks.length} done`;
    elements.progressCaption.textContent = !state.tasks.length ? "Your day is yours to shape" : percent === 100 ? "You made it happen today" : `${active} ${active === 1 ? "task" : "tasks"} left to go`;
    elements.sortLabel.textContent = state.newestFirst ? "Newest first" : "Oldest first";

    const nothingFound = state.tasks.length > 0 && filtered.length === 0;
    elements.empty.hidden = filtered.length > 0;
    elements.emptyTitle.textContent = nothingFound ? "Nothing here yet." : "A clear page.";
    elements.emptyCopy.textContent = nothingFound
      ? (state.query ? "Try another search or switch to a different list." : "There are no tasks in this list right now.")
      : "Add your first task above and make today count.";
    elements.footer.hidden = completed === 0;
    elements.clearCompleted.disabled = completed === 0 || state.busy;
  }

  async function runMutation(button, action) {
    if (state.busy) return;
    state.busy = true;
    if (button) button.disabled = true;
    setMessage("");
    let succeeded = false;
    try {
      await action();
      await loadTasks();
      succeeded = true;
    } catch (error) {
      setMessage(error.message);
    } finally {
      state.busy = false;
      if (button) button.disabled = false;
      elements.clearCompleted.disabled = state.tasks.every((task) => !task.completed);
    }
    return succeeded;
  }

  function updateTask(task, button) {
    return runMutation(button, () => request(`/${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: !task.completed })
    }));
  }

  function deleteTask(task, button) {
    return runMutation(button, () => request(`/${encodeURIComponent(task.id)}`, { method: "DELETE" }));
  }

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = elements.input.value.trim();
    if (!title || state.busy) {
      if (!title) elements.input.focus();
      return;
    }
    await runMutation(elements.form.querySelector("button[type='submit']"), async () => {
      await request("", { method: "POST", body: JSON.stringify({ title }) });
      elements.input.value = "";
    });
    if (!elements.status.textContent) elements.input.focus();
  });

  elements.search.addEventListener("input", () => {
    state.query = elements.search.value;
    render();
  });

  elements.sort.addEventListener("click", () => {
    state.newestFirst = !state.newestFirst;
    render();
  });

  document.querySelectorAll(".nav-item[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll(".nav-item[data-filter]").forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        if (isActive) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
      });
      render();
    });
  });

  elements.clearCompleted.addEventListener("click", async () => {
    const completed = state.tasks.filter((task) => task.completed);
    if (!completed.length) return;
    await runMutation(elements.clearCompleted, async () => {
      for (const task of completed) {
        await request(`/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      }
    });
  });

  const date = new Date();
  elements.today.textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date);
  const hour = date.getHours();
  elements.greeting.textContent = hour < 12 ? "A FRESH START" : hour < 17 ? "MAKE TODAY COUNT" : "A MOMENT FOR YOU";
  loadTasks();
})();
