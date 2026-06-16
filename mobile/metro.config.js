const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix Windows ENOENT: Metro tries to watch directories that don't exist on Windows
// (iOS test dirs, Gradle plugin test dirs, Kotlin test dirs)
config.resolver.blockList = [
  /.*[\/\\]iostests[\/\\].*/,
  /.*[\/\\]\.gradle-plugin-[^\/\\]+[\/\\].*/,
  /.*[\/\\]react-native[\/\\]ReactCommon[\/\\].*/,
  /.*[\/\\]react[\/\\]tasks[\/\\]internal[\/\\].*/,
];

module.exports = config;
