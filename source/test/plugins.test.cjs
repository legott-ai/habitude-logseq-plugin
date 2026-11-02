'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const portable = require('../portable.cjs');
const { registerJoplin } = require('../joplin/index.cjs');
const { registerLogseq } = require('../logseq/index.cjs');

const note = () => ({ id: 'ABCDEF0123456789ABCDEF0123456789', title: '합성 기록 "Example"', body: '# 원문\n- [x] written checkbox\n![source](:/0123456789abcdef0123456789abcdef)', markup_language: 1, encryption_applied: 0, created_time: 1793613600000, updated_time: 1793615400000 });
const page = () => ({ uuid: '01234567-89ab-cdef-0123-456789abcdef', name: 'example', originalName: '예시 & Example', format: 'markdown', type: 'page', createdAt: 1793613600000, updatedAt: 1793615400000 });
const blocks = () => [{ uuid: 'aaaaaaaa-1111-2222-3333-444444444444', content: 'TODO 합성 글\ncontinued **original**', children: [{ uuid: 'bbbbbbbb-1111-2222-3333-444444444444', content: '- [x] 원문 체크박스 ((source))' }] }];
const graph = () => ({ name: 'Synthetic graph', path: '/synthetic/graph', url: 'logseq_local_/synthetic/graph' });

test('native identity, true source timestamps and exact Joplin body survive export', () => {
  const original = note(), before = JSON.stringify(original), result = portable.fromJoplinNote(original, 42);
  assert.equal(result.id, original.id.toLowerCase());
  assert.ok(result.markdown.endsWith('\n\n' + original.body));
  assert.ok(result.markdown.includes('habitude_source: joplin\n'));
  assert.ok(result.markdown.includes('title: ' + JSON.stringify(original.title)));
  assert.ok(result.markdown.includes('created: "2026-11-02T10:00:00.000Z"'));
  assert.equal(result.filename, `habitude-joplin-${original.id.toLowerCase()}-42.md`);
  assert.equal(JSON.stringify(original), before);
});
test('export time never becomes an unknown source creation time', () => {
  const original = page(); delete original.createdAt; delete original.updatedAt;
  const result = portable.fromLogseqPage(original, blocks(), graph(), 99);
  assert.ok(!result.markdown.includes('\ncreated:'));
  assert.ok(!result.markdown.includes('\nupdated:'));
  assert.ok(result.filename.endsWith('-99.md'));
});
test('Logseq exports a deterministic block outline and preserves block contents and stable UUID', () => {
  const data = blocks(), before = JSON.stringify(data);
  const result = portable.fromLogseqPage(page(), data, graph(), 1);
  assert.equal(result.body, '- TODO 합성 글\n  continued **original**\n  - - [x] 원문 체크박스 ((source))');
  assert.ok(result.markdown.includes('habitude_source_id: "01234567-89ab-cdef-0123-456789abcdef"'));
  assert.ok(result.markdown.includes('source_url: "logseq://graph/Synthetic%20graph?page='));
  assert.equal(JSON.stringify(data), before);
});
test('unsupported or incomplete sources fail before output exists', () => {
  for (const original of [{ ...note(), id: '../../bad' }, { ...note(), markup_language: 2 }, { ...note(), encryption_applied: 1 }, { ...note(), title: 'bad\ntitle' }]) assert.throws(() => portable.fromJoplinNote(original));
  for (const original of [{ ...page(), format: 'org' }, { ...page(), type: 'whiteboard' }, { ...page(), uuid: '' }]) assert.throws(() => portable.fromLogseqPage(original, blocks(), graph()));
  assert.throws(() => portable.fromLogseqPage(page(), [[1, 'unresolved-child']], graph()));
});
test('bounded Unicode bytes, lines, trees and cycles reject partial export', () => {
  assert.throws(() => portable.fromJoplinNote({ ...note(), body: '가'.repeat(400000) }));
  assert.throws(() => portable.fromJoplinNote({ ...note(), body: '\r'.repeat(30000) }));
  const cyclic = blocks(); cyclic[0].children = cyclic;
  assert.throws(() => portable.serializeBlocks(cyclic));
  assert.throws(() => portable.serializeBlocks(Array(2001).fill(blocks()[0])));
  assert.equal(portable.escapeHtml('<img onerror="x"> &'), '&lt;img onerror=&quot;x&quot;&gt; &amp;');
});

async function joplinHarness(options = {}) {
  const commands = new Map(), writes = [], dialogs = [], messages = [], external = [], calls = { selected: 0 };
  const source = options.source === undefined ? note() : options.source;
  const host = {
    plugins: { register: ({ onStart }) => onStart() },
    settings: { registerSection: async () => {}, registerSettings: async () => {}, value: async () => options.language || 'en' },
    workspace: { selectedNote: async () => { calls.selected++; return source; } },
    commands: { register: async command => { commands.set(command.name, command); }, execute: async (...args) => { external.push(args); } },
    views: { dialogs: { create: async () => 'review', setHtml: async (_id, html) => { dialogs.push(html); }, setButtons: async () => {}, open: async () => options.open ? options.open() : ({ id: options.confirm === false ? 'cancel' : 'ok' }), showOpenDialog: async () => options.folders === undefined ? ['/synthetic'] : options.folders, showMessageBox: async text => { messages.push(text); } }, menuItems: { create: async () => {} }, toolbarButtons: { create: async () => {} } },
    require: name => { assert.equal(name, 'fs-extra'); return { writeFile: async (...args) => { writes.push(args); if (options.writeError) throw options.writeError; } }; },
  };
  await registerJoplin(host, portable);
  return { source, commands, writes, dialogs, messages, external, calls, export: () => commands.get('habitudeExportSelected').execute() };
}
test('Joplin does not read notes until the export command and cancellation writes nothing', async () => {
  const h = await joplinHarness({ confirm: false });
  assert.equal(h.calls.selected, 0); await h.export();
  assert.equal(h.calls.selected, 1); assert.equal(h.writes.length, 0);
  assert.equal(h.dialogs.at(-1), '');
});
test('Joplin requires a folder and uses exclusive private UTF-8 file creation without editing notes', async () => {
  const h = await joplinHarness(), before = JSON.stringify(h.source);
  await h.export(); assert.equal(h.writes.length, 1);
  const [target, contents, options] = h.writes[0];
  assert.ok(target.startsWith('/synthetic/habitude-joplin-abcdef'));
  assert.deepEqual(options, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  assert.ok(contents.endsWith(h.source.body)); assert.equal(JSON.stringify(h.source), before);
  assert.equal(h.external.length, 0);
  const cancelled = await joplinHarness({ folders: null }); await cancelled.export(); assert.equal(cancelled.writes.length, 0);
});
test('Joplin review escapes the title and never keeps it in the hidden dialog', async () => {
  const h = await joplinHarness({ source: { ...note(), title: '<img src=x onerror=bad()>' } });
  await h.export(); assert.ok(h.dialogs[0].includes('&lt;img')); assert.ok(!h.dialogs[0].includes('<img'));
  assert.equal(h.dialogs.at(-1), '');
});
test('Joplin emits finite errors, handles no selection, blocks traversal folder and never overwrites', async () => {
  const raw = new Error('private original body or path'); raw.code = 'EEXIST';
  const h = await joplinHarness({ writeError: raw }); await h.export();
  assert.ok(h.messages.at(-1).includes('already exists')); assert.ok(!h.messages.join().includes('private original'));
  const no = await joplinHarness({ source: null }); await no.export(); assert.equal(no.writes.length, 0);
  const path = await joplinHarness({ folders: ['relative-folder'] }); await path.export(); assert.equal(path.writes.length, 0);
});
test('Joplin rejects a second action while review is pending and opens Habitude with no note parameters', async () => {
  let resolve; const h = await joplinHarness({ open: () => new Promise(done => { resolve = done; }) });
  const first = h.export();
  while (!resolve) await new Promise(done => setImmediate(done));
  await h.export(); assert.equal(h.calls.selected, 1);
  resolve({ id: 'cancel' }); await first;
  await h.commands.get('habitudeOpen').execute();
  assert.deepEqual(h.external, [['openItem', 'https://habitude.ai']]);
});

async function logseqHarness(options = {}) {
  const commands = new Map(), models = {}, hooks = {}, downloads = [], blobs = [], external = [], copied = [], updates = [];
  const calls = { page: 0, blocks: 0, graph: 0, editing: 0, db: 0, info: 0 };
  let currentUI = null;
  const doc = { createElement: tag => { assert.equal(tag, 'a'); const link = { remove() {} }; link.click = () => { downloads.push({ href: link.href, filename: link.download }); }; return link; }, body: { appendChild: () => {} } };
  const env = { Blob, URL: { createObjectURL: blob => { blobs.push(blob); return 'blob:synthetic'; }, revokeObjectURL: () => {} }, setTimeout: callback => callback(), navigator: { clipboard: { writeText: async data => { if (options.clipboardDenied) throw new Error('not focused'); copied.push(data); } } } };
  const host = {
    settings: { language: 'en' }, useSettingsSchema() {}, updateSettings(value) { Object.assign(this.settings, value); },
    showMainUI() { throw new Error('Full-screen iframe must not be shown'); }, hideMainUI() { throw new Error('Full-screen iframe must not be hidden'); },
    provideUI: value => { updates.push(value); currentUI = value.template === null ? null : value; },
    on: (key, value) => { hooks[key] = value; }, beforeunload: callback => { hooks.unload = callback; }, provideModel: value => { Object.assign(models, value); },
    App: { getInfo: async () => { calls.info++; return options.info === undefined ? { version: '0.11.0', supportDb: true } : options.info; }, checkCurrentIsDbGraph: async () => { calls.db++; if (options.dbError) throw options.dbError; return Object.hasOwn(options, 'db') ? options.db : false; }, getCurrentGraph: async () => { calls.graph++; return options.graph ? options.graph(calls.graph) : graph(); }, registerCommandPalette: (details, callback) => { commands.set(details.key, callback); }, registerUIItem: () => {}, openExternalLink: async url => { external.push(url); } },
    Editor: { checkEditing: async () => { calls.editing++; return !!options.editing; }, getCurrentPage: async () => { calls.page++; if (options.page) return options.page(calls.page); return page(); }, getCurrentPageBlocksTree: async () => { calls.blocks++; return options.blocks ? options.blocks(calls.blocks) : blocks(); } },
  };
  if (options.dbAPIAbsent) delete host.App.checkCurrentIsDbGraph;
  await registerLogseq(host, portable, doc, env);
  const click = async id => { await models[({ download: 'downloadMarkdown', copy: 'copyMarkdown', open: 'openHabitude', close: 'closeExporter' })[id]](); };
  const template = () => currentUI ? currentUI.template : '';
  const downloadEnabled = () => { const match = template().match(/<button\b[^>]*data-on-click="downloadMarkdown"[^>]*>/); return !!match && !/\sdisabled(?:\s|>)/.test(match[0]); };
  return { commands, hooks, updates, downloads, blobs, copied, external, calls, click, open: models.openExporter, host, models, template, downloadEnabled };
}
test('Logseq reads no graph at startup, then exports only the open page after explicit confirmation', async () => {
  const h = await logseqHarness(); assert.deepEqual(Object.values(h.calls), [0, 0, 0, 0, 0, 0]); assert.equal(h.template(), '');
  await h.open(); assert.equal(h.downloads.length, 0); assert.equal(h.downloadEnabled(), true);
  await h.click('download'); assert.equal(h.downloads.length, 1);
  assert.ok((await h.blobs[0].text()).includes('habitude_source: logseq'));
  assert.ok(h.downloads[0].filename.startsWith('habitude-logseq-01234567'));
  assert.equal(h.external.length, 0);
});
test('Logseq refuses DB graphs and active editing before reading the page', async () => {
  for (const options of [{ db: true }, { editing: true }]) {
    const h = await logseqHarness(options); await h.open(); await h.click('download');
    assert.equal(h.calls.page, 0); assert.equal(h.downloads.length, 0); assert.equal(h.downloadEnabled(), false);
  }
});
test('Logseq 0.10.15 file graph exports without calling an unavailable DB API or SDK proxy stub', async () => {
  for (const options of [{ dbAPIAbsent: true }, { dbError: new Error('absent host method exposed by SDK proxy') }]) {
    const h = await logseqHarness({ info: { version: '0.10.15' }, ...options });
    await h.open(); assert.equal(h.calls.db, 0); assert.equal(h.calls.page, 2);
    assert.equal(h.downloadEnabled(), true);
    await h.click('download'); assert.equal(h.downloads.length, 1);
  }
});
test('Logseq never treats a missing or indeterminate DB API as proof of a file graph', async () => {
  const invalid = [null, { name: 'DB', path: '/synthetic/graph', url: 'logseq_db_graph-id' }, { ...graph(), url: 'logseq_local_/different' }, { ...graph(), path: 'relative', url: 'logseq_local_relative' }, { ...graph(), path: '/bad\npath', url: 'logseq_local_/bad\npath' }];
  for (const data of invalid) {
    const h = await logseqHarness({ info: { version: '0.10.15' }, dbAPIAbsent: true, graph: () => data });
    await h.open(); assert.equal(h.calls.page, 0); assert.equal(h.downloadEnabled(), false);
  }
  for (const options of [{ info: { version: 'unknown' }, dbAPIAbsent: true }, { info: { version: '0.10.14' }, dbAPIAbsent: true }, { db: undefined }, { db: null }, { db: 0 }, { info: { version: '0.10.15', supportDb: true }, dbAPIAbsent: true }, { info: { version: '0.10.15', supportDb: 'false' }, dbAPIAbsent: true }]) {
    const h = await logseqHarness(options); await h.open();
    assert.equal(h.calls.page, 0); assert.equal(h.downloadEnabled(), false);
  }
});
test('Logseq 0.10.15 missing page format requires every source block to prove Markdown', async () => {
  const legacyPage = () => { const value = page(); delete value.format; return value; };
  const md = () => [{ ...blocks()[0], format: 'markdown', children: [{ ...blocks()[0].children[0], format: 'markdown' }] }];
  const original = legacyPage(), before = JSON.stringify(original);
  const h = await logseqHarness({ info: { version: '0.10.15' }, dbAPIAbsent: true, page: () => original, blocks: md });
  await h.open(); assert.equal(h.downloadEnabled(), true); assert.equal(JSON.stringify(original), before);
  for (const value of [[], blocks(), [{ ...md()[0], format: 'org' }], [{ ...md()[0], children: [{ ...md()[0].children[0], format: undefined }] }]]) {
    const no = await logseqHarness({ info: { version: '0.10.15' }, dbAPIAbsent: true, page: legacyPage, blocks: () => value });
    await no.open(); assert.equal(no.downloadEnabled(), false);
  }
  const modern = await logseqHarness({ page: legacyPage, blocks: md });
  await modern.open(); assert.equal(modern.downloadEnabled(), false);
});
test('Logseq rejects a graph switch even when both graphs have identical page metadata and text', async () => {
  const h = await logseqHarness({ graph: call => call === 1 ? graph() : { ...graph(), path: '/synthetic/other', url: 'logseq_local_/synthetic/other' } });
  await h.open(); assert.ok(h.template().includes('changed'));
  assert.equal(h.calls.page, 1); assert.equal(h.downloadEnabled(), false);
});
test('Logseq rejects a source changed during the two reads without partial output', async () => {
  const h = await logseqHarness({ blocks: call => call === 1 ? blocks() : [{ ...blocks()[0], content: 'changed during request' }] });
  await h.open(); assert.ok(h.template().includes('changed'));
  await h.click('download'); assert.equal(h.downloads.length, 0);
});
test('Logseq close invalidates a late request and removes only its keyed private review', async () => {
  let resolve; const h = await logseqHarness({ page: call => call === 1 ? new Promise(done => { resolve = done; }) : page() });
  const opening = h.open(); while (!resolve) await new Promise(done => setImmediate(done));
  await h.click('close'); resolve(page()); await opening;
  assert.equal(h.template(), ''); assert.equal(h.downloadEnabled(), false);
  assert.ok(h.updates.every(ui => ui.key === 'habitude-export-review' && ui.path === 'body'));
  assert.equal(h.updates.at(-1).template, null);
});
test('Logseq native review escapes hostile title and textarea closing content', async () => {
  const original = { ...page(), originalName: '<img src=x onerror="bad()">' }, data = [{ ...blocks()[0], content: '</textarea><script>bad()</script>', children: [] }];
  const h = await logseqHarness({ page: () => original, blocks: () => data }); await h.open();
  assert.ok(h.template().includes('&lt;img')); assert.ok(h.template().includes('&lt;/textarea&gt;&lt;script&gt;'));
  assert.ok(!h.template().includes('<img')); assert.ok(!h.template().includes('<script>'));
  await h.click('download'); assert.ok((await h.blobs[0].text()).includes(data[0].content));
});
test('Logseq native Close and reopen retain source and never leave a hidden export accessible', async () => {
  const original = page(), data = blocks(), before = JSON.stringify({ original, data });
  const h = await logseqHarness({ page: () => original, blocks: () => data });
  for (let cycle = 0; cycle < 2; cycle++) {
    await h.open(); assert.equal(h.downloadEnabled(), true); await h.click('copy');
    await h.click('close'); assert.equal(h.template(), '');
    await h.click('download'); await h.click('copy');
    assert.equal(h.copied.length, cycle + 1); assert.equal(h.downloads.length, 0);
  }
  assert.equal(JSON.stringify({ original, data }), before);
});
test('Logseq copy denial is finite and still permits an explicit download', async () => {
  const h = await logseqHarness({ clipboardDenied: true }); await h.open(); await h.click('copy');
  assert.ok(h.template().includes('Could not copy')); assert.equal(h.copied.length, 0);
  await h.click('download'); assert.equal(h.downloads.length, 1);
});
test('Logseq copy is explicit, language changes are local, and external app link has no note content', async () => {
  const h = await logseqHarness(); await h.open(); assert.equal(h.copied.length, 0);
  await h.click('copy'); assert.equal(h.copied.length, 1);
  h.models.changeLanguage({ dataset: { language: 'ko' } });
  assert.ok(h.template().includes('Markdown 다운로드'));
  await h.click('open'); assert.deepEqual(h.external, ['https://habitude.ai']);
  await h.hooks.unload(); assert.equal(h.template(), '');
  await h.click('copy'); assert.equal(h.copied.length, 1);
});
