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
 * This bar adds several things to it, because an operation here may need the rows *as displayed* -
 * the same columns, in the same order, holding the same values - and re-reading them from their
 * paths would be a second query whose answer could honestly differ from what the reader is looking
 * at. So the bar passes what the table already holds:
 *
 *   nodes        the selected rows, in the shape ContentTypesRecordQuery fetched them
 *   fields       the visible columns, in the reader's own order
 *   contentType  the type being listed
 *   t            this module's translations, for an action with no React of its own
 *
 * They are additions, not conditions: an action that wants none of them ignores them and behaves
 * exactly as it would in jContent's bar.
 *
 * **This module registers nothing into this target of its own any more.** The menu is here for
 * other modules to fill; an editor who opens it with nothing registered sees `menuEmptyMessage`.
 */
export const BULK_ACTIONS_TARGET = 'contentTypesBulkActions';

/** The menu is itself an action, so the bar can render it like any other. */
export const BULK_MENU_ACTION = 'contentTypesBulkMenu';

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
        // What the menu says when nothing is registered in the target - which, since this module
        // contributes no entry of its own, is what an editor sees unless another module has.
        menuEmptyMessage: `${NAMESPACE}:label.bulk.empty`
    });
};

export default registerContentTypesBulkActions;
