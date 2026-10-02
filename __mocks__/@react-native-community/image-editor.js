// Manual jest mock — native module isn't present under Node.
module.exports = {
  cropImage: jest.fn(() => Promise.resolve('file:///mock/cropped.jpg')),
};
