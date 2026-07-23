/**
 * Minimal in-memory task store factory.
 *
 * A2A clients may call tasks/get to retrieve a task created by message/send.
 * Tasks expire after ttlMs to keep memory bounded. Swap this for a database if
 * durability across restarts is needed.
 */
function createTaskStore({ ttlMs = 15 * 60 * 1000 } = {}) {
  const tasks = new Map();

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of tasks.entries()) {
      if (entry.expiresAt < now) tasks.delete(id);
    }
  }, 60 * 1000);

  if (typeof sweeper.unref === 'function') sweeper.unref();

  return {
    save(task) {
      tasks.set(task.id, { task, expiresAt: Date.now() + ttlMs });
      return task;
    },
    get(id) {
      const entry = tasks.get(id);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        tasks.delete(id);
        return null;
      }
      return entry.task;
    },
    remove(id) {
      return tasks.delete(id);
    }
  };
}

module.exports = { createTaskStore };
