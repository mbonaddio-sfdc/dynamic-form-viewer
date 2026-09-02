import { LightningElement, api, wire } from 'lwc';
import { getRecord } from 'lightning/uiRecordApi';
import {
    buildSection,
    formatLabel,
    resolveSections,
    resolveFmtSections,
    parseKeyList
} from './jsonNodes';

const DEFAULT_OBJECT = 'Case';
const DEFAULT_FIELD = 'Application_Form_JSON__c';

export default class DynamicFormViewer extends LightningElement {
    @api recordId;

    /** SObject API name, configurable from the record page. */
    @api objectApiName = DEFAULT_OBJECT;

    /** API name of the field holding the JSON string, configurable. */
    @api jsonFieldName = DEFAULT_FIELD;

    /**
     * Optional dotted path to render from (e.g. "PersonalDetails"). When set,
     * the component drills into that node and treats it as the root.
     */
    @api rootPath = '';

    /** Comma-separated extra top-level keys to exclude from rendering. */
    @api excludeKeys = '';

    /**
     * When true, top-level scalar keys are rendered as sections too. Off by
     * default so OmniScript envelope metadata is filtered out automatically.
     */
    @api includeScalarSections = false;

    /**
     * Render source. "fmtData" (default) reads OmniScript's display-formatted
     * answer set (OmniScriptFmtData) and renders only the form fields the user
     * saw. "raw" renders the raw payload tree, filtered by the header blocklist
     * / rootPath / excludeKeys. If "fmtData" is selected but the payload has no
     * OmniScriptFmtData node, the component falls back to raw automatically.
     */
    @api sourceMode = 'fmtData';

    /** The effective data object after root-path drill-in / filtering. */
    renderData = null;

    applicationData = null;
    sections = [];
    activeSectionKey = null;
    tabs = [];
    errorMessage;
    isLoaded = false;

    /** Fully-qualified field reference for the wire, e.g. "Case.Foo__c". */
    get fieldRef() {
        const obj = this.objectApiName || DEFAULT_OBJECT;
        const field = this.jsonFieldName || DEFAULT_FIELD;
        return `${obj}.${field}`;
    }

    get wireFields() {
        return [this.fieldRef];
    }

    @wire(getRecord, { recordId: '$recordId', fields: '$wireFields' })
    wiredRecord({ error, data }) {
        if (data) {
            this.isLoaded = true;
            const field = this.jsonFieldName || DEFAULT_FIELD;
            const raw = data.fields && data.fields[field];
            const jsonString = raw ? raw.value : null;

            if (!jsonString) {
                this.errorMessage = 'Application form JSON is empty.';
                this.reset();
                return;
            }
            try {
                const parsed = JSON.parse(jsonString);
                this.errorMessage = undefined;
                this.applicationData = parsed;
                this.processApplicationData();
            } catch (e) {
                this.errorMessage = `Error parsing application JSON: ${e.message}`;
                this.reset();
            }
        } else if (error) {
            this.isLoaded = true;
            this.errorMessage = `Error loading record data: ${this.getErrorMessage(
                error
            )}`;
            this.reset();
        }
    }

    reset() {
        this.applicationData = null;
        this.renderData = null;
        this.sections = [];
        this.tabs = [];
        this.activeSectionKey = null;
    }

    getErrorMessage(error) {
        if (error && error.body) {
            if (Array.isArray(error.body)) {
                return error.body.map((e) => e.message).join(', ');
            }
            if (typeof error.body.message === 'string') {
                return error.body.message;
            }
        }
        return (error && error.message) || 'Unknown error';
    }

    processApplicationData() {
        if (!this.applicationData || typeof this.applicationData !== 'object') {
            this.errorMessage = 'Application JSON is not an object.';
            this.reset();
            return;
        }

        // Resolve which top-level keys become sections. In fmtData mode we
        // render OmniScript's display-formatted answer set; otherwise (or if
        // that node is absent) we fall back to the raw payload with the
        // OmniScript envelope filtered out.
        let resolved = null;
        if (this.sourceMode !== 'raw') {
            resolved = resolveFmtSections(this.applicationData);
        }
        if (!resolved) {
            resolved = resolveSections(this.applicationData, {
                rootPath: this.rootPath,
                excludeKeys: parseKeyList(this.excludeKeys),
                includeScalars: this.includeScalarSections
            });
        }
        const { data, keys } = resolved;
        this.renderData = data;

        this.sections = keys.map((key) => ({
            label: formatLabel(key),
            name: key
        }));

        if (this.sections.length > 0) {
            this.selectSection(this.sections[0].name);
        }
    }

    handleSectionSelect(event) {
        this.selectSection(event.detail.name);
    }

    selectSection(sectionKey) {
        this.activeSectionKey = sectionKey;
        this.buildTabsForSection(sectionKey);
    }

    buildTabsForSection(sectionKey) {
        const source = this.renderData || this.applicationData;
        const sectionData = source[sectionKey];
        const { detailFields, complexTabs } = buildSection(
            sectionKey,
            sectionData
        );

        const newTabs = [];
        if (detailFields.length > 0) {
            newTabs.push({
                label: 'Details',
                value: '__details__',
                isDetails: true,
                fields: detailFields
            });
        }
        complexTabs.forEach((t) => {
            newTabs.push({
                label: t.label,
                value: t.value,
                isDetails: false,
                node: t.node
            });
        });
        this.tabs = newTabs;
    }

    // --- template state getters -----------------------------------------

    get showSpinner() {
        return !this.isLoaded && !this.errorMessage;
    }

    get hasData() {
        return !!this.renderData && this.sections.length > 0;
    }

    get showEmptyState() {
        return this.isLoaded && !this.errorMessage && !this.hasData;
    }
}
