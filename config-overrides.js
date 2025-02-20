const webpack = require('webpack'); 

module.exports = function override(config, env) {
    const fallback = {
        "crypto": require.resolve("crypto-browserify"),
        "stream": require.resolve("stream-browserify"),
        "http": require.resolve("stream-http"),
        "https": require.resolve("https-browserify"),
        "zlib": require.resolve("browserify-zlib"),
        "path": require.resolve("path-browserify"),
        "buffer": require.resolve("buffer/"),
        "process": require.resolve("process/browser"),
        "assert": require.resolve("assert/"),
        "util": require.resolve("util/"),
        "vm": require.resolve("vm-browserify"),
        "url": require.resolve("url/") // Added fallback for "url" module
    };

    config.resolve.fallback = fallback;
    config.plugins = (config.plugins || []).concat([
        new webpack.ProvidePlugin({
            process: 'process/browser',
            Buffer: ['buffer', 'Buffer']
        })
    ]);
    config.resolve.extensions = [...(config.resolve.extensions || []), ".ts", ".js"];
    config.ignoreWarnings = [/Failed to parse source map/];
    
    return config;
}
