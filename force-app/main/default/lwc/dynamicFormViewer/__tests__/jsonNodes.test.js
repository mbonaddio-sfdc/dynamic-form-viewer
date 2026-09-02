import {
    formatLabel,
    buildNode,
    buildNodes,
    buildSection,
    resolveSections,
    resolvePath,
    parseKeyList,
    parseFmtData,
    resolveFmtSections,
    formatFileSize
} from '../jsonNodes';

const OMNI_SAMPLE = {
    omniscriptId: '0jN',
    language: 'English',
    type: 'Recruitment',
    subType: 'ApplicantPersonalDetails',
    sId: '0jN',
    runMode: 'preview',
    theme: 'lightning',
    LanguageCode: 'en_US',
    userProfile: 'System Administrator',
    timeStamp: '2026-08-07T0236.176Z',
    userTimeZoneName: 'America/New_York',
    userId: '005',
    omniProcessId: '0jN',
    localTimeZoneName: 'Australia/Sydney',
    PersonalDetails: {
        FirstName: 'Michael',
        LastName: 'Bonaddio',
        CurrentAddress: { CurrentCity: 'Melbourne', CurrentState: 'VIC' }
    }
};

describe('formatLabel', () => {
    it('splits camelCase and capitalizes', () => {
        expect(formatLabel('firstName')).toBe('First Name');
    });

    it('handles unit suffixes', () => {
        expect(formatLabel('height_m')).toBe('Height (m)');
        expect(formatLabel('power_kW')).toBe('Power (kW)');
        expect(formatLabel('duration_days')).toBe('Duration (days)');
    });

    it('title-cases words separated by _ or -', () => {
        expect(formatLabel('applicant_full-name')).toBe('Applicant Full Name');
    });

    it('is safe on empty input', () => {
        expect(formatLabel('')).toBe('');
        expect(formatLabel(null)).toBe('');
    });
});

describe('buildNode type detection', () => {
    it('detects primitives and stringifies numbers', () => {
        const node = buildNode('count', 0);
        expect(node.type).toBe('primitive');
        expect(node.displayValue).toBe('0'); // falsy number must still show
    });

    it('detects booleans as Yes/No', () => {
        expect(buildNode('active', true).displayValue).toBe('Yes');
        expect(buildNode('active', false).displayValue).toBe('No');
    });

    it('detects ISO dates', () => {
        expect(buildNode('created', '2026-01-15T09:30:00Z').type).toBe('date');
        expect(buildNode('created', '2026-01-15').type).toBe('date');
        expect(buildNode('note', 'not a date').type).toBe('primitive');
    });

    it('treats null/undefined/empty string as empty', () => {
        expect(buildNode('x', null).type).toBe('empty');
        expect(buildNode('x', undefined).type).toBe('empty');
        expect(buildNode('x', '').type).toBe('empty');
    });

    it('detects simple arrays', () => {
        const node = buildNode('tags', ['a', 'b']);
        expect(node.type).toBe('simpleArray');
        expect(node.hasItems).toBe(true);
        expect(node.items.map((i) => i.value)).toEqual(['a', 'b']);
    });

    it('detects arrays of objects', () => {
        const node = buildNode('lines', [{ item: 'Widget', qty: 2 }]);
        expect(node.type).toBe('arrayOfObjects');
        expect(node.items).toHaveLength(1);
        expect(node.items[0].title).toBe('Widget');
        expect(node.items[0].fields.map((f) => f.label)).toEqual([
            'Item',
            'Qty'
        ]);
    });

    it('falls back to indexed title for array objects without a name', () => {
        const node = buildNode('lines', [{ qty: 2 }]);
        expect(node.items[0].title).toBe('Item 1');
    });

    it('detects nested objects', () => {
        const node = buildNode('address', { city: 'Melbourne' });
        expect(node.type).toBe('object');
        expect(node.fields[0].label).toBe('City');
    });
});

describe('deep nesting', () => {
    it('recurses to arbitrary depth without dropping data', () => {
        const value = {
            level1: {
                level2: {
                    level3: {
                        deepValue: 'found me'
                    }
                }
            }
        };
        const node = buildNode('root', value);
        const l1 = node.fields[0];
        const l2 = l1.fields[0];
        const l3 = l2.fields[0];
        const leaf = l3.fields[0];
        expect(l1.type).toBe('object');
        expect(leaf.type).toBe('primitive');
        expect(leaf.displayValue).toBe('found me');
    });

    it('handles arrays of objects containing nested objects', () => {
        const node = buildNode('orders', [
            { name: 'A', ship: { to: { city: 'Sydney' } } }
        ]);
        const shipField = node.items[0].fields.find(
            (f) => f.label === 'Ship'
        );
        expect(shipField.type).toBe('object');
        const toField = shipField.fields[0];
        expect(toField.fields[0].displayValue).toBe('Sydney');
    });

    it('produces unique keys across nesting', () => {
        const node = buildNode('root', { a: { b: 1 }, c: { b: 2 } });
        const keys = node.fields.map((f) => f.key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('buildNodes', () => {
    it('returns [] for non-objects', () => {
        expect(buildNodes(null)).toEqual([]);
        expect(buildNodes('str')).toEqual([]);
        expect(buildNodes(42)).toEqual([]);
    });
});

describe('buildSection', () => {
    it('splits leaf fields from complex tabs', () => {
        const section = {
            name: 'Acme',
            active: true,
            address: { city: 'Perth' },
            lines: [{ item: 'X' }]
        };
        const { detailFields, complexTabs } = buildSection('company', section);
        expect(detailFields.map((f) => f.label)).toEqual(['Name', 'Active']);
        expect(complexTabs.map((t) => t.label)).toEqual(['Address', 'Lines']);
        expect(complexTabs[0].node.type).toBe('object');
        expect(complexTabs[1].node.type).toBe('arrayOfObjects');
    });

    it('is safe when section data is not an object', () => {
        const { detailFields, complexTabs } = buildSection('x', null);
        expect(detailFields).toEqual([]);
        expect(complexTabs).toEqual([]);
    });
});

describe('parseKeyList', () => {
    it('splits on comma, semicolon and newline and trims', () => {
        expect(parseKeyList('a, b;c\n d ')).toEqual(['a', 'b', 'c', 'd']);
    });
    it('returns [] for empty input', () => {
        expect(parseKeyList('')).toEqual([]);
        expect(parseKeyList(null)).toEqual([]);
    });
});

describe('resolvePath', () => {
    it('returns the root when no path given', () => {
        const root = { a: 1 };
        expect(resolvePath(root, '')).toBe(root);
    });
    it('drills into a dotted path', () => {
        expect(resolvePath({ a: { b: { c: 7 } } }, 'a.b')).toEqual({ c: 7 });
    });
    it('returns undefined for a missing path', () => {
        expect(resolvePath({ a: 1 }, 'a.b')).toBeUndefined();
    });
});

describe('resolveSections (OmniScript filtering)', () => {
    it('renders only object/array sections and drops the OmniScript header', () => {
        const { keys } = resolveSections(OMNI_SAMPLE, {});
        expect(keys).toEqual(['PersonalDetails']);
    });

    it('never leaks known header keys', () => {
        const { keys } = resolveSections(OMNI_SAMPLE, {});
        [
            'userId',
            'timeStamp',
            'userProfile',
            'omniscriptId',
            'runMode',
            'theme',
            'sId'
        ].forEach((k) => expect(keys).not.toContain(k));
    });

    it('honours a rootPath drill-in', () => {
        const { data, keys } = resolveSections(OMNI_SAMPLE, {
            rootPath: 'PersonalDetails'
        });
        expect(keys).toEqual(['CurrentAddress']);
        expect(data.FirstName).toBe('Michael');
    });

    it('includeScalars keeps top-level primitive keys too', () => {
        const { keys } = resolveSections(OMNI_SAMPLE, {
            rootPath: 'PersonalDetails',
            includeScalars: true
        });
        expect(keys).toContain('FirstName');
        expect(keys).toContain('CurrentAddress');
    });

    it('applies extra excludeKeys on top of the header list', () => {
        const { keys } = resolveSections(OMNI_SAMPLE, {
            excludeKeys: ['PersonalDetails']
        });
        expect(keys).toEqual([]);
    });

    it('matches header keys case-insensitively', () => {
        const { keys } = resolveSections(
            { TimeStamp: 'x', Details: { a: 1 } },
            {}
        );
        expect(keys).toEqual(['Details']);
    });

    it('returns empty for a non-object root', () => {
        expect(resolveSections(null, {})).toEqual({ data: {}, keys: [] });
        expect(resolveSections('str', {})).toEqual({ data: {}, keys: [] });
    });
});

describe('parseFmtData (OmniScriptFmtData flat map)', () => {
    const FMT = {
        'personalDetails:legalName|1:personTitle': 'Dr',
        'personalDetails:birthDetailsBlock|1:dateOfBirth': '01-01-1990',
        'personalDetails:birthDetailsBlock|1:stateOfBirth': '',
        'personalDetails:ATSQuestionBlock|1:IndigenousStatus': 'No',
        'residentialAddress:existingResidential|1:updateResidential': 'No',
        'principalPlaceOfPracticeAddress:ppp|1:updateAddress': 'No'
    };

    it('parses step:block|index:field into a nested tree', () => {
        const tree = parseFmtData(FMT);
        expect(Object.keys(tree)).toEqual([
            'personalDetails',
            'residentialAddress',
            'principalPlaceOfPracticeAddress'
        ]);
        expect(tree.personalDetails.legalName.personTitle).toBe('Dr');
        expect(tree.personalDetails.birthDetailsBlock.dateOfBirth).toBe(
            '01-01-1990'
        );
    });

    it('preserves empty values as blank, never coerces to N/A', () => {
        const tree = parseFmtData(FMT);
        expect(tree.personalDetails.birthDetailsBlock.stateOfBirth).toBe('');
    });

    it('suffixes repeated block instances with their index', () => {
        const tree = parseFmtData({
            'step:qual|1:name': 'A',
            'step:qual|2:name': 'B'
        });
        expect(tree.step.qual.name).toBe('A');
        expect(tree.step['qual (2)'].name).toBe('B');
    });

    it('drops keys that do not match the expected shape', () => {
        const tree = parseFmtData({ garbage: 'x', 'a:b|1:c': 'y' });
        expect(tree.garbage).toBeUndefined();
        expect(tree.a.b.c).toBe('y');
    });

    it('is safe on non-object input', () => {
        expect(parseFmtData(null)).toEqual({});
        expect(parseFmtData('str')).toEqual({});
    });
});

describe('resolveFmtSections', () => {
    it('finds OmniScriptFmtData and returns step keys', () => {
        const { data, keys } = resolveFmtSections({
            runMode: 'preview',
            OmniScriptFmtData: {
                'personalDetails:legalName|1:personTitle': 'Dr'
            }
        });
        expect(keys).toEqual(['personalDetails']);
        expect(data.personalDetails.legalName.personTitle).toBe('Dr');
    });

    it('matches the node name case-insensitively', () => {
        const res = resolveFmtSections({
            omniscriptfmtdata: { 'a:b|1:c': 'y' }
        });
        expect(res.keys).toEqual(['a']);
    });

    it('returns null when there is no OmniScriptFmtData node', () => {
        expect(resolveFmtSections({ personalDetails: {} })).toBeNull();
        expect(resolveFmtSections(null)).toBeNull();
    });

    it('produces a tree buildSection turns into block tabs', () => {
        const { data, keys } = resolveFmtSections({
            OmniScriptFmtData: {
                'personalDetails:legalName|1:personTitle': 'Dr',
                'personalDetails:legalName|1:firstName': 'Michael'
            }
        });
        const { detailFields, complexTabs } = buildSection(
            keys[0],
            data[keys[0]]
        );
        expect(detailFields).toEqual([]);
        expect(complexTabs.map((t) => t.label)).toEqual(['Legal Name']);
        expect(complexTabs[0].node.fields.map((f) => f.label)).toEqual([
            'Person Title',
            'First Name'
        ]);
    });
});

describe('formatFileSize', () => {
    it('formats bytes/KB/MB', () => {
        expect(formatFileSize(512)).toBe('512 B');
        expect(formatFileSize(5385)).toBe('5.3 KB');
        expect(formatFileSize(192044)).toBe('187.5 KB');
        expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });

    it('returns empty for non-numeric/negative sizes', () => {
        expect(formatFileSize(undefined)).toBe('');
        expect(formatFileSize('abc')).toBe('');
        expect(formatFileSize(-5)).toBe('');
    });
});

describe('OmniScript File-element detection', () => {
    const standardFile = [
        {
            data: '0693g000000T1ZFAA0',
            filename: 'passport.pdf',
            vId: '0683g000000T11iAAC',
            size: 5385
        }
    ];

    it('detects a standard single-file upload as a file node', () => {
        const node = buildNode('SupportingDocuments', standardFile, 'Step.SD');
        expect(node.type).toBe('file');
        expect(node.files).toHaveLength(1);
        const f = node.files[0];
        expect(f.filename).toBe('passport.pdf');
        expect(f.documentId).toBe('0693g000000T1ZFAA0');
        expect(f.versionId).toBe('0683g000000T11iAAC');
        expect(f.canPreview).toBe(true);
        expect(f.downloadUrl).toBe(
            '/sfc/servlet.shepherd/document/download/0693g000000T1ZFAA0'
        );
        expect(f.sizeLabel).toBe('5.3 KB');
    });

    it('file detection wins over array-of-objects', () => {
        expect(buildNode('Docs', standardFile).type).toBe('file');
    });

    it('handles multiple files', () => {
        const node = buildNode('Docs', [
            {
                data: '069000000000001AAA',
                filename: 'a.pdf',
                vId: '068000000000001AAA',
                size: 100
            },
            {
                data: '069000000000002AAA',
                filename: 'b.pdf',
                vId: '068000000000002AAA',
                size: 2048
            }
        ]);
        expect(node.type).toBe('file');
        expect(node.files).toHaveLength(2);
    });

    it('falls back to a version download link when only a 068 is present (guest upload)', () => {
        const node = buildNode('IdDoc', [
            { vId: '0683g000000T11iAAC', filename: 'licence.pdf', size: 900 }
        ]);
        expect(node.type).toBe('file');
        expect(node.files[0].canPreview).toBe(false);
        expect(node.files[0].downloadUrl).toBe(
            '/sfc/servlet.shepherd/version/download/0683g000000T11iAAC'
        );
    });

    it('does not misread a plain object with a non-069 data key as a file', () => {
        const node = buildNode('Config', [{ data: 'some config', other: 1 }]);
        expect(node.type).toBe('arrayOfObjects');
    });

    it('empty / null uploads stay blank, not file', () => {
        expect(buildNode('Docs', []).type).toBe('simpleArray');
        expect(buildNode('Docs', null).type).toBe('empty');
    });

    it('routes a file node into detailFields, not complexTabs', () => {
        const { detailFields, complexTabs } = buildSection('Step', {
            Notes: 'hi',
            SupportingDocuments: standardFile
        });
        expect(detailFields.some((f) => f.type === 'file')).toBe(true);
        expect(complexTabs.some((t) => t.node.type === 'file')).toBe(false);
    });
});
