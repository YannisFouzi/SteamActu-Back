require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');

(async () => {
  const steamId = process.argv[2] || '76561198158439485';
  await mongoose.connect(process.env.MONGODB_URI);
  const res = await User.updateOne(
    { steamId },
    { $set: { lastNewsFeedSeenAt: null } }
  );
  console.log('Reset result for', steamId, ':', res.modifiedCount, 'doc(s) updated');
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
