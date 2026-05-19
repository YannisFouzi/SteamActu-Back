const Wishlist = require('../../../src/models/Wishlist');
const { createWishlist } = require('../../helpers/factories');

describe('Model Wishlist', () => {
  it('exige appId et name', async () => {
    const w = new Wishlist({});
    await expect(w.validate()).rejects.toThrow();
  });

  it('crée avec defaults attendus', async () => {
    const w = await createWishlist({ appId: '12345', name: 'Battlefield 6' });
    expect(w.header_image).toBe('');
  });

  it('appId est unique', async () => {
    await createWishlist({ appId: '12345', name: 'Battlefield 6' });
    await expect(
      createWishlist({ appId: '12345', name: 'Battlefield 6 bis' }),
    ).rejects.toThrow();
  });

  it('marque appId comme indexé', () => {
    const path = Wishlist.schema.path('appId');
    expect(path.options.unique).toBe(true);
    expect(path.options.index).toBe(true);
  });
});
