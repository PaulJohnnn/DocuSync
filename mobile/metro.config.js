const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix Windows ENOENT: Metro tries to watch iOS test folders that don't exist on Windows
config.watchFolders = [];
config.resolver.blockList = [
  /.*\/iostests\/.*/,
  /.*\\iostests\\.*/,
];

module.exports = config;
