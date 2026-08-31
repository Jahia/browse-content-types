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
 * An action here is handed the same context every action in the bar gets: `path` for a single
 * selected row, or `paths` for several. Nothing else - it looks up whatever else it needs itself.
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
const PLACEHOLDER_ENTRIES = ['tag', 'categorize', 'exportCsv', 'assignTo'];

/**
 * Deliberately inert, and not simply absent: the menu item renderer calls `onClick`, so the handler
 * has to exist for the entry to be clickable at all. Each of these is a piece of work in its own
 * right - reconciling a tag or a category across a set of nodes that may already disagree about it,
 * streaming a CSV of whatever columns happen to be visible, handing content to someone - and the
 * entries are laid out first so that how they are reached is settled once rather than four times.
 */
const notImplementedYet = () => undefined;

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

    PLACEHOLDER_ENTRIES.forEach((key, index) => {
        registry.add('action', `contentTypesBulk_${key}`, {
            buttonLabel: `${NAMESPACE}:label.bulk.${key}`,
            targets: [`${BULK_ACTIONS_TARGET}:${(index + 1) * 10}`],
            onClick: notImplementedYet
        });
    });
};

export default registerContentTypesBulkActions;
