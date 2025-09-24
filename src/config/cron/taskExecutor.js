/**
 * Utilitaire pour exécuter les tâches cron avec gestion d'erreurs standardisée
 */

/**
 * Exécute une tâche avec gestion d'erreurs et logs standardisés
 * @param {string} taskName - Nom de la tâche pour les logs
 * @param {Function} taskFunction - Fonction à exécuter
 * @param {Object} context - Contexte optionnel pour les logs
 */
async function executeTask(taskName, taskFunction, context = {}) {
  console.log(`Exécution de la tâche planifiée: ${taskName}`);

  try {
    const result = await taskFunction();

    if (result && typeof result === "object") {
      console.log(`Tâche ${taskName} terminée:`, result);
    } else if (typeof result === "number") {
      console.log(`Tâche ${taskName} terminée: ${result} éléments traités`);
    } else {
      console.log(`Tâche ${taskName} terminée avec succès`);
    }

    return result;
  } catch (error) {
    console.error(`Erreur lors de ${taskName}:`, error);
    return null;
  }
}

module.exports = {
  executeTask,
};
