import {localizeWorkerName} from '../src/localize';

const tr = (key, params) => `${key}:${JSON.stringify(params || {})}`;

describe('localizeWorkerName', () => {
  it('uses the known-roster spelling instead of the phonetic transliterator', () => {
    // "Sharda" phonetically transliterates to the wrong "शर्द" (missing the
    // long vowels) — this is exactly the kind of real name the override
    // table exists for.
    expect(localizeWorkerName('Sharda', tr, 'hi')).toBe('शारदा');
  });

  it('matches case-insensitively and normalizes internal whitespace', () => {
    expect(localizeWorkerName('SHIV KUMAR', tr, 'hi')).toBe('शिव कुमार');
    expect(localizeWorkerName('shiv   kumar', tr, 'hi')).toBe('शिव कुमार');
  });

  it('falls back to phonetic transliteration for names not in the table', () => {
    expect(localizeWorkerName('Suresh', tr, 'hi')).not.toBe('Suresh');
  });

  it('leaves the name unchanged outside Hindi', () => {
    expect(localizeWorkerName('Sharda', tr, 'en')).toBe('Sharda');
  });

  it('still handles the "Worker N" placeholder pattern', () => {
    expect(localizeWorkerName('Worker 7', tr, 'hi')).toBe('workerN:{"n":"7"}');
  });
});
