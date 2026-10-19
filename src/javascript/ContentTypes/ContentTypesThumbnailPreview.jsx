import React, {useState} from 'react';
import {createPortal} from 'react-dom';
import PropTypes from 'prop-types';
import styles from './ContentTypes.module.scss';

// Far enough from the pointer not to sit under it, close enough to read as belonging to the cell.
const OFFSET_PX = 16;

/**
 * How much room the preview is assumed to need when deciding which side of the pointer to use.
 *
 * A guess rather than a measurement, because the decision has to be made before the image has
 * loaded and there is nothing to measure yet. It matches the cap `.thumbnailPreview img` draws at,
 * so the only way the two disagree is a rendition smaller than the cap - which flips the preview
 * to the near side slightly earlier than it had to, and never off the screen.
 */
const PREVIEW_PX = 260;

/**
 * The referenced image at a size worth looking at, following the pointer while it is over the cell.
 *
 * The table draws media as a 40px thumbnail, which is enough to tell a picture from a video and not
 * enough to tell two crops of the same picture apart. This is the second look, on the gesture that
 * already means "this one" everywhere else in the table.
 *
 * **Rendered into the body through a portal.** Its place in the tree is a table cell, and a cell
 * clips what overflows it; the table also scrolls, so anything positioned inside it would be cut
 * off at the edge of the pane rather than floating over it.
 *
 * **It removes itself when the image fails to load.** Jahia generates renditions lazily, so the
 * larger `thumbnail2` may not exist yet for a freshly uploaded image even though the small one
 * does. A broken image is worse than no preview, and the thumbnail in the cell is unaffected.
 */
export const ContentTypesThumbnailPreview = ({src, alt, at}) => {
    const [hasFailed, setHasFailed] = useState(false);

    if (hasFailed || !at || !src) {
        return null;
    }

    // Flipped to the near side of the pointer wherever the far side would run off the viewport, so
    // a row at the right-hand edge or the last row on screen previews as readably as any other.
    const overflowsRight = at.x + OFFSET_PX + PREVIEW_PX > window.innerWidth;
    const left = overflowsRight ? at.x - OFFSET_PX - PREVIEW_PX : at.x + OFFSET_PX;
    const overflowsBottom = at.y + OFFSET_PX + PREVIEW_PX > window.innerHeight;
    const top = overflowsBottom ? at.y - OFFSET_PX - PREVIEW_PX : at.y + OFFSET_PX;

    return createPortal(
        <div className={styles.thumbnailPreview} style={{top, left}} data-sel-role="thumbnail-preview">
            <img src={src} alt={alt || ''} onError={() => setHasFailed(true)}/>
        </div>,
        document.body
    );
};

ContentTypesThumbnailPreview.propTypes = {
    /** The rendition to draw. Nothing is drawn without one. */
    src: PropTypes.string,
    alt: PropTypes.string,
    /** Where the pointer is, in viewport coordinates. Null whenever the pointer is not over the cell. */
    at: PropTypes.shape({x: PropTypes.number, y: PropTypes.number})
};

export default ContentTypesThumbnailPreview;
