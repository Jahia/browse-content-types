/**
 * How a path reads in a table that is already about one site.
 *
 * Every row listed here is a record of one content type within one site - that is what the accordion
 * is - so `/sites/luxe/` at the front of every value in the column says the same thing on every row
 * and tells the reader nothing. Worse, it costs the column its width: the part that actually
 * distinguishes two rows is the tail, and the tail is what gets pushed out of a bounded cell.
 */

/**
 * The path as it reads inside its own site.
 *
 * Returned unchanged when it is not under the site at all, rather than guessed at. A record can only
 * reach this table from within the site, so that case should not arise - but a path that does not
 * match is a path this rule knows nothing about, and shortening it on a hunch would be worse than
 * leaving it alone.
 *
 * The site node itself answers `/`: it has no path within itself, and an empty cell would read as a
 * missing value rather than as the root.
 */
export const siteRelativePath = (path, site) => {
    if (!path || !site) {
        return path || '';
    }

    const prefix = `/sites/${site}`;

    if (path === prefix) {
        return '/';
    }

    return path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : path;
};
