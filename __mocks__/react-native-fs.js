// Manual jest mock for react-native-fs — the package ships no official one
// (unlike AsyncStorage/NetInfo) and its native module isn't present under
// Node, so any file importing it would otherwise crash at import time in
// tests, even when the test never calls a filesystem method.
module.exports = {
  DocumentDirectoryPath: '/mock/documents',
  CachesDirectoryPath: '/mock/caches',
  ExternalDirectoryPath: '/mock/external',
  DownloadDirectoryPath: '/mock/downloads',
  mkdir: jest.fn(() => Promise.resolve()),
  writeFile: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve('')),
  copyFile: jest.fn(() => Promise.resolve()),
  moveFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  exists: jest.fn(() => Promise.resolve(false)),
  stat: jest.fn(() => Promise.resolve({size: 0})),
  downloadFile: jest.fn(() => ({promise: Promise.resolve({statusCode: 200})})),
};
