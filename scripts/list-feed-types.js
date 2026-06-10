/**
 * Liste les sources de news distinctes (feedname / feed_type / feedlabel)
 * renvoyees par l'API Steam GetNewsForApp pour un jeu donne.
 *
 * Volontairement SANS filtre `feeds` => montre toutes les sources possibles
 * (officielles Steam + flux tiers/presse), pour decider lesquelles garder.
 *
 * Aucune dependance, aucune cle API requise (endpoint public).
 * Usage (depuis backend/): node scripts/list-feed-types.js <appId> [count]
 *   node scripts/list-feed-types.js 570        # Dota 2
 *   node scripts/list-feed-types.js 730 100    # CS2, 100 news
 */

const https = require('https');

const appId = process.argv[2];
const count = Number(process.argv[3]) || 50;

if (!appId) {
  console.error('Usage: node scripts/list-feed-types.js <appId> [count]');
  process.exit(1);
}

const url =
  `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/` +
  `?appid=${appId}&count=${count}&maxlength=0&format=json`;

https
  .get(url, (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      let items;
      try {
        items = JSON.parse(body).appnews.newsitems || [];
      } catch (e) {
        console.error('Reponse inattendue:', body.slice(0, 200));
        process.exit(1);
      }

      console.log(`\n${items.length} news recuperees pour appid ${appId}\n`);

      // Regroupe par cle feedname|feed_type|feedlabel
      const groups = new Map();
      for (const it of items) {
        const key = `${it.feedname} | feed_type=${it.feed_type} | ${it.feedlabel}`;
        groups.set(key, (groups.get(key) || 0) + 1);
      }

      console.log('Sources distinctes (count) :');
      [...groups.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([key, n]) => console.log(`  ${String(n).padStart(3)}x  ${key}`));
      console.log();
    });
  })
  .on('error', (e) => {
    console.error('Erreur reseau:', e.message);
    process.exit(1);
  });
