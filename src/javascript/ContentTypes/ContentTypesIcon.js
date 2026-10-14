import {toIconComponentFunction} from '@jahia/moonstone';

/**
 * The accordion's icon: form elements, from SVG Repo (svgrepo.com).
 *
 * Two labelled fields - what a content type IS, from an editor's side: the shape of the form they
 * fill in. It also has to be legible at 16px next to five other accordion icons, which is why a
 * busier metaphor was not used.
 *
 * Not Moonstone's Grain, which this replaces: jContent's own "Additional" accordion already uses
 * it, and two entries in one list wearing the same icon is worse than either being unlabelled.
 *
 * Built through Moonstone so it is sized and coloured like every other icon in the interface. The
 * source file's 800px dimensions and default fill are replaced for that reason: 24px matches the
 * other icons, and currentColor lets this one follow the theme.
 *
 * toIconComponentFunction, not toIconComponent: the latter returns an element, so rendering it as
 * <ContentTypesIcon/> asks React to treat an object as a component type and throws (React #130).
 */
export const ContentTypesIcon = toIconComponentFunction(
    '<svg style="width:24px;height:24px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    '<path fill="currentColor" d="M22 6H2a1.001 1.001 0 0 0-1 1v3a1.001 1.001 0 0 0 1 1h20a1.001 1.001 0 0 0 1-1V7a1.001 ' +
    '1.001 0 0 0-1-1zm0 4H2V7h20v3h.001M22 17H2a1.001 1.001 0 0 0-1 1v3a1.001 1.001 0 0 0 1 1h20a1.001 1.001 0 0 0 1-1v-3a1.001 ' +
    '1.001 0 0 0-1-1zm0 4H2v-3h20v3h.001M10 14v1H2v-1zM2 3h8v1H2z"/>' +
    '</svg>'
);

export default ContentTypesIcon;
