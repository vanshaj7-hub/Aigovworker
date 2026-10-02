import {demoWardGeo} from '../src/demoGeo';

describe('demoWardGeo', () => {
  it('is deterministic for the same ward code and inside flag', () => {
    const a = demoWardGeo('42', true);
    const b = demoWardGeo('42', true);
    expect(a).toEqual(b);
  });

  it('always returns a 4-point boundary and a point', () => {
    const {boundary, point} = demoWardGeo('7', false);
    expect(boundary).toHaveLength(4);
    expect(point).toEqual(expect.objectContaining({lat: expect.any(Number), lng: expect.any(Number)}));
  });

  it('flags the point inside vs outside as requested', () => {
    expect(demoWardGeo('7', true).point.inside).toBe(true);
    expect(demoWardGeo('7', false).point.inside).toBe(false);
  });

  it('varies the center by ward code', () => {
    const a = demoWardGeo('1', true);
    const b = demoWardGeo('2', true);
    expect(a.boundary).not.toEqual(b.boundary);
  });
});
