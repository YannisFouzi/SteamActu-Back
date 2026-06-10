const steamGridDbMock = { getGameImage: jest.fn() };
const apiClientMock = { fetchGameDetails: jest.fn() };

jest.doMock('../../../../src/services/steamGridDbService', () => steamGridDbMock);
jest.doMock('../../../../src/services/steam/apiClient', () => apiClientMock);

const {
  addUserToGameSubscription,
  removeUserFromGameSubscription,
} = require('../../../../src/services/users/subscriptionManager');
const GameSubscription = require('../../../../src/models/GameSubscription');
const { createGameSubscription } = require('../../../helpers/factories');

describe('services/users/subscriptionManager', () => {
  beforeEach(() => {
    steamGridDbMock.getGameImage.mockReset();
    apiClientMock.fetchGameDetails.mockReset();
    apiClientMock.fetchGameDetails.mockResolvedValue(null);
  });

  describe('addUserToGameSubscription()', () => {
    it('crée le doc avec subscriber si inexistant', async () => {
      steamGridDbMock.getGameImage.mockResolvedValue(null);
      await addUserToGameSubscription('730', '76561197960287930', 'CSGO', 'https://img/1');

      const sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub).toBeTruthy();
      expect(sub.name).toBe('CSGO');
      expect(sub.imageUrl).toBe('https://img/1');
      expect(sub.subscribers).toEqual(['76561197960287930']);
      expect(sub.lastNewsTimestamp).toBeGreaterThan(0);
    });

    it('priorité à l\'icône SteamGridDB sur imageUrl fourni', async () => {
      steamGridDbMock.getGameImage.mockResolvedValue('https://grid/730.png');
      await addUserToGameSubscription('730', '7656', 'CSGO', 'https://img/1');

      const sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub.imageUrl).toBe('https://grid/730.png');
    });

    it('ajoute un nouveau subscriber via $addToSet (idempotent)', async () => {
      steamGridDbMock.getGameImage.mockResolvedValue(null);
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        subscribers: ['s1'],
      });

      await addUserToGameSubscription('730', 's2', 'CSGO', '');
      let sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub.subscribers).toEqual(['s1', 's2']);

      await addUserToGameSubscription('730', 's2', 'CSGO', ''); // 2e fois = pas de dup
      sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub.subscribers).toEqual(['s1', 's2']);
    });

    it('met à jour imageUrl si gridDbIcon devient disponible', async () => {
      steamGridDbMock.getGameImage.mockResolvedValueOnce(null);
      await addUserToGameSubscription('730', 's1', 'CSGO', '');

      steamGridDbMock.getGameImage.mockResolvedValueOnce('https://grid/new.png');
      await addUserToGameSubscription('730', 's2', 'CSGO', '');

      const sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub.imageUrl).toBe('https://grid/new.png');
    });

    it('remplit imageUrl vide avec imageUrl fourni', async () => {
      steamGridDbMock.getGameImage.mockResolvedValue(null);
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        imageUrl: '',
        subscribers: ['s1'],
      });

      await addUserToGameSubscription('730', 's2', 'CSGO', 'https://img/fallback.jpg');
      const sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub.imageUrl).toBe('https://img/fallback.jpg');
    });

    it('remplace un nom placeholder ("Jeu 730") par un vrai titre au follow suivant', async () => {
      steamGridDbMock.getGameImage.mockResolvedValue(null);
      await createGameSubscription({
        gameId: '730',
        name: 'Jeu 730',
        subscribers: ['s1'],
      });

      await addUserToGameSubscription('730', 's2', 'Counter-Strike 2', '');
      const sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub.name).toBe('Counter-Strike 2');
    });

    it('ne remplace pas un vrai nom par un placeholder', async () => {
      steamGridDbMock.getGameImage.mockResolvedValue(null);
      await createGameSubscription({
        gameId: '730',
        name: 'Counter-Strike 2',
        subscribers: ['s1'],
      });

      await addUserToGameSubscription('730', 's2', 'Jeu 730', '');
      const sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub.name).toBe('Counter-Strike 2');
    });

    it('default name "Jeu {appId}" si fourni vide', async () => {
      steamGridDbMock.getGameImage.mockResolvedValue(null);
      await addUserToGameSubscription('730', 's1', '', '');
      const sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub.name).toBe('Jeu 730');
    });

    it('survit à un crash SteamGridDB', async () => {
      steamGridDbMock.getGameImage.mockRejectedValue(new Error('down'));
      await addUserToGameSubscription('730', 's1', 'CSGO', 'https://img/1');
      const sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub.imageUrl).toBe('https://img/1');
    });

    it('fallback Store header quand SGDB échoue — prioritaire sur le logoUrl client (souvent deviné/mort)', async () => {
      steamGridDbMock.getGameImage.mockResolvedValue(null);
      apiClientMock.fetchGameDetails.mockResolvedValue({
        name: 'WheelMates',
        header_image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3905450/46df0b/header.jpg',
      });

      await addUserToGameSubscription(
        '3905450',
        's1',
        'WheelMates',
        'https://cdn.cloudflare.steamstatic.com/steam/apps/3905450/header.jpg'
      );

      const sub = await GameSubscription.findOne({ gameId: '3905450' });
      expect(sub.imageUrl).toBe(
        'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3905450/46df0b/header.jpg'
      );
    });

    it('ne consulte pas le Store quand SGDB a trouvé une icône', async () => {
      steamGridDbMock.getGameImage.mockResolvedValue('https://grid/730.png');
      await addUserToGameSubscription('730', 's1', 'CSGO', '');

      expect(apiClientMock.fetchGameDetails).not.toHaveBeenCalled();
    });

    it('retombe sur le logoUrl client quand SGDB et le Store échouent tous les deux', async () => {
      steamGridDbMock.getGameImage.mockResolvedValue(null);
      apiClientMock.fetchGameDetails.mockRejectedValue(new Error('store down'));

      await addUserToGameSubscription('730', 's1', 'CSGO', 'https://img/client.jpg');

      const sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub.imageUrl).toBe('https://img/client.jpg');
    });

    it('remplit imageUrl vide d\'un doc existant avec le Store header', async () => {
      steamGridDbMock.getGameImage.mockResolvedValue(null);
      apiClientMock.fetchGameDetails.mockResolvedValue({
        header_image: 'https://store/header.jpg',
      });
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        imageUrl: '',
        subscribers: ['s1'],
      });

      await addUserToGameSubscription('730', 's2', 'CSGO', '');
      const sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub.imageUrl).toBe('https://store/header.jpg');
    });
  });

  describe('removeUserFromGameSubscription()', () => {
    it('retire le subscriber et conserve le doc s\'il en reste', async () => {
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        subscribers: ['s1', 's2'],
      });

      const deleted = await removeUserFromGameSubscription('730', 's1');
      expect(deleted).toBe(false);

      const sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub.subscribers).toEqual(['s2']);
    });

    it('supprime le doc quand le dernier subscriber part', async () => {
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        subscribers: ['s1'],
      });

      const deleted = await removeUserFromGameSubscription('730', 's1');
      expect(deleted).toBe(true);
      const sub = await GameSubscription.findOne({ gameId: '730' });
      expect(sub).toBeNull();
    });

    it('renvoie false si la subscription n\'existe pas', async () => {
      expect(await removeUserFromGameSubscription('99999', 's1')).toBe(false);
    });
  });
});
