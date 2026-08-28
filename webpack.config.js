const path = require('path');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ModuleFederationPlugin = require('webpack/lib/container/ModuleFederationPlugin');
const getModuleFederationConfig = require('@jahia/webpack-config/getModuleFederationConfig');
const packageJson = require('./package.json');

module.exports = (env, argv) => {
    const config = {
        entry: {
            main: path.resolve(__dirname, 'src/javascript/index')
        },
        output: {
            path: path.resolve(__dirname, 'src/main/resources/javascript/apps/'),
            filename: 'jahia.bundle.js',
            chunkFilename: '[name].jahia.[chunkhash:6].js'
        },
        resolve: {
            mainFields: ['module', 'main'],
            extensions: ['.mjs', '.js', '.jsx', '.json']
        },
        module: {
            rules: [
                {
                    test: /\.m?js$/,
                    type: 'javascript/auto'
                },
                {
                    test: /\.jsx?$/,
                    include: [path.join(__dirname, 'src')],
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: [
                                ['@babel/preset-env', {modules: false}],
                                '@babel/preset-react'
                            ],
                            plugins: ['@babel/plugin-syntax-dynamic-import']
                        }
                    }
                },
                {
                    test: /\.s[ac]ss$/i,
                    use: [
                        'style-loader',
                        {loader: 'css-loader', options: {modules: true}},
                        'sass-loader'
                    ]
                }
            ]
        },
        plugins: [
            // Jahia's helper derives the federation config from package.json: the shared
            // singletons and their ranges, the appShell.remotes.<name> library, and the ./init
            // entry the app shell calls. Hand-rolling it is what breaks share-scope compatibility
            // with jContent and the other federated modules.
            new ModuleFederationPlugin(getModuleFederationConfig(packageJson, {
                remotes: {
                    '@jahia/jcontent': 'appShell.remotes.jcontent'
                }
            })),
            new CleanWebpackPlugin({verbose: false}),
            new CopyWebpackPlugin({patterns: [{from: './package.json', to: ''}]})
        ],
        mode: 'development'
    };

    config.devtool = (argv.mode === 'production') ? 'source-map' : 'eval-source-map';

    return config;
};
