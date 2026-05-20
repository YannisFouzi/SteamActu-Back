/**
 * Bootstrap commun pour les scripts CLI :
 * - charge .env depuis backend/.env
 * - applique l'override DNS optionnel (BACKEND_DNS_SERVERS) — meme logique que
 *   server.js, utile en dev quand le resolver local refuse les SRV queries
 *   `mongodb+srv://` avec ECONNREFUSED.
 *
 * Usage (en tete de script) :
 *   require('./_loadEnv');
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (process.env.BACKEND_DNS_SERVERS) {
  const servers = process.env.BACKEND_DNS_SERVERS
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length > 0) {
    require('dns').setServers(servers);
  }
}
