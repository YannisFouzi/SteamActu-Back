/**
 * État « vu par l'utilisateur » d'une news — partagé par les DEUX émetteurs de
 * notification (push mobile : `newsRotationService` ; toast desktop :
 * `desktopToastService`). Source de vérité unique : c'est EXACTEMENT la règle
 * qui pilote déjà le grisage « vu » du feed (`newsFeedService`).
 *
 * Une news est considérée VUE quand :
 *   1. elle est apparue dans le feed de CE user (`inFeedAt` non-null), ET
 *   2. le user a activement consulté le feed à ce moment-là ou après
 *      (`lastNewsFeedSeenAt`, le high-water-mark posé UNIQUEMENT sur vue active
 *      — mobile, web, extension, plugin — jamais par un poll en arrière-plan).
 *
 * On gate VOLONTAIREMENT sur `lastNewsFeedSeenAt`, pas sur `inFeedAt` seul :
 * `inFeedAt` est posé dès qu'une surface AFFICHE la news (le poll 5 min du plugin
 * inclus), ce qui n'équivaut pas à « le user l'a vue ». Utiliser `inFeedAt` seul
 * était le bug historique (le poll « consommait » la news avant la notif → push
 * jamais envoyé). Le curseur de vue active évite structurellement ce piège.
 *
 * @param {Date|string|number|null|undefined} inFeedAt
 *        Première exposition de la news dans le feed de ce user.
 * @param {Date|string|number|null|undefined} lastNewsFeedSeenAt
 *        Dernière consultation ACTIVE du feed par ce user (high-water-mark).
 * @returns {boolean} true si le user a déjà vu cette news → ne pas (re)notifier.
 */
function isNewsSeenByUser(inFeedAt, lastNewsFeedSeenAt) {
  if (!inFeedAt || !lastNewsFeedSeenAt) {
    return false;
  }
  return new Date(inFeedAt).getTime() <= new Date(lastNewsFeedSeenAt).getTime();
}

module.exports = { isNewsSeenByUser };
