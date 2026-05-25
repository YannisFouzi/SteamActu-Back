const User = require('../../models/User');
const {
  DEFAULT_LANGUAGE,
  isSupportedAppLanguage,
  normalizeAppLanguage,
} = require('../../utils/language');
const {fetchUserProfile} = require('./apiClient');
const {checkGamesVisibility} = require('./visibilityCheck');
const logger = require('../../utils/logger');

async function registerOrUpdateUser(steamId, language) {
  try {
    const hasExplicitLanguage = isSupportedAppLanguage(language);
    const normalizedLanguage = hasExplicitLanguage
      ? normalizeAppLanguage(language)
      : DEFAULT_LANGUAGE;
    let user = await User.findOne({steamId});

    if (user) {
      if (hasExplicitLanguage && user.language !== normalizedLanguage) {
        user.language = normalizedLanguage;
        await user.save();
      }

      logger.info('User already exists');
      return user;
    }

    const profileData = await fetchUserProfile(steamId);

    if (!profileData) {
      throw new Error('Unable to fetch Steam profile data');
    }

    user = new User({
      steamId,
      language: normalizedLanguage,
      followedGames: [],
      lastChecked: null,
    });

    await user.save();

    const isVisible = await checkGamesVisibility(steamId);
    if (isVisible) {
      try {
        const {syncUserGames} = require('../gamesSync/userProcessor');
        await syncUserGames(user);
      } catch (syncError) {
        logger.error('Initial games sync failed:', syncError.message);
      }
    } else {
      logger.info(`[LOCKED] [REGISTER] Profil prive detecte pour ${steamId} — sync initial ignore`);
    }

    user = await User.findOne({steamId});
    return user;
  } catch (error) {
    logger.error('registerOrUpdateUser error:', error.message);
    throw error;
  }
}

module.exports = {
  registerOrUpdateUser,
};
