require('./_loadEnv');
const mongoose = require('mongoose');
const GameSubscription = require('../src/models/GameSubscription');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const games = await GameSubscription.find(
    { 'subscribers.0': { $exists: true } },
    { gameId: 1, name: 1, subscribers: 1, lastNewsTimestamp: 1 },
  )
    .lean()
    .limit(20);
  console.log(`\nJeux avec au moins 1 abonne (${games.length} montres) :\n`);
  games.forEach((g) => {
    console.log(
      `  ${g.gameId.toString().padEnd(8)} ${(g.name || '?').padEnd(40)} subs=${g.subscribers?.length || 0}  lastNews=${g.lastNewsTimestamp || 0}`,
    );
  });
  await mongoose.connection.close();
})();
