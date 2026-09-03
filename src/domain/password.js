// Password policy for supervisor accounts. Three rules, shown live on the
// sign-up screen so the officer can see what is still missing.
export const RULES = [
  {key: 'len', test: p => p.length >= 8},
  {key: 'caseNum', test: p => /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p)},
  {key: 'special', test: p => /[^A-Za-z0-9]/.test(p)},
];

export function checkPassword(pw) {
  const value = pw || '';
  const results = RULES.map(r => ({key: r.key, ok: r.test(value)}));
  return {results, valid: results.every(r => r.ok)};
}

/**
 * Not real cryptography — a readable digest so the stored value is not the
 * password in plain text. Replace with server-side hashing when the backend
 * exists; passwords should never be verified on the device in production.
 */
export function digest(pw) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const s = String(pw);
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + ch + i, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}
