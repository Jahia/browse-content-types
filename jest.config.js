/*
 * Babel is configured here rather than in a babel.config.js, deliberately.
 *
 * The webpack build passes its own options to babel-loader - `modules: false`, because module
 * federation needs the ES modules left alone - and babel-loader would merge a root config file into
 * those. A babel.config.js added for the tests would therefore reach the bundle too, and the one
 * thing the tests need from Babel is exactly the thing the bundle must not have: modules turned into
 * CommonJS. `configFile: false` and `babelrc: false` keep the two apart.
 */
const babel = ['babel-jest', {
    configFile: false,
    babelrc: false,
    presets: [
        ['@babel/preset-env', {targets: {node: 'current'}}],
        ['@babel/preset-react', {runtime: 'automatic'}]
    ]
}];

module.exports = {
    rootDir: __dirname,
    testEnvironment: 'node',
    testMatch: ['<rootDir>/src/javascript/**/*.spec.{js,jsx}'],
    transform: {'^.+\\.jsx?$': babel},
    collectCoverageFrom: ['src/javascript/**/*.{js,jsx}']
};
