require('./_loadEnv');
const mongoose = require('mongoose');
const User = require('../src/models/User');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find(
    {},
    {
      steamId: 1,
      'notificationSettings.newsNotifications': 1,
      'notificationSettings.fcmTokens': 1,
      followedGames: 1,
      language: 1,
    },
  )
    .lean()
    .limit(10);

  console.log(`\n${users.length} user(s) en base :\n`);
  users.forEach((u) => {
    const ns = u.notificationSettings || {};
    const tokens = Array.isArray(ns.fcmTokens) ? ns.fcmTokens.length : 0;
    const followed = Array.isArray(u.followedGames) ? u.followedGames.length : 0;
    console.log(
      `  steamId=${u.steamId}  news=${ns.newsNotifications ? 'ON' : 'OFF'}  fcm=${tokens}  followed=${followed}  lang=${u.language || '?'}`,
    );
  });

  await mongoose.connection.close();
})();
