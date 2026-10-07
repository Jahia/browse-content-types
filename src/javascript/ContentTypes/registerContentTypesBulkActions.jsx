import {registry} from '@jahia/ui-extender';
import {NAMESPACE} from '../ContentTypes.register';

/**
 * The registry target that fills the selection bar's bulk menu.
 *
 * Published as an extension point rather than kept private: once this module is deployed, any other
 * module can put its own operation in that menu with a plain registration, the way jContent's own
 * targets work and without this module knowing anything about it -
 *
 *     registry.add('action', 'myBulkThing', {
 *         buttonLabel: 'my-module:label.bulkThing',
 *         targets: ['contentTypesBulkActions:35'],
 *         component: MyBulkThingActionComponent
 *     });
 *
 * An action here is handed `path` for a single selected row, or `paths` for several - the context
 * every action in jContent's own bars gets, and all most of them need, since each goes and reads
 * whatever else it wants about those nodes itself.
 *
 * This bar adds several things to it, because some operations here cannot be written from paths
 * alone.
 * Exporting the table needs the rows *as displayed* - the same columns, in the same order, holding
 * the same values - and re-reading them from their paths would be a second query whose answer could
 * honestly differ from what the reader is looking at. So the bar passes what the table already
 * holds:
 *
 *   nodes        the selected rows, in the shape ContentTypesRecordQuery fetched them
 *   fields       the visible columns, in the reader's own order
 *   contentType  the type being listed, which names the file
 *   t            this module's translations, for an action with no React of its own
 *   openExport     opens the export form, which the bar renders - see below
 *   openBulkEdit   opens the replace-a-value form, likewise
 *
 * They are additions, not conditions: an action that wants none of them ignores them and behaves
 * exactly as it would in jContent's bar.
 */
export const BULK_ACTIONS_TARGET = 'contentTypesBulkActions';

/** The menu is itself an action, so the bar can render it like any other. */
export const BULK_MENU_ACTION = 'contentTypesBulkMenu';

/**
 * The operations this module means to provide of its own, in the order they appear.
 *
 * Registered as ordinary actions in the target above rather than hardcoded into the menu, so they
 * are neither more nor less privileged than one another module contributes - and so replacing a
 * placeholder with the real thing is a change to one registration, not to the bar.
 *
 * Priorities are spaced by ten to leave another module room to slot in between two of them.
 */
const ENTRIES = ['editValue', 'export'];

/**
 * Kept for an entry another module registers into this target without a handler, and as what a new
 * entry of this module's own starts as: the menu item renderer calls `onClick`, so the handler has
 * to exist for the entry to be clickable at all. Neither of this module's own uses it.
 */
const notImplementedYet = () => undefined;

/**
 * Exporting asks two questions first - which format, and which columns - so like the other entry it
 * opens a form the bar renders. It was a straight download while CSV was the only format and the
 * visible columns the only set; neither is true now.
 */
const openExportDialog = ({openExport}) => openExport?.();

/**
 * Replacing a column's value asks which column first, so it too is a form the bar renders.
 */
const openBulkEditDialog = ({openBulkEdit}) => openBulkEdit?.();

/** Every entry now has something behind it. */
const HANDLERS = {
    editValue: openBulkEditDialog,
    export: openExportDialog
};

export const registerContentTypesBulkActions = () => {
    // The init callback can fire more than once; registering twice would throw on the second pass.
    if (registry.get('action', BULK_MENU_ACTION)) {
        return;
    }

    // Built on jContent's own composed menuAction, which carries the Moonstone menu and menu-item
    // renderers. Neither is exported, so starting from ui-extender's bare `menuAction` would mean
    // reimplementing both. jContent registers it on jahiaApp-init:1 and this runs on :60, so it is
    // in place by now - but guarded all the same, because a throw in here takes the whole module's
    // registration down with it, accordion included.
    const menuActionWithRenderer = registry.get('action', 'menuAction');
    if (!menuActionWithRenderer) {
        console.warn('[content-types] jContent\'s menuAction is not registered; the bulk menu is not available.');
        return;
    }

    registry.add('action', BULK_MENU_ACTION, menuActionWithRenderer, {
        buttonLabel: `${NAMESPACE}:label.bulk.trigger`,
        menuTarget: BULK_ACTIONS_TARGET,
        // What the menu says when nothing is registered in the target - which is what an editor sees
        // if these placeholders are ever taken out before the real operations land.
        menuEmptyMessage: `${NAMESPACE}:label.bulk.empty`
    });

    ENTRIES.forEach((key, index) => {
        registry.add('action', `contentTypesBulk_${key}`, {
            buttonLabel: `${NAMESPACE}:label.bulk.${key}`,
            targets: [`${BULK_ACTIONS_TARGET}:${(index + 1) * 10}`],
            // The menu item renderer calls this with the item's own props, which carry the bar's
            // context - so an action needs no React of its own to read the selection.
            onClick: HANDLERS[key] || notImplementedYet
        });
    });
};

export default registerContentTypesBulkActions;
