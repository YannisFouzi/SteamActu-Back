#!/usr/bin/env node
/**
 * Genere le ADMIN_PASSWORD_HASH a coller dans .env / Railway Variables.
 *
 * Usage:
 *   node scripts/generate-admin-password.js <motdepasse>
 *
 * bcrypt cost 12 = standard 2026 (OWASP). Generation ~200ms sur un laptop
 * moderne, soit la meme duree que la verification au login. Ralentit
 * suffisamment un eventuel brute-force offline si le hash fuitait.
 */

const bcrypt = require('bcryptjs');

const [, , password] = process.argv;

if (!password || password.length < 8) {
  console.error('Usage: node scripts/generate-admin-password.js <motdepasse>');
  console.error('Le mot de passe doit faire au moins 8 caracteres.');
  process.exit(1);
}

const COST = 12;

bcrypt.hash(password, COST).then((hash) => {
  console.log('\nAjoutez cette ligne dans backend/.env (et dans Railway Variables en prod):\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log('\nGenerez aussi un ADMIN_SESSION_SECRET si pas deja defini :');
  console.log('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n');
});
