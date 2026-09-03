/**
 * Stands in for a CSS module under jest.
 *
 * Returns the key as its own class name, so a test can assert on `styles.someClass` by the name the
 * source uses rather than on the hash the build would have produced.
 *
 * Kept although nothing uses it yet: a component cannot be rendered in a test without it, and not
 * being able to render one is what made an inline-editing feature impossible to diagnose - the logic
 * tests all passed while the table showed nothing.
 */
module.exports = new Proxy({}, {get: (target, key) => (key === '__esModule' ? false : String(key))});
