/**
 * Utilitaires communs pour le hachage et l'appartenance à un bucket utilisateur.
 */

function stableHash(input) {
  const str = String(input ?? '');
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

function userBucket(user, groupsTotal) {
  const key =
    user?._id?.toString?.() ??
    user?.id ??
    user?.steamId ??
    user?.steam_id ??
    '';
  const total = Number(groupsTotal) > 0 ? Number(groupsTotal) : 1;
  return stableHash(key) % total;
}

function isInBucket(user, groupIndex, groupsTotal) {
  const total = Number(groupsTotal) > 0 ? Number(groupsTotal) : 1;
  const gi = Number(groupIndex);
  if (!Number.isInteger(gi) || gi < 0 || gi >= total) {
    return false;
  }
  return userBucket(user, total) === gi;
}

module.exports = {
  stableHash,
  userBucket,
  isInBucket,
};

