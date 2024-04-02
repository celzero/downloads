const webpack = require("webpack");

// developers.cloudflare.com/workers/cli-wrangler/configuration#modules
// archive.is/FDky9
module.exports = {
  entry: "./src/index.js",
  target: ["webworker", "es2022"],
  mode: "production",
  // enable devtool in development
  // devtool: 'eval-cheap-module-source-map',

  optimization: {
    usedExports: true,
    minimize: true,
  },

  experiments: {
    outputModule: true,
  },

  // stackoverflow.com/a/68916455
  output: {
    library: {
      type: "module",
    },
    filename: "worker.js",
    module: true,
  },
};
