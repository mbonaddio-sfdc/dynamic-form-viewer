/**
 * jsonNodes
 * ---------
 * Shared, pure helpers for turning arbitrary parsed JSON into a tree of
 * "nodes" that dynamicFieldRenderer knows how to display. Kept free of any
 * LWC/DOM dependency so it can be unit-tested in isolation and reused by both
 * the parent viewer and the recursive renderer.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;

// Known unit suffixes: raw key ending -> display suffix. Applied before any
// camelCase splitting so multi-case units like "kW" survive intact.
const UNIT_SUFFIXES = [
    { re: /_kW$/, out: ' (kW)' },
    { re: /_m$/, out: ' (m)' },
    { re: /_days$/, out: ' (days)' }
];

/** Turn a raw JSON key into a human-readable label. */
export function formatLabel(key) {
    if (!key && key !== 0) return '';
    let str = String(key);

    // Pull off a recognised unit suffix, format the stem, re-append the unit.
    let unit = '';
    for (const { re, out } of UNIT_SUFFIXES) {
        if (re.test(str)) {
            unit = out;
            str = str.replace(re, '');
            break;
        }
    }

    const label = str
        .replace(/([A-Z])/g, ' $1') // space before capitals
        .replace(/[_-]+/g, ' ') // separators -> space
        .replace(/\s+/g, ' ')
        .trim()
        // Title-case each word so snake/kebab keys read well too.
        .replace(/\b\w/g, (s) => s.toUpperCase());

    return label + unit;
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isArrayOfObjects(value) {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => isPlainObject(v))
    );
}

// Salesforce id prefixes for the two File objects.
const CONTENT_DOCUMENT_PREFIX = '069';
const CONTENT_VERSION_PREFIX = '068';

function isContentId(value, prefix) {
    return (
        typeof value === 'string' &&
        value.startsWith(prefix) &&
        (value.length === 15 || value.length === 18)
    );
}

/**
 * Does this single object look like one OmniScript File-element entry?
 * Standard shape: { data:"069…", vId:"068…", filename:"x.pdf", size:1234 }.
 * We require a filename plus at least one usable content id (069 or 068) so a
 * plain object that merely happens to have a `data` key isn't misread.
 */
function isFileEntry(obj) {
    if (!isPlainObject(obj)) return false;
    const hasName =
        typeof obj.filename === 'string' && obj.filename.length > 0;
    const hasId =
        isContentId(obj.data, CONTENT_DOCUMENT_PREFIX) ||
        isContentId(obj.vId, CONTENT_VERSION_PREFIX);
    return hasName && hasId;
}

/** An OmniScript File element value is an array whose entries are file entries. */
function isFileUpload(value) {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => isFileEntry(v))
    );
}

/** Human-readable byte size, e.g. 5385 -> "5.3 KB". */
export function formatFileSize(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB'];
    let size = n / 1024;
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i += 1;
    }
    return `${size.toFixed(1)} ${units[i]}`;
}

/**
 * Normalize one raw File-element entry into the shape the renderer needs.
 * documentId (069) drives Lightning file preview; a download URL is always
 * derivable from whichever id is present, so files uploaded by guest users
 * (068 only) still get a working download link.
 */
function buildFile(entry, index, parentPath) {
    const documentId = isContentId(entry.data, CONTENT_DOCUMENT_PREFIX)
        ? entry.data
        : null;
    const versionId = isContentId(entry.vId, CONTENT_VERSION_PREFIX)
        ? entry.vId
        : null;
    const downloadUrl = documentId
        ? `/sfc/servlet.shepherd/document/download/${documentId}`
        : versionId
          ? `/sfc/servlet.shepherd/version/download/${versionId}`
          : null;
    return {
        key: `${parentPath}[${index}]`,
        filename: entry.filename,
        sizeLabel: formatFileSize(entry.size),
        documentId,
        versionId,
        downloadUrl,
        canPreview: Boolean(documentId)
    };
}

/** Pick a sensible title for one object inside an array-of-objects. */
function itemTitle(obj, index) {
    const candidate =
        obj.item || obj.name || obj.title || obj.label || obj.type;
    if (candidate && typeof candidate !== 'object') return String(candidate);
    return `Item ${index + 1}`;
}

/**
 * Build a single display node from a key/value pair.
 * Recurses for nested objects and arrays-of-objects, so depth is unlimited.
 *
 * @param {string} key   raw JSON key (used for the *:for:each key and label)
 * @param {*}      value the raw JSON value
 * @param {string} keyPath stable unique path used as the list key
 * @returns {object} node consumed by dynamicFieldRenderer
 */
export function buildNode(key, value, keyPath) {
    const path = keyPath || key;
    const base = { key: path, label: formatLabel(key), value };

    // Empty-ish leaves.
    if (value === null || value === undefined || value === '') {
        return { ...base, type: 'empty' };
    }

    if (typeof value === 'boolean') {
        return { ...base, type: 'boolean', displayValue: value ? 'Yes' : 'No' };
    }

    if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
        return { ...base, type: 'date' };
    }

    // OmniScript File-element upload -> file chips. Must be tested BEFORE the
    // generic array-of-objects branch (a file array is also an array of
    // objects) and before nested-object handling (a single-entry value could
    // otherwise fall through) so the 069/068 ids never render as raw text.
    if (isFileUpload(value)) {
        return {
            ...base,
            type: 'file',
            files: value.map((entry, i) => buildFile(entry, i, path))
        };
    }

    // Array of objects -> recurse per item.
    if (isArrayOfObjects(value)) {
        return {
            ...base,
            type: 'arrayOfObjects',
            isEmptyContainer: false,
            items: value.map((obj, i) => ({
                key: `${path}[${i}]`,
                title: itemTitle(obj, i),
                fields: buildNodes(obj, `${path}[${i}]`)
            }))
        };
    }

    // Simple array (primitives, or mixed/empty arrays we render as a list).
    if (Array.isArray(value)) {
        const items = value.map((v, i) => ({
            key: `${path}[${i}]`,
            value: isPlainObject(v) ? JSON.stringify(v) : String(v)
        }));
        return {
            ...base,
            type: 'simpleArray',
            items,
            hasItems: items.length > 0
        };
    }

    // Nested object -> recurse.
    if (isPlainObject(value)) {
        const fields = buildNodes(value, path);
        return {
            ...base,
            type: 'object',
            fields,
            isEmptyContainer: fields.length === 0
        };
    }

    // Primitive (string / number). Cast to String so 0 / false-y numbers show.
    return { ...base, type: 'primitive', displayValue: String(value) };
}

/** Build nodes for every own key of an object. */
export function buildNodes(obj, parentPath) {
    if (!isPlainObject(obj)) return [];
    return Object.keys(obj).map((key) =>
        buildNode(key, obj[key], parentPath ? `${parentPath}.${key}` : key)
    );
}

/**
 * Split a section's fields into "detail" leaf fields and "complex" fields
 * that deserve their own tab (nested objects and arrays-of-objects).
 *
 * @returns {{ detailFields: object[], complexTabs: object[] }}
 */
export function buildSection(sectionKey, sectionData) {
    const detailFields = [];
    const complexTabs = [];

    if (!isPlainObject(sectionData)) {
        return { detailFields, complexTabs };
    }

    Object.keys(sectionData).forEach((key) => {
        const value = sectionData[key];
        const node = buildNode(key, value, `${sectionKey}.${key}`);
        if (node.type === 'object' || node.type === 'arrayOfObjects') {
            complexTabs.push({
                label: formatLabel(key),
                value: key,
                node
            });
        } else {
            detailFields.push(node);
        }
    });

    return { detailFields, complexTabs };
}

/**
 * Known OmniScript / OmniProcess envelope keys that carry runtime and session
 * metadata rather than form data. These are dropped from the rendered output.
 * Matched case-insensitively so minor casing differences don't leak through.
 */
export const OMNISCRIPT_HEADER_KEYS = [
    'omniscriptId',
    'omniProcessId',
    'sId',
    'id',
    'contextId',
    'runMode',
    'theme',
    'type',
    'subType',
    'language',
    'LanguageCode',
    'userProfile',
    'userName',
    'userId',
    'userTimeZone',
    'userTimeZoneName',
    'userCurrencyCode',
    'localTimeZoneName',
    'timeStamp',
    'lwcId',
    'dMImdSData',
    'scriptHeaderDef'
];

/** Parse a comma/semicolon/newline separated string into a list of keys. */
export function parseKeyList(str) {
    if (!str) return [];
    return String(str)
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/** Resolve a dotted path (e.g. "PersonalDetails" or "a.b") within an object. */
export function resolvePath(root, path) {
    if (!path) return root;
    let current = root;
    for (const part of parseKeyList(path.replace(/\./g, ','))) {
        if (!isPlainObject(current)) return undefined;
        current = current[part];
    }
    return current;
}

/**
 * Decide which top-level keys of the parsed JSON should become sections.
 *
 * Default behaviour (tuned for OmniScript data JSON):
 *   - if a rootPath is given, drill into that node first;
 *   - drop known OmniScript header keys plus any admin-supplied excludeKeys;
 *   - keep only keys whose value is an object or array-of-objects
 *     (this alone removes the entire scalar OmniScript envelope), unless
 *     includeScalars is true.
 *
 * @param {object} root parsed JSON object
 * @param {object} [opts]
 * @param {string} [opts.rootPath] optional dotted path to render from
 * @param {string[]} [opts.excludeKeys] extra keys to drop
 * @param {boolean} [opts.includeScalars] keep top-level scalar keys as well
 * @returns {{ data: object, keys: string[] }} the effective data object and
 *          the ordered list of section keys to render
 */
export function resolveSections(root, opts) {
    const options = opts || {};
    const data = options.rootPath ? resolvePath(root, options.rootPath) : root;

    if (!isPlainObject(data)) {
        return { data: {}, keys: [] };
    }

    const blocked = new Set(
        [...OMNISCRIPT_HEADER_KEYS, ...(options.excludeKeys || [])].map((k) =>
            String(k).toLowerCase()
        )
    );

    const keys = Object.keys(data).filter((key) => {
        if (blocked.has(key.toLowerCase())) return false;
        const value = data[key];
        if (options.includeScalars) return true;
        return isPlainObject(value) || isArrayOfObjects(value);
    });

    return { data, keys };
}

/**
 * OmniScript display-formatted answer set.
 *
 * OmniScript stores a flat map of the user-facing answers under
 * `OmniScriptFmtData`, keyed as "step:block|index:field" with already
 * display-formatted (string) values. This is a far cleaner render source than
 * the raw working-state tree: it contains only the form fields the user saw,
 * with human-formatted values and no session/runtime noise.
 *
 * `parseFmtData` turns that flat map into a nested object shaped
 *   { step: { block (or "Block (n)" for repeats): { field: value } } }
 * so it flows through resolveSections -> buildSection -> the renderer
 * unchanged. Empty values are preserved as-is (blank strings), never coerced
 * to "N/A".
 */
export const OMNISCRIPT_FMT_KEY = 'OmniScriptFmtData';

const FMT_KEY_RE = /^([^:]+):([^|]+)\|(\d+):(.+)$/;

/**
 * @param {object} fmt the OmniScriptFmtData map (flat string key -> value)
 * @returns {object} nested step -> block -> field tree
 */
export function parseFmtData(fmt) {
    const tree = {};
    if (!isPlainObject(fmt)) return tree;

    Object.keys(fmt).forEach((rawKey) => {
        const m = rawKey.match(FMT_KEY_RE);
        // Keys that don't match the expected shape are dropped rather than
        // rendered as noise; they aren't user-facing form answers.
        if (!m) return;

        const [, step, block, index, field] = m;
        const idx = parseInt(index, 10);
        // Suffix repeated instances so a block that appears more than once
        // (index 2, 3, ...) stays visually distinct.
        const blockKey = idx > 1 ? `${block} (${idx})` : block;

        if (!tree[step]) tree[step] = {};
        if (!tree[step][blockKey]) tree[step][blockKey] = {};
        tree[step][blockKey][field] = fmt[rawKey];
    });

    return tree;
}

/**
 * Locate the OmniScriptFmtData node within a parsed payload (case-insensitive)
 * and parse it into a step -> block -> field tree.
 *
 * @param {object} root parsed JSON payload
 * @returns {{ data: object, keys: string[] }|null} render-ready structure, or
 *          null when the payload has no OmniScriptFmtData node.
 */
export function resolveFmtSections(root) {
    if (!isPlainObject(root)) return null;

    const fmtKey = Object.keys(root).find(
        (k) => k.toLowerCase() === OMNISCRIPT_FMT_KEY.toLowerCase()
    );
    if (!fmtKey || !isPlainObject(root[fmtKey])) return null;

    const data = parseFmtData(root[fmtKey]);
    return { data, keys: Object.keys(data) };
}
