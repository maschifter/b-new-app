const { mobileKitJestConfig } = require("./testing/jest/config");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  ...mobileKitJestConfig,
};
