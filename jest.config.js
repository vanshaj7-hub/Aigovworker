module.exports = {
  preset: 'react-native',
  // Official native-module mocks — without these, any test that pulls in
  // storage.js (AsyncStorage) or App.js (NetInfo) fails on a native module
  // that simply isn't present under Node, not on anything the app does wrong.
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
    '^@react-native-community/netinfo$': '@react-native-community/netinfo/jest/netinfo-mock',
  },
  // react-native-fs (and friends) ship untranspiled Flow syntax; the preset's
  // default pattern only transforms React Native itself, so these need to be
  // added explicitly or Jest trips on their type annotations.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-fs|react-native-vector-icons|react-native-svg)/)',
  ],
};
