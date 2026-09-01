import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import PropTypes from 'prop-types';
import {useQuery} from '@apollo/client';
import {shallowEqual, useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {Button, Chip, DataTable, Loader, Lock, Menu, Pagination, SortIndicator, Thumbnail, Typography} from '@jahia/moonstone';
import {ContextualMenu, DisplayAction, registry} from '@jahia/ui-extender';
import {ButtonRendererNoLabel} from '@jahia/jcontent';
import {buildRecordQuery} from './ContentTypesRecordQuery';
import {filterFor, toNodeConstraint} from './ContentTypesFilters';
import {ContentTypesFilterOverlay} from './ContentTypesFilterOverlay';
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

/**
 * A column's sort control: the arrow in its header, and only the arrow.
 *
 * Moonstone sorts from the whole header cell, which put sorting and filtering behind one click -
 * opening a column's funnel re-sorted the table on the way in. Confining that to the arrow with
 * `pointer-events` did not work either: the rule matched `[class*='sort']`, and the indicator's base
 * class is `moonstone-SortIndicator`, so only `-sorted` ever matched. The arrow of a column that was
 * not already sorted took no clicks at all, which left no way to sort by a different column.
 *
 * So the sort is ours: the column carries no `isSortable`, the table is given no `onSortChange`, and
 * this button is the only thing that reorders anything. Two buttons, two meanings, and the arrow is
 * reachable from the keyboard - which a sort living on a non-focusable `th` never was.
 */
const ColumnSortControl = ({label, isSorted, direction, onToggle}) => (
    <Button
        variant="ghost"
        size="small"
        icon={<SortIndicator isSorted={isSorted} direction={direction}/>}
        aria-label={label}
        title={label}
        className={styles.headerSort}
        data-sel-role={isSorted ? 'column-sort-active' : 'column-sort'}
        onClick={onToggle}
    />
);

ColumnSortControl.propTypes = {
    label: PropTypes.string.isRequired,
    isSorted: PropTypes.bool,
    direction: PropTypes.oneOf(['ascending', 'descending']),
    onToggle: PropTypes.func.isRequired
};

/**
 * A column's heading, which is also the way to filter it.
 *
 * The funnel that used to sit beside it cost width in every filterable header, and a header has
 * little to spare - the label was already the first thing to be truncated. So the label is the
 * control. Nothing is lost by that now: sorting moved to its own arrow, so a click on the heading
 * has only one meaning, which was the objection to making it clickable in the first place.
 *
 * A real button rather than a span with a handler, so the heading is reachable by keyboard and
 * announces that it opens something. It carries no button chrome - see .headerLabelFilterable, which
 * strips it back to text and keeps the truncation the plain heading has.
 *
 * A column with a condition on it is coloured rather than badged, which says the whole of what the
 * funnel's active state used to say and costs no width at all.
 */
const FilterableColumnLabel = ({field, filter, label, title, onApply, onClear}) => {
    const anchor = useRef();
    const [isOpen, setOpen] = useState(false);

    const classes = [styles.headerLabel, styles.headerLabelFilterable];
    if (filter) {
        classes.push(styles.headerLabelFiltered);
    }

    return (
        <>
            <button
                ref={anchor}
                type="button"
                className={classes.join(' ')}
                title={title}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                // Says whether a condition is in force, for the tests and for anything reading the
                // header without seeing its colour.
                data-sel-role={filter ? 'column-filter-active' : 'column-filter'}
                onClick={() => setOpen(open => !open)}
            >
                {label}
            </button>
            <Menu
                hasSearch={false}
                isDisplayed={isOpen}
                anchorEl={anchor}
                onClose={() => setOpen(false)}
            >
                <ContentTypesFilterOverlay
                    field={field}
                    filter={filter}
                    onApply={onApply}
                    onClear={onClear}
                    onClose={() => setOpen(false)}
                />
            </Menu>
        </>
    );
};

FilterableColumnLabel.propTypes = {
    field: PropTypes.object.isRequired,
    filter: PropTypes.object,
    label: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    onApply: PropTypes.func.isRequired,
    onClear: PropTypes.func.isRequired
};

/**
 * The day in the cell, the moment in the tooltip.
 *
 * A column is scanned, so the cell carries only what tells one row from another - and the time of day
 * cost width in every row to separate two things changed the same afternoon. Which is exactly when
 * the time does matter, so it is a hover away rather than gone: the tooltip spells the date out in
 * full, down to the minute.
 *
 * The `key` is taken as an argument rather than set at the call site because several dates can share
 * a cell, and a key written into JSX from a loop index is what the linter objects to.
 */
const renderDate = (value, {dateFormat, dateTimeFormat}, key) => {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    return <span key={key} title={dateTimeFormat.format(date)}>{dateFormat.format(date)}</span>;
};

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
 * A list of labels as one chip each, the way Content Editor draws a tag field.
 *
 * Content Editor gives every tag its own chip - a `Chip` per value in its MultipleInput, muted while
 * read only. The chip here is Moonstone's rather than the `@jahia/design-system-kit` one that field
 * still uses, since Moonstone is what this table already draws publication states and booleans with,
 * but it is the same idea: a tag is a thing in its own right, and a row of them reads as a set at a
 * glance where a joined string reads as a sentence.
 *
 * Neutral on purpose. Green, amber and red carry meaning in this table - a publication state, a
 * boolean - and a tag is not a status, so colouring one would say something that is not true.
 *
 * It also settles what the joined form could not: a tag containing a comma was indistinguishable
 * from two tags.
 */
const renderChipList = values => {
    // Deduplicated, which a set of labels should be anyway, and which lets the label itself be the
    // key rather than a position that changes meaning as the list does.
    const items = [...new Set((values || []).filter(Boolean))];
    if (items.length === 0) {
        return '-';
    }

    return (
        <span className={styles.chipList}>
            {items.map(value => (
                <Chip key={value} color="default" label={value} data-sel-tag={value}/>
            ))}
        </span>
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
    createdDate: (data, context) => renderDate(data.createdDate?.value, context),
    lastModified: (data, context) => renderDate(data.lastModified?.value, context),
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
    publishedOn: (data, context) => renderDate(data.publishedOn?.value, context),
    publishedBy: data => data.publishedBy?.value || '-',
    // Joined the same way a multi-valued content type field is, so a list reads the same wherever it
    // came from. A node without the mixin has no property at all and shows the same dash as one that
    // has it and was left empty - the distinction is not one an editor of this table can act on.
    tags: data => renderChipList(data.tags?.values),
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

/** What a field common to every node gets, none of them holding anything unbounded. */
const COMMON_COLUMN_WIDTH = '160px';

/**
 * The three common fields that do not hold one short value, and so are given a text column's width
 * and its hover-to-scroll: a path is as deep as the tree, and tags and categories are lists.
 */
const WIDE_COMMON_FIELDS = new Set(['path', 'tags', 'categories']);

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
/**
 * A stored value as the reader knows it.
 *
 * A constrained property keeps a code - `swimmingPool`, `house`, `AF` - while its label belongs to
 * the defining module's resource bundle. `valueLabels` carries what Content Editor shows for the
 * same field, in the same language, so a value reads the same in both places.
 *
 * Falls through to the value for anything not in the map: a property with no choicelist, and a code
 * that is stored but no longer offered by the definition, which would otherwise render as nothing.
 */
const labelFor = (field, value) => field.valueLabels?.[value] ?? value;

const renderDynamicField = (field, payload, context) => {
    const {t} = context;
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
            // Each date is its own element now, carrying its own tooltip, so they cannot be joined
            // into one string. The commas between them come from a rule instead - see .dateList,
            // which also explains why they are not written into the text.
            return (
                <span className={styles.dateList}>
                    {values.filter(Boolean).map((value, index) => renderDate(value, context, index))}
                </span>
            );
        }

        // The same treatment a single value gets, so a field holding several addresses is no less
        // usable than one holding a single address.
        return renderLinkList(values.map((value, index) => ({
            key: index,
            href: linkHref(value),
            text: labelFor(field, value)
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
        return renderDate(payload.value, context);
    }

    // A property holding an address becomes one, which is what makes browsing a link type - where
    // the address is the content - useful rather than something to copy out by hand. The whole
    // address is shown, since the cell scrolls on hover and it also carries the tooltip; a URL cut
    // short is one nobody can read or copy.
    const href = linkHref(payload.value);
    if (href) {
        return renderLink(href, href);
    }

    return labelFor(field, payload.value);
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

export const ContentTypesTable = ({
    contentType,
    search,
    visibleFields,
    filters,
    fieldsByKey,
    selection,
    onSelectionChange,
    onSetFilter,
    onClearFilter
}) => {
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

    // Sorting is driven from the header's arrow rather than from the table - see ColumnSortControl.
    // A different column starts ascending; the same column reverses. Either way the paging goes back
    // to the first page, since page 4 of one ordering says nothing about page 4 of another.
    const toggleSort = useCallback(key => {
        if (key === sortBy) {
            setSortDirection(direction => (direction === 'ascending' ? 'descending' : 'ascending'));
        } else {
            setSortBy(key);
            setSortDirection('ascending');
        }

        setCurrentPage(1);
    }, [sortBy]);

    const {isSearching, terms, nameTerms, typed} = useSearchTerm(search);

    // Page numbers do not carry across types, and no more across a change of search: page 4 of one
    // result set is very likely past the end of the next, which would show an empty table for a
    // type that has content.
    useEffect(() => {
        setCurrentPage(1);
    }, [contentType, terms, filters]);

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
    }, [site, contentType, terms, filters, currentPage, itemsPerPage, sortBy, sortDirection, onSelectionChange]);

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
    const recordQuery = useMemo(() => buildRecordQuery(dynamicFields), [dynamicFieldsKey]);

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

    /**
     * Everything being asked of the records, as one constraint.
     *
     * A search and the column filters are the same kind of thing to the repository, so they are built
     * together here and composed with `all`. The search keeps its own three ways of matching - full
     * text, the tag list, and the node name as a substring - which stay an `any` of their own, so a
     * search still widens across those three while a filter narrows.
     */
    const nodeConstraint = useMemo(() => {
        const searchConstraint = isSearching ? {
            any: [
                {contains: terms},
                {contains: terms, property: 'j:tagList'},
                // LOWER_CASE lowercases the column server-side, so an upper-case pattern would never
                // match. jContent lowercases the pattern here for the same reason.
                {like: nameTerms, property: 'j:nodename', function: 'LOWER_CASE'}
            ]
        } : null;

        return toNodeConstraint(filters, fieldsByKey, searchConstraint);
    }, [isSearching, terms, nameTerms, filters, fieldsByKey]);

    const ready = Boolean(site) && Boolean(contentType);

    const {data, loading, error, previousData, refetch} = useQuery(recordQuery, {
        variables: {
            sitePath: `/sites/${site}`,
            type: contentType,
            language,
            offset: (currentPage - 1) * itemsPerPage,
            limit: itemsPerPage,
            fieldSorter,
            ordering,
            nodeConstraint
        },
        skip: !ready
    });

    // Re-registered on every render, with no dependency list, which is how jContent registers its
    // own, so the entry always refers to the query as it currently stands.
    useEffect(() => {
        registry.addOrReplace('refetcher', REFETCHER, {refetch});

        return () => {
            // Taken out rather than emptied, so a refetch sweep after this table has gone does not
            // have a dead entry to walk. jContent's own `unsetRefetcher` deletes the registry's
            // backing key directly, but `remove` is public API and does the same thing.
            registry.remove('refetcher', REFETCHER);
        };
    });

    // Both follow the interface language. Sorting is unaffected by either: it happens on the server
    // against the stored property, which keeps its full precision whatever is drawn here, so two rows
    // from the same day still come back in the right order.
    const dateFormat = useMemo(
        // What the cell shows: the day, and nothing a column does not need in every row.
        () => new Intl.DateTimeFormat(uilang || language || undefined, {dateStyle: 'medium'}),
        [uilang, language]
    );

    const dateTimeFormat = useMemo(
        // What the tooltip shows: the same moment spelled out, down to the minute. A tooltip has room
        // to be unambiguous, so it names the weekday too rather than leaving a bare numeric date to
        // be read in whichever order the reader assumes.
        () => new Intl.DateTimeFormat(uilang || language || undefined, {dateStyle: 'full', timeStyle: 'short'}),
        [uilang, language]
    );

    const renderContext = useMemo(
        () => ({t, dateFormat, dateTimeFormat}),
        [t, dateFormat, dateTimeFormat]
    );

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

    const columns = useMemo(() => {
        /**
         * A column heading, as an element rather than the bare string a column label usually is.
         *
         * That is what lets it be narrowed: as a string it is an anonymous flex item that will not shrink
         * below its own width, and a long one pushed the sort arrow out of the cell. The full text stays
         * on hover, the way a truncated name does.
         */
        const headerLabel = (label, sortKey, isSortable, field) => (
            <>
                {field?.filterType && field?.jcrProperty ? (
                    <FilterableColumnLabel
                        field={field}
                        filter={filterFor(filters, field.key)}
                        label={label}
                        // Names the column in full, so it doubles as the tooltip a truncated heading
                        // needs - which is the one thing the plain heading used its title for.
                        title={t('label.filter.column', {column: label})}
                        onApply={filter => onSetFilter(field.key, filter)}
                        onClear={() => onClearFilter(field.key)}
                    />
                ) : (
                    <span className={styles.headerLabel} title={label}>{label}</span>
                )}
                {isSortable && (
                    <ColumnSortControl
                        label={t('label.sort.column', {column: label})}
                        isSorted={sortBy === sortKey}
                        direction={sortBy === sortKey ? sortDirection : 'ascending'}
                        onToggle={() => toggleSort(sortKey)}
                    />
                )}
            </>
        );

        // A content type's own field can hold anything up to a full rich text body, so it is bounded
        // and scrollable rather than growing the column to fit whatever the longest value happens to
        // be, or wrapping every row to several lines. How wide that bound is depends on what the
        // field holds - see columnWidthFor. `path` is bounded for the same reason: unbounded, a
        // deeply nested site pushes every column after it off screen.
        const fieldColumns = visibleFields.map(field => (field.isDynamic ? {
            key: field.key,
            // An arrow if the hook found either way of ordering it. What is left without one is a
            // multi-valued property, which has no single value to order a row by.
            label: headerLabel(field.label, field.key, Boolean(field.sortJcrProperty || field.sortProperty), field),
            width: columnWidthFor(field),
            isScrollable: true,
            render: ({value}) => renderDynamicField(field, value, renderContext)
        } : {
            key: field.key,
            label: headerLabel(field.label, field.key, Boolean(field.sortProperty), field),
            width: WIDE_COMMON_FIELDS.has(field.key) ? DEFAULT_COLUMN_WIDTH : COMMON_COLUMN_WIDTH,
            isScrollable: WIDE_COMMON_FIELDS.has(field.key),
            render: ({data: row}) => COMMON_RENDERERS[field.key](row, renderContext)
        }));

        return [
            {
                key: 'displayName',
                label: headerLabel(t('label.table.name'), 'displayName', true),
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
    }, [visibleFields, t, renderContext, hasSelection, filters, onSetFilter, onClearFilter, sortBy, sortDirection, toggleSort]);

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
                {isSearching ?
                    t('label.noSearchResults', {terms: typed}) :
                    t(filters.length > 0 ? 'label.noFilterResults' : 'label.noContent')}
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
    /** The conditions narrowing the table, and every field they could name - including ones whose
     *  column is hidden, since a filter in a shared link outlives a column choice held in a browser. */
    filters: PropTypes.array.isRequired,
    fieldsByKey: PropTypes.instanceOf(Map).isRequired,
    onSetFilter: PropTypes.func.isRequired,
    onClearFilter: PropTypes.func.isRequired,
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
