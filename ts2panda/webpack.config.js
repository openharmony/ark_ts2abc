const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');

// the path(s) that should be cleaned
let pathsToClean = ['dist'];

// the clean options to use
let cleanOptions = {
    root: path.resolve(__dirname),
    verbose: true,
    dry: false,
};

function initConfig(config, envArgs) {
    console.log(envArgs.buildMode)
    Object.assign(config, {
        optimization: {
            minimize: envArgs.buildMode !== 'debug'
        },
        resolve: {
            extensions: ['.js', '.ts'],
        },
        devtool: 'source-map',
        mode: 'development',
        entry: {
            'index': './src/index.ts',
        },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, 'dist/src'),
            libraryTarget: 'commonjs',
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: [
                        {
                            loader: 'ts-loader',
                            options: {
                                configFile: path.resolve(__dirname, './tsconfig.json'),
                            },
                        },
                    ],
                    exclude: /node_modules/,
                },
            ],
        },
        plugins: [new CleanWebpackPlugin(pathsToClean, cleanOptions)],
        target: 'node',
        node:{
            __dirname: false,
            __filename: false,
            global: false
        }
    });
}

module.exports = (env, argv) => {
    const config = {};
    initConfig(config, env)
    return config;
};
