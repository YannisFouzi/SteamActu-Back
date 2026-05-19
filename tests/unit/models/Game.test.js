const Game = require('../../../src/models/Game');
const { createGame } = require('../../helpers/factories');

describe('Model Game', () => {
  it('exige appId et name', async () => {
    const game = new Game({});
    await expect(game.validate()).rejects.toThrow();
  });

  it('crée avec defaults attendus', async () => {
    const game = await createGame({ appId: '730', name: 'CSGO' });
    expect(game.img_icon_url).toBe('');
    expect(game.header_image).toBe('');
  });

  it('appId est unique', async () => {
    await createGame({ appId: '730', name: 'CSGO' });
    await expect(createGame({ appId: '730', name: 'CSGO bis' })).rejects.toThrow();
  });

  it('marque appId comme indexé', () => {
    const path = Game.schema.path('appId');
    expect(path.options.unique).toBe(true);
    expect(path.options.index).toBe(true);
  });
});
