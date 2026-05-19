const { userBucket, isInBucket } = require('../../../src/utils/userBucket');
const { newObjectId } = require('../../helpers/factories');

describe('utils/userBucket', () => {
  describe('userBucket()', () => {
    it('retourne un entier dans [0, groupsTotal - 1]', () => {
      const user = { _id: newObjectId() };
      for (let groupsTotal = 1; groupsTotal <= 24; groupsTotal += 1) {
        const bucket = userBucket(user, groupsTotal);
        expect(Number.isInteger(bucket)).toBe(true);
        expect(bucket).toBeGreaterThanOrEqual(0);
        expect(bucket).toBeLessThan(groupsTotal);
      }
    });

    it('est déterministe pour un même user et un même groupsTotal', () => {
      const user = { _id: newObjectId() };
      const a = userBucket(user, 12);
      const b = userBucket(user, 12);
      expect(a).toBe(b);
    });

    it('utilise _id en priorité, puis id, puis steamId, puis steam_id', () => {
      const oid = newObjectId();
      const userById = { _id: oid };
      const userByIdField = { id: oid.toString() };
      const userBySteamId = { steamId: '76561197960287930' };
      const userBySteamSnake = { steam_id: '76561197960287930' };

      expect(userBucket(userById, 12)).toBe(userBucket(userByIdField, 12));
      expect(userBucket(userBySteamId, 12)).toBe(
        userBucket(userBySteamSnake, 12),
      );
    });

    it('clamp groupsTotal invalide (<= 0, NaN) à 1', () => {
      const user = { steamId: '76561197960287930' };
      expect(userBucket(user, 0)).toBe(0);
      expect(userBucket(user, -5)).toBe(0);
      expect(userBucket(user, NaN)).toBe(0);
      expect(userBucket(user)).toBe(0);
    });

    it('retourne 0 quand user est null/undefined ou sans identifiant', () => {
      expect(userBucket(null, 12)).toBe(userBucket({}, 12));
      expect(userBucket(undefined, 12)).toBe(userBucket({}, 12));
    });

    it('répartit raisonnablement sur 12 buckets pour 1000 users', () => {
      const buckets = new Array(12).fill(0);
      for (let i = 0; i < 1000; i += 1) {
        buckets[userBucket({ _id: newObjectId() }, 12)] += 1;
      }
      const min = Math.min(...buckets);
      const max = Math.max(...buckets);
      expect(min).toBeGreaterThan(30);
      expect(max).toBeLessThan(200);
    });
  });

  describe('isInBucket()', () => {
    it('retourne true ssi userBucket(user, total) === groupIndex', () => {
      const user = { _id: newObjectId() };
      const total = 12;
      const expected = userBucket(user, total);
      for (let i = 0; i < total; i += 1) {
        expect(isInBucket(user, i, total)).toBe(i === expected);
      }
    });

    it('retourne false si groupIndex hors bornes', () => {
      const user = { steamId: '76561197960287930' };
      expect(isInBucket(user, -1, 12)).toBe(false);
      expect(isInBucket(user, 12, 12)).toBe(false);
      expect(isInBucket(user, 999, 12)).toBe(false);
    });

    it('retourne false si groupIndex non entier', () => {
      const user = { steamId: '76561197960287930' };
      expect(isInBucket(user, 1.5, 12)).toBe(false);
      expect(isInBucket(user, 'abc', 12)).toBe(false);
      expect(isInBucket(user, null, 12)).toBe(false);
    });
  });
});
