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
    // jsdom rather than node: a component test needs a DOM to render into, and under `node` there
    // is none - which is why every .js module here has a spec and no .jsx file could have one.
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/src/javascript/**/*.spec.{js,jsx}'],
    transform: {'^.+\\.jsx?$': babel},
    // A component cannot be rendered in a test without this: the source imports its CSS module, and
    // jest has no idea what to do with SCSS. The stand-in answers each class with its own name.
    moduleNameMapper: {'\\.(scss|css)$': '<rootDir>/src/javascript/__mocks__/styleMock.js'},
    collectCoverageFrom: ['src/javascript/**/*.{js,jsx}']
};
