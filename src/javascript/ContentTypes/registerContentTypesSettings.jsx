import React from 'react';
import {useTranslation} from 'react-i18next';
import {registry} from '@jahia/ui-extender';
import {Setting, Typography} from '@jahia/moonstone';
import {ContentTypesSettingsPanel} from './ContentTypesSettingsPanel';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * The same setting, reached from Administration > site > Settings.
 *
 * The toolbar cog is where an editor stumbles on it; this is where an administrator looks for it.
 * Both render the one panel, so there is a single implementation and no second place to keep in
 * step. The target and the requiredPermission pairing follow what the siteSettings module itself
 * registers for Users and Groups.
 */
const SettingsRoute = () => {
    const {t} = useTranslation(NAMESPACE);

    // A page, not a modal: there is nowhere to close back to, so the panel is given neither
    // onSaved nor onCancel and the confirmation simply stays on screen after a save.
    return (
        <div className={styles.settingsPage}>
            <Typography isNowrap variant="heading" weight="bold">
                {t('label.settings.title')}
            </Typography>
            <ContentTypesSettingsPanel/>
        </div>
    );
};

const registerContentTypesSettings = () => {
    if (registry.get('adminRoute', 'settings/contentTypes')) {
        return;
    }

    registry.add('adminRoute', 'settings/contentTypes', {
        targets: ['administration-sites:30'],
        icon: <Setting/>,
        label: `${NAMESPACE}:label.settings.title`,
        requiredPermission: 'siteAdminContentTypes',
        isSelectable: true,
        render: () => <SettingsRoute/>
    });
};

export default registerContentTypesSettings;
