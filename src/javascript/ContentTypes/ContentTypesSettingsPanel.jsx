import React, {useEffect, useMemo, useState} from 'react';
import {useMutation, useQuery} from '@apollo/client';
import {shallowEqual, useSelector} from 'react-redux';
import {useTranslation} from 'react-i18next';
import {Button, Checkbox, CheckboxItem, Loader, Typography} from '@jahia/moonstone';
import {GET_CONTENT_TYPE_TREE, GET_LISTED_TYPES, GET_SITE_CONTENT_TYPES, SET_LISTED_TYPES} from './ContentTypes.gql';
import {NAMESPACE} from '../ContentTypes.register';
import styles from './ContentTypes.module.scss';

/**
 * Chooses which content types the accordion lists, for everyone working on the site.
 *
 * Rendered as a page in Administration > site > Settings. It stays put after saving and confirms
 * in place, because there is nowhere to return to.
 */
export const ContentTypesSettingsPanel = () => {
    const {t} = useTranslation(NAMESPACE);
    const {site, uilang} = useSelector(state => ({
        site: state.site,
        uilang: state.uilang
    }), shallowEqual);

    const sitePath = `/sites/${site}`;
    const [selected, setSelected] = useState(null);
    const [status, setStatus] = useState(null);

    // The complete list of what the site can hold.
    const available = useQuery(GET_SITE_CONTENT_TYPES, {
        variables: {siteKey: site, language: uilang || 'en'},
        skip: !site
    });

    // Category labels only. This is scoped to what may be created under one path, so it does not
    // account for every type; whatever it misses is grouped as uncategorised below.
    const tree = useQuery(GET_CONTENT_TYPE_TREE, {
        variables: {path: `${sitePath}/contents`, uilang: uilang || 'en'},
        skip: !site
    });

    const current = useQuery(GET_LISTED_TYPES, {
        variables: {sitePath},
        // Always from the server: another administrator may have changed this since this was last
        // opened, and saving a stale set would quietly undo their change.
        fetchPolicy: 'network-only',
        skip: !site
    });

    const [save, {loading: isSaving}] = useMutation(SET_LISTED_TYPES, {
        // The accordion reads the same property, so it has to be refetched for the list to narrow.
        refetchQueries: ['getListedTypes']
    });

    const types = useMemo(() => available.data?.jcr?.nodeTypes?.nodes || [], [available.data]);
    const allTypes = useMemo(() => types.map(type => type.name), [types]);

    // The types Jahia flags as editorial, which is what the accordion lists when nobody has
    // chosen. Saving exactly this set is therefore the same as making no choice at all.
    const editorialTypes = useMemo(
        () => types.filter(type => type.editorial).map(type => type.name),
        [types]
    );

    /**
     * The complete list, grouped by Jahia's categories where it has one.
     *
     * Grouping comes from the tree and the entries come from the complete list, so a type the
     * tree never mentions - one created somewhere other than /contents - is still offered, under
     * a final uncategorised group rather than being silently dropped.
     */
    const categories = useMemo(() => {
        const byName = new Map(types.map(type => [type.name, type]));
        const grouped = [];
        const placed = new Set();

        (tree.data?.forms?.contentTypesAsTree || []).forEach(category => {
            const children = (category.children || [])
                .filter(child => byName.has(child.name))
                .map(child => {
                    placed.add(child.name);
                    return {name: child.name, label: child.label || byName.get(child.name).displayName};
                });

            if (children.length > 0) {
                grouped.push({name: category.name, label: category.label, children});
            }
        });

        const rest = types.filter(type => !placed.has(type.name));
        if (rest.length > 0) {
            grouped.push({
                name: 'uncategorised',
                label: t('label.settings.otherCategory'),
                children: rest.map(type => ({name: type.name, label: type.displayName || type.name}))
            });
        }

        return grouped;
    }, [types, tree.data, t]);

    const isEditorial = useMemo(() => new Set(editorialTypes), [editorialTypes]);

    const stored = current.data?.jcr?.nodeByPath?.listedTypes?.values;

    // Nothing stored means every type is listed, so that is what this opens showing: the boxes
    // reflect what is happening now rather than an empty slate.
    useEffect(() => {
        if (selected === null && allTypes.length > 0 && !current.loading) {
            setSelected(stored?.length > 0 ? stored.filter(type => allTypes.includes(type)) : editorialTypes);
        }
    }, [selected, allTypes, editorialTypes, stored, current.loading]);

    const update = updater => {
        setStatus(null);
        setSelected(updater);
    };

    const toggleType = (name, isChecked) => update(previous => (
        isChecked ? [...previous, name] : previous.filter(type => type !== name)
    ));

    const toggleCategory = (category, isChecked) => {
        const names = (category.children || []).map(child => child.name);
        update(previous => (
            isChecked ?
                [...previous, ...names.filter(name => !previous.includes(name))] :
                previous.filter(type => !names.includes(type))
        ));
    };

    const handleSave = () => {
        // Selecting exactly the editorial set is the same as making no choice, and storing that as
        // an empty list keeps the site following the default as new types are installed, rather
        // than freezing today's set.
        const isDefault = selected.length === editorialTypes.length &&
            selected.every(type => isEditorial.has(type));

        setStatus(null);
        save({variables: {sitePath, types: isDefault ? [] : selected}})
            .then(() => setStatus('saved'))
            // Without this the save fails silently and nothing on screen changes, which reads as
            // a dead button rather than as a failure.
            .catch(() => setStatus('error'));
    };

    const isLoading = available.loading || tree.loading || current.loading || selected === null;

    if (isLoading) {
        return <Loader size="big" classNameWrapper={styles.centered}/>;
    }

    return (
        <div className={styles.settingsPanel}>
            <Typography className={styles.subtitle} variant="caption">
                {t('label.settings.description')}
            </Typography>

            <div className={styles.settingsCategories}>
                {categories.map(category => {
                    const names = (category.children || []).map(child => child.name);
                    const checkedCount = names.filter(name => selected.includes(name)).length;

                    return (
                        <section key={category.name} className={styles.category}>
                            <div className={styles.categoryHeader}>
                                <Checkbox
                                    checked={names.length > 0 && checkedCount === names.length}
                                    indeterminate={checkedCount > 0 && checkedCount < names.length}
                                    data-sel-category={category.name}
                                    onChange={(event, value, isChecked) => toggleCategory(category, isChecked)}
                                />
                                <Typography weight="bold">
                                    {`${category.label} (${checkedCount}/${names.length})`}
                                </Typography>
                            </div>
                            <div className={styles.categoryTypes}>
                                {(category.children || []).map(child => (
                                    <CheckboxItem key={child.name}
                                                  id={`ct-${child.name}`}
                                                  checked={selected.includes(child.name)}
                                                  label={isEditorial.has(child.name) ?
                                                      `${child.label} (${t('label.settings.editorial')})` :
                                                      child.label}
                                                  description={child.name}
                                                  data-sel-type={child.name}
                                                  onChange={(event, value, isChecked) => toggleType(child.name, isChecked)}
                                    />
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>

            <footer className={styles.dialogFooter}>
                <Typography
                    className={styles[status === 'error' ? 'error' : (status === 'saved' ? 'success' : 'subtitle')]}
                    variant="caption"
                    weight={status ? 'bold' : 'default'}
                    data-sel-role="settings-status"
                >
                    {status === 'saved' && t('label.settings.saved')}
                    {status === 'error' && t('label.settings.saveError')}
                    {!status && t('label.settings.selectedCount', {count: selected.length, total: allTypes.length})}
                </Typography>
                <div className={styles.toolBarSpacer}/>
                <Button size="big"
                        color="accent"
                        label={t('label.settings.save')}
                        isDisabled={isSaving}
                        isLoading={isSaving}
                        data-sel-role="settings-save"
                        onClick={handleSave}
                />
            </footer>
        </div>
    );
};

export default ContentTypesSettingsPanel;
