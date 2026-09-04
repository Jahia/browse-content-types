import {buildRecordsCsv, csvContextFor} from './ContentTypesCsv';
import {buildRecordsJson} from './ContentTypesJson';

/**
 * The formats the export dialog offers, and what each one is made of.
 *
 * Jahia's own XML is deliberately not among them. `/cms/export` takes exactly one node path, parsed
 * by regex out of the URL, so it cannot serve a selection at all; it is deprecated as of 8.2.4.0
 * with no replacement yet ("New alternative yet to come"); and jContent already registers its
 * `export` action in the `selectedContentActions` target this bar renders, so for a single ticked
 * row the button is there already, with its own workspace and zip/xml choices. Offering it here
 * would duplicate that button and promise the selection case it cannot keep.
 */

/**
 * What the downloaded file is called.
 *
 * The content type and the day, which is what tells two exports apart in a downloads folder. The
 * type name carries a colon (`luxe:estate`) and Windows refuses a filename containing one outright,
 * so every character that is not a letter, a digit or a dash becomes an underscore rather than only
 * the colon - a property name is free to hold others.
 *
 * The date is the local day rather than `toISOString`, which is UTC: an export made at nine in the
 * evening in Paris would otherwise be filed under the following day.
 */
export const exportFileName = (contentType, extension, now = new Date()) => {
    const safeType = String(contentType || 'content').replace(/[^a-zA-Z0-9-]/g, '_');
    const pad = number => String(number).padStart(2, '0');
    const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return `${safeType}-${day}.${extension}`;
};

/**
 * Each format knows its own extension, media type and how to turn rows into text.
 *
 * A table rather than a switch, so adding a format is one entry in one place and the dialog needs no
 * knowledge of any particular one.
 *
 * The media types are honest rather than download-forcing: the file *is* a CSV or a JSON document,
 * and saying so is what lets the operating system offer to open it in the right thing. The anchor's
 * `download` attribute is already what makes it a save rather than a navigation.
 */
export const EXPORT_FORMATS = {
    csv: {
        key: 'csv',
        extension: 'csv',
        mimeType: 'text/csv;charset=utf-8',
        // What the table shows, without the styling - see ContentTypesCsv.
        build: ({nodes, fields, nameLabel, t, languages, translatableFields}) => buildRecordsCsv({
            nodes,
            fields,
            nameLabel,
            context: {...csvContextFor(t), languages, translatableFields}
        })
    },
    json: {
        key: 'json',
        extension: 'json',
        mimeType: 'application/json',
        // What the repository stores, with the types intact - see ContentTypesJson. `t` is unused
        // here on purpose: nothing in a JSON export is translated, which is the point of it.
        build: ({nodes, fields, nameLabel, languages, translatableFields}) =>
            buildRecordsJson({nodes, fields, nameLabel, context: {languages, translatableFields}})
    }
};

/** The formats in the order the dialog lists them. */
export const EXPORT_FORMAT_KEYS = Object.keys(EXPORT_FORMATS);

/**
 * The columns an export starts with, and the order they are in.
 *
 * Seeded from what the table is showing, because that is the set the reader arranged and is looking
 * at. It is a starting point rather than a binding: what the dialog then does to it belongs to the
 * export, and changing it must not reorder the table underneath.
 */
export const initialExportKeys = visibleFields => (visibleFields || []).map(field => field.key);

/**
 * The chosen keys as real fields, in the chosen order.
 *
 * Looked up in the whole catalog rather than in what is visible, so a column can be added to an
 * export without being shown in the table first. A key that names nothing - a saved set naming a
 * property the type no longer declares - is dropped rather than exported as an empty column.
 */
export const exportFields = (keys, fieldsByKey) => (keys || [])
    .map(key => fieldsByKey.get(key))
    .filter(Boolean);
