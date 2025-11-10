#!/usr/bin/env node

require('dotenv').config();

const mongoose = require('mongoose');
const { CRON_CONFIG, DATABASE_CONFIG } = require('../src/config/app');
const User = require('../src/models/User');
const { userBucket } = require('../src/utils/userBucket');

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/printUserBucket.js <steamId|_id> [--groupsTotal=12]');
    process.exit(1);
  }

  const identifier = args[0];
  const groupsArg = args
    .slice(1)
    .find((arg) => arg.startsWith('--groupsTotal='));
  const groupsFromArg = groupsArg
    ? Number(groupsArg.split('=').pop())
    : undefined;
  const groupsTotal =
    Number(groupsFromArg) > 0
      ? Number(groupsFromArg)
      : CRON_CONFIG.GROUPS_TOTAL;

  await mongoose.connect(DATABASE_CONFIG.uri, DATABASE_CONFIG.options);

  let user =
    (await User.findOne({ steamId: identifier })) ||
    (mongoose.isValidObjectId(identifier)
      ? await User.findById(identifier)
      : null);

  if (!user) {
    console.error(`Utilisateur introuvable pour "${identifier}".`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const bucketIndex = userBucket(user, groupsTotal);

  console.log('\n=== Bucket utilisateur ===');
  console.log(`Utilisateur : ${user.username || 'N/A'} (${user.steamId})`);
  console.log(`_id        : ${user._id.toString()}`);
  console.log(`GroupsTotal: ${groupsTotal}`);
  console.log(`Bucket     : ${bucketIndex} (groupe ${bucketIndex + 1}/${groupsTotal})\n`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('Erreur lors du calcul du bucket utilisateur:', error);
  await mongoose.disconnect();
  process.exit(1);
});

