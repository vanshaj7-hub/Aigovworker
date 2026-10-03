// Manual jest mock — native module isn't present under Node.
module.exports = {
  open: jest.fn(() => Promise.resolve({success: true})),
  default: {
    open: jest.fn(() => Promise.resolve({success: true})),
  },
};
