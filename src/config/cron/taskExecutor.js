/**
 * Exécuteur standardisé pour les tâches cron (logs + timing + catch)
 */
async function executeTask(taskName, taskFunction) {
  const started = Date.now();
  console.log(`[CRON][START] ${taskName}`);

  try {
    const result = await taskFunction();

    const ms = Date.now() - started;
    const sec = Math.round(ms / 1000);

    if (result && typeof result === 'object') {
      const msg = result.message ? ` → ${result.message}` : '';
      console.log(`[CRON][DONE] ${taskName} in ${sec}s${msg}`);
      console.log(JSON.stringify({
        level: 'info',
        tag: 'cron_done',
        task: taskName,
        durationMs: ms,
        ...result,
      }));
    } else {
      console.log(`[CRON][DONE] ${taskName} in ${sec}s`);
    }

    return result;
  } catch (error) {
    console.error(`[CRON][ERROR] ${taskName}:`, error?.stack || error);
    return null;
  }
}

module.exports = { executeTask };
