import {it, describe, expect} from '@jest/globals';
import {appendMatchEntry, matchLogToCsv, MAX_MATCH_LOG_ENTRIES} from '../src/domain/matchLog';

describe('appendMatchEntry', () => {
  it('appends to an empty/undefined log', () => {
    expect(appendMatchEntry(undefined, {a: 1})).toEqual([{a: 1}]);
    expect(appendMatchEntry([], {a: 1})).toEqual([{a: 1}]);
  });

  it('caps the log, dropping the oldest entries first', () => {
    const log = Array.from({length: MAX_MATCH_LOG_ENTRIES}, (_, i) => ({i}));
    const next = appendMatchEntry(log, {i: 'new'});
    expect(next.length).toBe(MAX_MATCH_LOG_ENTRIES);
    expect(next[0]).toEqual({i: 1}); // oldest (i: 0) dropped
    expect(next[next.length - 1]).toEqual({i: 'new'});
  });
});

describe('matchLogToCsv', () => {
  it('produces a header row for an empty log', () => {
    const csv = matchLogToCsv([]);
    expect(csv.split('\n')).toEqual([
      'at,workerId,workerName,outcome,detail,score,verified,demo',
    ]);
  });

  it('serializes entries and escapes commas/quotes in names', () => {
    const csv = matchLogToCsv([
      {
        at: '2026-01-01T00:00:00.000Z',
        workerId: 'w1',
        workerName: 'Rahul, "The Boss"',
        outcome: 'matched',
        detail: null,
        score: 0.912,
        verified: true,
        demo: false,
      },
    ]);
    const [, row] = csv.split('\n');
    expect(row).toBe(
      '2026-01-01T00:00:00.000Z,w1,"Rahul, ""The Boss""",matched,,0.912,true,false',
    );
  });
});
