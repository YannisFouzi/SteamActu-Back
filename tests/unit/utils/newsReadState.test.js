const { isNewsSeenByUser } = require('../../../src/utils/newsReadState');

describe('utils/newsReadState — isNewsSeenByUser', () => {
  const seenAt = new Date('2026-06-12T10:00:00Z');

  it('false si inFeedAt absent (news jamais affichée dans le feed du user)', () => {
    expect(isNewsSeenByUser(null, seenAt)).toBe(false);
    expect(isNewsSeenByUser(undefined, seenAt)).toBe(false);
  });

  it('false si lastNewsFeedSeenAt absent (jamais de vue active)', () => {
    expect(isNewsSeenByUser(new Date('2026-06-12T09:00:00Z'), null)).toBe(false);
    expect(isNewsSeenByUser(new Date('2026-06-12T09:00:00Z'), undefined)).toBe(false);
  });

  it('true si inFeedAt < lastNewsFeedSeenAt (apparue avant la vue active)', () => {
    expect(isNewsSeenByUser(new Date('2026-06-12T09:00:00Z'), seenAt)).toBe(true);
  });

  it('true si inFeedAt === lastNewsFeedSeenAt (cas limite : vue pile au même instant)', () => {
    expect(isNewsSeenByUser(seenAt, seenAt)).toBe(true);
  });

  it('false si inFeedAt > lastNewsFeedSeenAt (apparue après la dernière vue active)', () => {
    expect(isNewsSeenByUser(new Date('2026-06-12T11:00:00Z'), seenAt)).toBe(false);
  });

  it('accepte les formats Date, number (epoch ms) et string ISO', () => {
    expect(isNewsSeenByUser(seenAt.getTime() - 1000, seenAt.getTime())).toBe(true);
    expect(isNewsSeenByUser('2026-06-12T09:00:00Z', '2026-06-12T10:00:00Z')).toBe(true);
    expect(isNewsSeenByUser('2026-06-12T11:00:00Z', '2026-06-12T10:00:00Z')).toBe(false);
  });
});
