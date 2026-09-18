const { mobileKitJestConfig } = require("@bnewapp/mobile-kit/testing/jest/config");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  ...mobileKitJestConfig,
};
