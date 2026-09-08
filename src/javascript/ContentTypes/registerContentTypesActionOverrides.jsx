import React from 'react';
import {useSelector} from 'react-redux';
import {registry} from '@jahia/ui-extender';
import {ACCORDION_KEY} from './registerContentTypesAccordion';

/**
 * jContent actions that cannot work in this accordion, hidden while it is the one on screen.
 *
 * **Why any of them cannot work.** Overriding `routeComponent` means jContent's own ContentRoute
 * never runs, and some of its actions do not act by themselves - they write into redux and rely on
 * that route to render the answer. In this accordion those fire into nothing: the menu entry is
 * there, it is clickable, and clicking it does nothing at all.
 *
 * `preview` is one. Its component dispatches `cmSetSidePanelSelection(path)` and stops; the drawer
 * that answers is part of jContent's ContentRoute and not of its federated surface, so there is
 * nothing here to draw it. An entry that does nothing is worse than no entry - it reads as broken
 * software rather than as a feature this screen does not have.
 *
 * **Wrapped rather than replaced.** The action's own component is kept and rendered everywhere else,
 * so jContent's list view, its tree and Content Usages all keep their Preview exactly as it was.
 * Only this accordion hides it. Replacing the registration outright would take the action away from
 * the whole product to fix one screen.
 *
 * The alternative, drawing a preview of our own, is what used to be here and was removed: a
 * reimplementation wearing jContent's clothes. Hiding the entry says the honest thing instead.
 */
const HIDDEN_IN_THIS_ACCORDION = ['preview'];

/**
 * The action's own component, drawn only when this accordion is not the one on screen.
 *
 * `state.jcontent.mode` is the accordion jContent currently has open, which is the one thing that
 * distinguishes "this screen" from every other place the same action is offered. Read through a
 * hook, so the entry reappears the moment a reader switches accordion without anything having to
 * re-register.
 */
const hiddenInThisAccordion = Original => {
    const Wrapped = props => {
        const mode = useSelector(state => state.jcontent?.mode);

        if (mode === ACCORDION_KEY) {
            return false;
        }

        return <Original {...props}/>;
    };

    // Named for the devtools, an anonymous arrow in a menu of thirty actions saying nothing about
    // which one it is.
    Wrapped.displayName = `HiddenInContentTypes(${Original.displayName || Original.name || 'Action'})`;

    return Wrapped;
};

export const registerContentTypesActionOverrides = () => {
    HIDDEN_IN_THIS_ACCORDION.forEach(key => {
        const action = registry.get('action', key);

        /*
         * Nothing to wrap, and nothing to say about it: an action this module does not own may
         * legitimately not be there - a jContent version that renamed it, or one where it never
         * existed. The entry simply is not in the menu, which is the outcome wanted anyway.
         */
        if (!action?.component) {
            return;
        }

        // Wrapping twice would nest one wrapper in another, which still works but grows a level on
        // every re-registration - and the init callback can fire more than once in a session.
        if (action.component.isContentTypesWrapper) {
            return;
        }

        const component = hiddenInThisAccordion(action.component);
        component.isContentTypesWrapper = true;

        registry.addOrReplace('action', key, action, {component});
    });
};

export default registerContentTypesActionOverrides;
