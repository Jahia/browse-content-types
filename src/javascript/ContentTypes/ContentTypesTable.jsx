import React, {useEffect, useMemo, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import {useQuery} from '@apollo/client';
import {shallowEqual, useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {Chip, DataTable, Loader, Lock, Pagination, Thumbnail, Typography} from '@jahia/moonstone';
import {ContextualMenu, DisplayAction, registry} from '@jahia/ui-extender';
import {ButtonRendererNoLabel} from '@jahia/jcontent';
import {buildListingQuery, buildSearchQuery} from './ContentTypesRecordQuery';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

const DEFAULT_ITEMS_PER_PAGE = 25;
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

/** Nothing is searched for until the fourth character, so short terms cost no query. */
const MIN_SEARCH_LENGTH = 4;

/** Pause after the last keystroke before searching, so a typed word is one query, not several. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The Name column, which is a fixed width that scrolls rather than a cut that has to be guessed.
 *
 * Every other text column has held its content in a bounded cell and let it scroll on hover; Name was
 * the exception, cut short with an ellipsis so the only way to read a long one was the tooltip. It is
 * bounded the same way now, and the width no longer follows the data - a column that sized itself to
 * whatever the longest name happened to be is what made it too wide in the first place.
 *
 * The cut that remains is a backstop, not a display choice. A rich text record's display name is its
 * entire body, and putting a few thousand characters into every row so that they can in principle be
 * scrolled past is a cost with nothing to show for it. 300 is far past anything worth scrolling and
 * well short of an article.
 */
const NAME_COLUMN_WIDTH = '220px';
const MAX_NAME_LENGTH = 300;

/**
 * The name this table's refetch is registered under.
 *
 * jContent's actions end by refetching everything registered as a `refetcher`, which is how its own
 * list view comes back up to date after a publish or a delete. Joining that sweep is what makes the
 * selection bar's actions refresh these rows. The name has to be this module's own: jContent
 * registers its content list as `CONTENT_DATA`, and reusing that would replace its entry rather
 * than add to it.
 */
const REFETCHER = 'contentTypesTable';

/**
 * The backstop on a name's length, cut on a word boundary where there is one near the end, as
 * jContent does. Only the Name column needs it, and only against a rich text record whose display
 * name is its entire body; the full text stays in the cell's title either way.
 */
const ellipsize = text => {
    if (!text || text.length <= MAX_NAME_LENGTH) {
        return text;
    }

    const cut = text.slice(0, MAX_NAME_LENGTH);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > MAX_NAME_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

/**
 * Publication status to the chip that shows it.
 *
 * Only the three states asked for are named. Anything else - unpublished, marked for deletion,
 * a conflict - keeps its own status text in a neutral chip rather than being folded into one of
 * the three, which would state something untrue about the record.
 */
const PUBLICATION_CHIPS = {
    PUBLISHED: {labelKey: 'label.publication.published', color: 'success'},
    MODIFIED: {labelKey: 'label.publication.modified', color: 'warning'},
    NOT_PUBLISHED: {labelKey: 'label.publication.notPublished', color: 'default'}
};

const humanise = status => status.toLowerCase().replace(/_/g, ' ');

const renderDate = (value, dateFormat) => (value ? dateFormat.format(new Date(value)) : '-');

/** A list of values as one cell, or a dash where there are none to show. */
const joinOrDash = values => (values?.length > 0 ? values.filter(Boolean).join(', ') || '-' : '-');

/**
 * A boolean as a coloured token rather than a word, so that a column of them is read by colour
 * instead of one cell at a time. The same kind of chip the publication column uses, so the two read
 * as the same sort of thing rather than as two inventions.
 *
 * Anything that is not the string "true" is false, which is what a boolean property means: it holds
 * one or the other. A property never set at all does not reach here - it shows the dash every unset
 * field shows, rather than being reported as false, which would state something the repository does
 * not actually say.
 */
const renderBoolean = (value, t, key) => {
    const isTrue = value === 'true';
    return (
        <Chip
            key={key}
            color={isTrue ? 'success' : 'danger'}
            label={isTrue ? t('label.boolean.true') : t('label.boolean.false')}
            data-sel-boolean={isTrue}
        />
    );
};

/**
 * Whether a record is locked, and by whom.
 *
 * Two fields answer two different questions, and both matter. `details` is the list of locks a node
 * carries - who holds each and of what kind - and is empty when there are none.
 * `lockedAndCannotBeEdited` is whether a lock actually stands in the way of editing, which it does
 * not when the lock is the reader's own. So a record locked by someone else reads as a warning, and
 * one an editor holds themselves reads as a plain statement of fact.
 *
 * The owner names carry the tooltip rather than the label, since a lock type ("engine",
 * "validation") explains a lock an editor cannot simply take back.
 */
const renderLock = (data, t) => {
    const details = data.lockInfo?.details || [];
    if (details.length === 0 && !data.lockedAndCannotBeEdited) {
        return '-';
    }

    // One lock per language is normal, so the same person appears more than once.
    const owners = [...new Set(details.map(detail => detail.owner).filter(Boolean))];
    const types = [...new Set(details.map(detail => detail.type).filter(Boolean))];
    const blocked = Boolean(data.lockedAndCannotBeEdited);

    return (
        <span title={types.length > 0 ? types.join(', ') : undefined}>
            <Chip
                icon={<Lock/>}
                color={blocked ? 'warning' : 'default'}
                label={owners.length > 0 ? owners.join(', ') : t('label.lock.locked')}
                data-sel-lock={blocked ? 'blocked' : 'locked'}
            />
        </span>
    );
};

/**
 * How each field common to every node reads its value off the row, keyed by the same field.key
 * used everywhere else - the picker, the hook's catalog, and ContentTypesRecordQuery's aliases.
 * A few (path, systemName, id) were already being fetched for other reasons, so they need no
 * property alias of their own; the rest read the alias ContentTypesRecordQuery adds for them.
 */
const COMMON_RENDERERS = {
    type: data => data.primaryNodeType?.displayName || data.primaryNodeType?.name || '-',
    createdBy: data => data.createdBy?.value || '-',
    createdDate: (data, {dateFormat}) => renderDate(data.createdDate?.value, dateFormat),
    lastModified: (data, {dateFormat}) => renderDate(data.lastModified?.value, dateFormat),
    lastModifiedBy: data => data.lastModifiedBy?.value || '-',
    publicationStatus: (data, {t}) => {
        const status = data.aggregatedPublicationInfo?.publicationStatus;
        if (!status) {
            return null;
        }

        const chip = PUBLICATION_CHIPS[status];
        return (
            <Chip color={chip ? chip.color : 'default'}
                  label={chip ? t(chip.labelKey) : humanise(status)}
                  data-sel-publication-status={status}
            />
        );
    },
    publishedOn: (data, {dateFormat}) => renderDate(data.publishedOn?.value, dateFormat),
    publishedBy: data => data.publishedBy?.value || '-',
    // Joined the same way a multi-valued content type field is, so a list reads the same wherever it
    // came from. A node without the mixin has no property at all and shows the same dash as one that
    // has it and was left empty - the distinction is not one an editor of this table can act on.
    tags: data => joinOrDash(data.tags?.values),
    categories: data => joinOrDash(data.categories?.refNodes?.map(node => node.displayName)),
    lock: (data, {t}) => renderLock(data, t),
    path: data => data.path,
    systemName: data => data.name,
    id: data => data.uuid
};

/** How many referenced images a cell draws before it stops and counts the rest. */
const MAX_THUMBNAILS = 3;

/**
 * How wide a column gets when its values are short by nature.
 *
 * Measured in `ch`, the width of a digit in whatever font the table is drawn in, so this is literally
 * room for twelve characters rather than a guess in pixels that stops being right if the font
 * changes; plus the padding a Moonstone cell puts either side of its content.
 *
 * These columns keep `isScrollable`, so a value that does run longer can still be read by hovering
 * it - the narrow width is what the column asks for, not a promise about the content.
 */
const NARROW_COLUMN_WIDTH = 'calc(12ch + 32px)';

/** The width a content type's own field gets when nothing more specific is known about it. */
const DEFAULT_COLUMN_WIDTH = '220px';

/** A figure needing twelve characters is already an unusual figure. */
const NUMERIC_TYPES = new Set(['LONG', 'DOUBLE', 'DECIMAL']);

/**
 * Properties holding a country code.
 *
 * Matched on the property's name, because being a code is not something the definition records: on
 * this site `country` holds two-letter ISO codes, and its type says only `STRING`. Deliberately a
 * short list of names rather than a loose pattern - `state` sits beside it on the same type and holds
 * place names up to 25 characters long, so anything vaguer would squeeze columns that need the room.
 *
 * The cost of the approach is that a site naming the field something else gets the default width; the
 * list is the place to add it.
 */
const CODE_PROPERTIES = new Set([
    'country',
    'countrycode',
    'country_code',
    'countryiso',
    'isocountrycode'
]);

/**
 * The width to ask for a content type's own field.
 *
 * A field can hold anything up to a full rich text body, so the default is generous and scrollable.
 * What this narrows are the two kinds that are reliably short, where a wide column is empty space
 * that pushes everything worth reading further right.
 */
const columnWidthFor = field => {
    if (NUMERIC_TYPES.has(field.requiredType)) {
        return NARROW_COLUMN_WIDTH;
    }

    return CODE_PROPERTIES.has(field.propertyName?.toLowerCase()) ?
        NARROW_COLUMN_WIDTH :
        DEFAULT_COLUMN_WIDTH;
};

/**
 * A value a browser can be sent to, or null.
 *
 * Decided on the value, not on the property's declared type. JCR has a URI type, but no definition
 * Jahia ships uses it - a link's address is a plain string, `j:url` on jnt:externalLink included -
 * so keying off the type would recognise nothing on a real site.
 *
 * The two schemes are an allowlist rather than a blocklist, and that is the point: content is
 * written by people, and a `javascript:` or `data:` value turned into an anchor by a table would be
 * a way of getting a script to run from something someone typed into a field.
 */
const LINK_VALUE = /^(?:https?:\/\/|mailto:)\S+$/i;

const linkHref = value => (typeof value === 'string' && LINK_VALUE.test(value) ? value : null);

/**
 * One address as an anchor.
 *
 * Opens in a new tab with `rel="noopener noreferrer"`, which is what jContent uses on the anchors it
 * has. The click is stopped from travelling any further because a click anywhere on a row toggles
 * that row's checkbox - following a link would otherwise select the row on the way out.
 */
const renderLink = (href, text) => (
    <a
        className={styles.link}
        href={href}
        title={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={event => event.stopPropagation()}
    >
        {text}
    </a>
);

/**
 * A list where each entry is an anchor if it has an address and plain text if it does not, so a
 * field holding a mix of the two still reads as one list rather than two.
 */
const renderLinkList = items => (
    <span className={styles.linkList}>
        {items.map((item, index) => (
            <React.Fragment key={item.key}>
                {index > 0 && ', '}
                {item.href ? renderLink(item.href, item.text) : item.text}
            </React.Fragment>
        ))}
    </span>
);

/**
 * The preview address for a referenced node, or null if it has none.
 *
 * Built here rather than taken from the server. `thumbnailUrl` answers with a bare `?t=thumbnail`,
 * which a browser is entitled to keep serving from its cache after the image behind it changes -
 * so re-cropping a picture would leave the old one on screen. Stamping the node's own last-modified
 * date into the address is how jContent's media grid and its preview both avoid that, and it costs
 * nothing here because the date arrives with the reference.
 */
const thumbnailFor = node => {
    if (!node?.path) {
        return null;
    }

    const isWebp = node.content?.mimeType?.value === 'image/webp';
    if (!node.hasThumbnail && !isWebp) {
        return null;
    }

    // Every character escaped except the separators, so a file whose name has a space or an accent
    // in it still resolves. Same expression jContent builds its own file URLs with.
    const path = node.path.replace(/[^/]/g, encodeURIComponent);
    const contextPath = window.contextJsParameters?.contextPath || '';
    const stamp = node.lastModified?.value ? `lastModified=${encodeURIComponent(node.lastModified.value)}` : '';
    // WebP has no rendition to ask for, so the original file stands in as its own preview.
    const query = [stamp, isWebp ? '' : 't=thumbnail'].filter(Boolean).join('&');

    return `${contextPath}/files/default${path}${query ? `?${query}` : ''}`;
};

/**
 * Referenced nodes drawn as what they point at.
 *
 * Only used when at least one of them has a preview: a reference to ordinary content has none, and a
 * row of grey placeholders would say less than the names do. One that has no preview of its own
 * still keeps its place, so the count stays honest, and Moonstone draws it as its own grey fallback.
 *
 * A single reference gets its name beside the image - that is the usual case, one picture on a piece
 * of content, and there is room for it. Several would not fit, so those rely on the tooltip.
 */
const renderThumbnails = previews => {
    const shown = previews.slice(0, MAX_THUMBNAILS);
    const hidden = previews.length - shown.length;
    const soleName = previews.length === 1 ? previews[0].node.displayName : null;

    return (
        <span className={styles.referenceCell}>
            {shown.map(({node, url}) => (
                <span key={node.uuid || node.path} className={styles.referenceThumb} title={node.displayName}>
                    <Thumbnail
                        size="small"
                        variant="preview"
                        src={url || undefined}
                        alt={node.displayName}
                        imgProps={{loading: 'lazy'}}
                    />
                </span>
            ))}
            {soleName && <span className={styles.referenceName}>{soleName}</span>}
            {hidden > 0 && <span className={styles.referenceMore}>{`+${hidden}`}</span>}
        </span>
    );
};

/**
 * How a content type's own field reads its value off the row, in the order the cases are tried.
 *
 * A reference resolves through `refNode`/`refNodes` to what it points at rather than showing a raw
 * uuid: as a thumbnail where that is an image, as a link where it is a link, and as a display name
 * otherwise. A value that is itself an address becomes a link too, a boolean becomes a coloured
 * chip, and a date is read the same way the created and modified dates are. Failing all of that, a
 * multi-valued property joins its values and everything else falls back to the plain value string.
 *
 * Only external links are addresses here. An internal one - jnt:nodeLink, or the jmix:internalLink
 * mixin - holds a reference rather than a URL, and turning that into something to open means asking
 * its target for a `renderUrl` and being ready for null, since such a link is allowed to point at a
 * folder that has no page of its own. Those keep showing their title as text.
 */
const renderDynamicField = (field, payload, {t, dateFormat}) => {
    if (!payload) {
        return '-';
    }

    const referenced = field.multiple ? payload.refNodes : (payload.refNode && [payload.refNode]);
    const previews = (referenced || []).map(node => ({node, url: thumbnailFor(node)}));

    if (previews.some(preview => preview.url)) {
        return renderThumbnails(previews);
    }

    // A reference to a link reads as the link itself: the title an editor gave it, pointing where it
    // points, with the address in the tooltip since a title says nothing about where it leads.
    if (previews.some(({node}) => linkHref(node.linkUrl?.value))) {
        return renderLinkList(previews.map(({node}) => {
            const href = linkHref(node.linkUrl?.value);
            return {
                key: node.uuid || node.path,
                href,
                text: node.displayName || href || '-'
            };
        }));
    }

    if (field.multiple) {
        if (previews.length > 0) {
            return renderLinkList(previews.map(({node}) => ({
                key: node.uuid || node.path,
                text: node.displayName
            })));
        }

        const values = payload.values || [];
        if (values.length === 0) {
            return '-';
        }

        // Checked here as well as below, because a multi-valued property never reaches the single
        // value cases: without this a multi-valued boolean or date would be the one of its kind in
        // the table still shown as the raw string it is stored as.
        if (field.requiredType === 'BOOLEAN') {
            return (
                <span className={styles.chipList}>
                    {values.map((value, index) => renderBoolean(value, t, index))}
                </span>
            );
        }

        if (field.requiredType === 'DATE') {
            return joinOrDash(values.map(value => renderDate(value, dateFormat)));
        }

        // The same treatment a single value gets, so a field holding several addresses is no less
        // usable than one holding a single address.
        return renderLinkList(values.map((value, index) => ({
            key: index,
            href: linkHref(value),
            text: value
        })));
    }

    if (payload.refNode) {
        return payload.refNode.displayName || '-';
    }

    if (payload.value === null || payload.value === undefined) {
        return '-';
    }

    if (field.requiredType === 'BOOLEAN') {
        return renderBoolean(payload.value, t);
    }

    // Read the same way as the created and modified dates above. Without this a content type's own
    // date field was the one date in the table left as the timestamp the repository stores it as,
    // hour, seconds, timezone offset and all.
    if (field.requiredType === 'DATE') {
        return renderDate(payload.value, dateFormat);
    }

    // A property holding an address becomes one, which is what makes browsing a link type - where
    // the address is the content - useful rather than something to copy out by hand. The whole
    // address is shown, since the cell scrolls on hover and it also carries the tooltip; a URL cut
    // short is one nobody can read or copy.
    const href = linkHref(payload.value);
    if (href) {
        return renderLink(href, href);
    }

    return payload.value;
};

const toRow = node => ({...node, displayName: node.displayName || node.name});

/**
 * Characters the full text parser reads as syntax. Left in a term they change the query, and a
 * stray quote makes it invalid outright: the server answers with a RepositoryException rather
 * than an empty result.
 */
const FULLTEXT_OPERATORS = /["'()[\]^~?:\\*%]/g;

/** Words the parser reads as operators rather than as something to look for. */
const BOOLEAN_WORDS = new Set(['and', 'or', 'not']);

const sanitiseTokens = term => term
    .split(/\s+/)
    .map(token => token.replace(FULLTEXT_OPERATORS, '').replace(/^-+/, ''))
    .filter(token => token.length > 0 && !BOOLEAN_WORDS.has(token.toLowerCase()));

/**
 * Each word matched two ways at once, as `(word OR word*)`.
 *
 * The index stores analysed, stemmed words, so a bare term matches whole words and their
 * variants: "visits" finds "visit". A wildcard term skips the analyser and matches the raw
 * indexed form, so it finds prefixes but loses stemming: "visits*" finds nothing, while "visi*"
 * finds "visit". Neither alone is enough, and asking for both is why typing part of a word works
 * without breaking the whole words that already did.
 */
const toFullTextExpression = tokens => tokens.map(token => `(${token} OR ${token}*)`).join(' ');

/**
 * Holds back the term until typing pauses and it is long enough to be worth a query, then turns
 * it into the two forms the query needs. `isSearching` false is what sends the table back to the
 * full listing, so a term that is only punctuation searches for nothing rather than erroring.
 */
const useSearchTerm = search => {
    const [debounced, setDebounced] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [search]);

    return useMemo(() => {
        const tokens = sanitiseTokens(debounced);
        const cleaned = tokens.join(' ');

        if (cleaned.length < MIN_SEARCH_LENGTH) {
            return {isSearching: false, terms: '', nameTerms: '', typed: ''};
        }

        return {
            isSearching: true,
            terms: toFullTextExpression(tokens),
            // The node name arm is a LIKE, not a full text match, so it takes the plain words.
            nameTerms: `%${cleaned.toLowerCase()}%`,
            typed: cleaned
        };
    }, [debounced]);
};

export const ContentTypesTable = ({contentType, search, visibleFields, selection, onSelectionChange}) => {
    const {t} = useTranslation(NAMESPACE);
    const {site, language, uilang} = useSelector(state => ({
        site: state.site,
        language: state.language,
        uilang: state.uilang
    }), shallowEqual);

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
    const [sortBy, setSortBy] = useState('displayName');
    const [sortDirection, setSortDirection] = useState('ascending');

    const {isSearching, terms, nameTerms, typed} = useSearchTerm(search);

    // Page numbers do not carry across types, and no more across a change of search: page 4 of one
    // result set is very likely past the end of the next, which would show an empty table for a
    // type that has content.
    useEffect(() => {
        setCurrentPage(1);
    }, [contentType, terms]);

    // The selection only ever holds rows that are on screen.
    //
    // The bar reads the selected rows themselves to decide which publish action applies, so a row
    // belonging to a page that is no longer fetched would be offered up with nothing left to check
    // it against - and a selection that survives out of sight is one an editor cannot see to
    // undo. jContent clears its own selection on each of these same events, from its reducer.
    //
    // The list is every variable the row query is issued with: whatever changes the result set has
    // to invalidate the selection taken from the previous one. `site` earns its place even though
    // switching site also changes the type, and so would clear this anyway - it does so through
    // jContent resetting its own path, which is a thing happening elsewhere rather than a guarantee
    // this table is entitled to.
    useEffect(() => {
        onSelectionChange([]);
    }, [site, contentType, terms, currentPage, itemsPerPage, sortBy, sortDirection, onSelectionChange]);

    // Reset the sort whenever the chosen column disappears - hiding a column that the table was
    // sorted by would otherwise keep silently requesting a sort the picker no longer offers.
    useEffect(() => {
        if (sortBy !== 'displayName' && !visibleFields.some(field => field.key === sortBy)) {
            setSortBy('displayName');
            setSortDirection('ascending');
        }
    }, [visibleFields, sortBy]);

    const dynamicFields = useMemo(() => visibleFields.filter(field => field.isDynamic), [visibleFields]);

    // Rebuilt only when the set of content-type-specific columns actually shown changes - not on
    // every render, and not when a common field becomes visible, since those are always fetched.
    const dynamicFieldsKey = dynamicFields.map(field => field.key).join(',');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const listingQuery = useMemo(() => buildListingQuery(dynamicFields), [dynamicFieldsKey]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const searchQuery = useMemo(() => buildSearchQuery(dynamicFields), [dynamicFieldsKey]);

    /**
     * The sort, as one of the two things the query can be asked for - never both.
     *
     * `ordering` is the repository's own sort on a named property, so it compares a number as a
     * number and a date as a date. Every plain value goes through it, which is what makes a numeric
     * column sortable: `fieldSorter` compares the text a field returned, and put prices in the order
     * 1, 11, 12, 2.
     *
     * `fieldSorter` is still what serves the two things that are not a stored property: the Name
     * column, whose displayName is computed, and a reference, which has to be ordered by the name of
     * what it points at rather than by the uuid it stores.
     */
    const {ordering, fieldSorter} = useMemo(() => {
        const direction = sortDirection === 'descending' ? 'DESC' : 'ASC';
        const field = sortBy === 'displayName' ? null : visibleFields.find(candidate => candidate.key === sortBy);

        if (field?.sortJcrProperty) {
            return {
                ordering: {property: field.sortJcrProperty, orderType: direction},
                fieldSorter: null
            };
        }

        return {
            ordering: null,
            fieldSorter: {
                fieldName: field?.sortProperty || 'displayName',
                sortType: direction,
                ignoreCase: true
            }
        };
    }, [sortBy, sortDirection, visibleFields]);

    const common = {
        sitePath: `/sites/${site}`,
        type: contentType,
        language,
        offset: (currentPage - 1) * itemsPerPage,
        limit: itemsPerPage,
        fieldSorter,
        ordering
    };

    const ready = Boolean(site) && Boolean(contentType);

    const listing = useQuery(listingQuery, {
        variables: common,
        skip: !ready || isSearching
    });

    const found = useQuery(searchQuery, {
        variables: {
            ...common,
            terms,
            // LOWER_CASE lowercases the column server-side, so an upper-case pattern would never
            // match. jContent lowercases the pattern here for the same reason.
            nameTerms
        },
        skip: !ready || !isSearching
    });

    const {data, loading, error, previousData} = isSearching ? found : listing;

    // Re-registered on every render, with no dependency list, which is how jContent registers its
    // own: whichever of the two queries is the live one changes with the search, and the entry has
    // to be the one that is actually running or an action's refresh reaches a query that is skipped.
    useEffect(() => {
        registry.addOrReplace('refetcher', REFETCHER, {refetch: isSearching ? found.refetch : listing.refetch});

        return () => {
            // Taken out rather than emptied, so a refetch sweep after this table has gone does not
            // have a dead entry to walk. jContent's own `unsetRefetcher` deletes the registry's
            // backing key directly, but `remove` is public API and does the same thing.
            registry.remove('refetcher', REFETCHER);
        };
    });

    const dateFormat = useMemo(
        // The day, without the time of day. A listing is read by scanning a column, and a time
        // nobody asked for costs width in every row while telling apart two things changed the same
        // afternoon - which is not what this table is for. It takes nothing away from sorting: that
        // happens on the server against the stored property, which keeps its full precision whatever
        // is drawn here, so two rows from the same day still come back in the right order.
        () => new Intl.DateTimeFormat(uilang || language || undefined, {dateStyle: 'medium'}),
        [uilang, language]
    );

    const renderContext = useMemo(() => ({t, dateFormat}), [t, dateFormat]);

    // The table is told which rows are ticked in the terms it keys them by; the selection is kept
    // as the rows themselves for the benefit of the bar above, which needs more than their paths.
    const selectedPaths = useMemo(() => selection.map(node => node.path), [selection]);
    // Whether anything is selected, rather than how much: the columns depend only on that, so
    // ticking a second row must not rebuild them.
    const hasSelection = selection.length > 0;

    /*
     * The right-click menus, and why there are three of them.
     *
     * A ContextualMenu draws nothing at all: it renders null and only takes hold of its action's
     * click handler, which is then called with the position of the event. So these cost nothing until
     * one is opened, and it makes no difference where in the table they sit.
     *
     * One each because `actionKey` has to be a prop - it decides which action's handler gets captured
     * when the menu renders, so it cannot be chosen at the moment of opening the way the row context
     * can. jContent picks between the same three keys for the same reasons.
     */
    const rowMenu = useRef();
    const selectionMenu = useRef();
    const unselectedRowMenu = useRef();

    const openContextMenu = (event, row) => {
        const isSelected = selectedPaths.includes(row.path);

        // The same distinction the selection bar draws: a row acted on by itself is given its path,
        // a row that is part of the selection hands over the whole selection instead.
        const context = {
            currentPath: row.path,
            path: isSelected ? null : row.path,
            paths: isSelected ? selectedPaths : null,
            node: row
        };

        event.stopPropagation();

        if (!hasSelection) {
            // Nothing selected: the same menu as the row's own three dots.
            rowMenu.current?.(event, context);
        } else if (isSelected) {
            // Part of the selection: what can be done to all of it.
            selectionMenu.current?.(event, context);
        } else {
            // A selection exists but not this row, so the only thing on offer is adding it to one.
            unselectedRowMenu.current?.(event, context);
        }
    };

    /**
     * A column heading, as an element rather than the bare string a column label usually is.
     *
     * That is what lets it be narrowed: as a string it is an anonymous flex item that will not shrink
     * below its own width, and a long one pushed the sort arrow out of the cell. The full text stays
     * on hover, the way a truncated name does.
     */
    const headerLabel = label => (
        <span className={styles.headerLabel} title={label}>{label}</span>
    );

    const columns = useMemo(() => {
        // A content type's own field can hold anything up to a full rich text body, so it is bounded
        // and scrollable rather than growing the column to fit whatever the longest value happens to
        // be, or wrapping every row to several lines. How wide that bound is depends on what the
        // field holds - see columnWidthFor. `path` is bounded for the same reason: unbounded, a
        // deeply nested site pushes every column after it off screen.
        const fieldColumns = visibleFields.map(field => (field.isDynamic ? {
            key: field.key,
            label: headerLabel(field.label),
            // Sortable if the hook found either way of ordering it. What is left without an arrow is
            // a multi-valued property, which has no single value to order a row by.
            isSortable: Boolean(field.sortJcrProperty || field.sortProperty),
            width: columnWidthFor(field),
            isScrollable: true,
            render: ({value}) => renderDynamicField(field, value, renderContext)
        } : {
            key: field.key,
            label: headerLabel(field.label),
            isSortable: Boolean(field.sortProperty),
            width: '160px',
            isScrollable: field.key === 'path',
            render: ({data: row}) => COMMON_RENDERERS[field.key](row, renderContext)
        }));

        return [
            {
                key: 'displayName',
                label: headerLabel(t('label.table.name')),
                isSortable: true,
                width: NAME_COLUMN_WIDTH,
                // Bounded and scrollable, the way every other text column already was. The whole
                // name is in the cell, so hovering it scrolls through the part that does not fit;
                // the tooltip stays as the quicker way to read it.
                isScrollable: true,
                render: ({value}) => <span title={value}>{ellipsize(value)}</span>
            },
            ...fieldColumns,
            {
                // Renders jContent's own row menu rather than a copy of it: the same registered
                // action its list view uses, so the entries and their behaviour stay in step for
                // free. It hides while a selection is active, as the list view does, because what
                // applies then is a bulk action on the selection, not an action on one row.
                key: 'actions',
                label: '',
                width: '60px',
                // Without this, clicking the menu also toggles the row's checkbox.
                cellProps: {onClick: event => event.stopPropagation()},
                render: ({data: row}) => (hasSelection ? null : (
                    <DisplayAction
                        actionKey="contentItemActionsMenu"
                        path={row.path}
                        render={ButtonRendererNoLabel}
                        buttonProps={{variant: 'ghost', size: 'big'}}
                    />
                ))
            }
        ];
    }, [visibleFields, t, renderContext, hasSelection]);

    // Falling back to previousData keeps the table on screen while a page or sort change is in
    // flight, instead of collapsing to a loader and back on every click.
    const current = data || previousData;
    // Both queries are the same criteria query with and without a search constraint, so they answer
    // in the same place; past here nothing cares which one ran.
    const connection = current?.jcr?.nodesByCriteria;
    const rows = useMemo(() => (connection?.nodes || []).map(toRow), [connection]);
    const totalItems = connection?.pageInfo?.totalCount || 0;

    // What a bulk action deleted is gone from the rows the refetch brings back, but would otherwise
    // still be selected - and the bar would still be offering to act on it. Dropping whatever the
    // rows no longer contain is how jContent keeps its own selection honest after each load.
    useEffect(() => {
        const live = selection.filter(node => rows.some(row => row.path === node.path));
        if (live.length !== selection.length) {
            onSelectionChange(live);
        }
    }, [rows, selection, onSelectionChange]);

    if (loading && !current) {
        return <Loader size="big" classNameWrapper={styles.centered}/>;
    }

    if (error) {
        return (
            <Typography className={styles.message} variant="body" data-sel-role="content-error">
                {t('label.contentError')}
            </Typography>
        );
    }

    if (totalItems === 0) {
        return (
            <Typography className={styles.message} variant="body" data-sel-role="content-empty">
                {isSearching ? t('label.noSearchResults', {terms: typed}) : t('label.noContent')}
            </Typography>
        );
    }

    return (
        <div className={styles.tableArea}>
            {/*
                The table's own rows scroll in here; pagination sits outside this box, in its own
                reserved space below, the way jContent's own content list does - a Table plus a
                separate TablePagination sibling, not one component owning both. DataTable's
                bundled pagination has no scroll boundary of its own to anchor to inside a page
                that can grow taller than the viewport, and ended up drawn over the last rows
                instead of pinned below them.
            */}
            <div className={styles.tableScroll}>
                <DataTable
                    enableSorting
                    enableSelection
                    enablePagination={false}
                    className={styles.table}
                    data={rows}
                    columns={columns}
                    // Keyed by path rather than by uuid because the path is what the selection is
                    // for: it is the one thing every action in the bar is given, so keying the
                    // table the same way means what comes back from the checkboxes needs no
                    // translation before it can be acted on.
                    primaryKey="path"
                    selection={selectedPaths}
                    sortBy={sortBy}
                    sortDirection={sortDirection}
                    data-sel-role="content-types-table"
                    rowProps={({data: row}) => ({
                        'data-sel-role': 'content-row',
                        'data-sel-path': row.path,
                        onContextMenu: event => openContextMenu(event, row)
                    })}
                    // The checkboxes deal in paths; the bar above needs the rows themselves, for
                    // their display names and for the two node type flags behind the publish
                    // choice. Resolving them here, against the rows on screen, is what lets the
                    // rest of the module hold the selection as content rather than as identifiers.
                    onChangeSelection={paths => onSelectionChange(rows.filter(row => paths.includes(row.path)))}
                    onSortChange={(by, direction) => {
                        setSortBy(by);
                        setSortDirection(direction);
                        setCurrentPage(1);
                    }}
                />
            </div>
            <Pagination
                className={styles.tablePagination}
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                itemsPerPageOptions={ITEMS_PER_PAGE_OPTIONS}
                totalOfItems={totalItems}
                data-sel-role="content-types-pagination"
                onPageChange={setCurrentPage}
                onItemsPerPageChange={size => {
                    setItemsPerPage(size);
                    setCurrentPage(1);
                }}
            />

            {/* These draw nothing until a row is right-clicked - see openContextMenu above - so they
                sit here rather than inside a row, which a Moonstone table gives no way to reach. */}
            <ContextualMenu setOpenRef={rowMenu} actionKey="contentItemContextActionsMenu"/>
            <ContextualMenu setOpenRef={selectionMenu} actionKey="selectedContentMenu"/>
            <ContextualMenu setOpenRef={unselectedRowMenu} actionKey="notSelectedContentMenu"/>
        </div>
    );
};

ContentTypesTable.propTypes = {
    contentType: PropTypes.string.isRequired,
    search: PropTypes.string,
    visibleFields: PropTypes.array,
    /** The ticked rows, held above so the toolbar can act on them. Whole rows rather than paths,
     *  because the bar names them and reads their node type flags. */
    selection: PropTypes.array.isRequired,
    onSelectionChange: PropTypes.func.isRequired
};

ContentTypesTable.defaultProps = {
    search: '',
    visibleFields: []
};

export default ContentTypesTable;
