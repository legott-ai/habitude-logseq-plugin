// Habitude local export plugin. Runtime SDK is shipped locally.
(()=>{const portable=(()=>{const module={exports:{}};const exports=module.exports;
'use strict';

// This export envelope is shared with Habitude's explicit local file importer.
const MAX_BYTES = 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
class ExportError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function fail(code) { throw new ExportError(code); }
function bytes(text) {
  if (text.length > MAX_BYTES) fail('CONTENT_LIMIT');
  let length = 0;
  for (const character of text) {
    const point = character.codePointAt(0);
    if (point >= 0xd800 && point <= 0xdfff) fail('UNSUPPORTED_CONTENT');
    length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (length > MAX_BYTES) fail('CONTENT_LIMIT');
  }
  return length;
}
function bodyText(value) {
  if (typeof value !== 'string' || value.includes('\0') || bytes(value) > MAX_BYTES || value.split(/\r\n|\r|\n/).length > 30000) fail('CONTENT_LIMIT');
  return value;
}
function titleText(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 || /[\x00-\x1f\x7f\u2028\u2029]/.test(value)) fail('UNSUPPORTED_CONTENT');
  return value;
}
function isoDate(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}
function document(source, id, title, body, created, updated, sourceUrl, nonce) {
  const metadata = [
    '---', 'habitude_import_schema: 1', `habitude_source: ${source}`,
    `habitude_source_id: ${JSON.stringify(id)}`, `title: ${JSON.stringify(titleText(title))}`,
  ];
  if (created) metadata.push(`created: ${JSON.stringify(created)}`);
  if (updated) metadata.push(`updated: ${JSON.stringify(updated)}`);
  if (sourceUrl) metadata.push(`source_url: ${JSON.stringify(sourceUrl)}`);
  const exactBody = bodyText(body);
  const markdown = metadata.join('\n') + '\n---\n\n' + exactBody;
  if (bytes(markdown) > MAX_BYTES) fail('CONTENT_LIMIT');
  if (!Number.isSafeInteger(nonce) || nonce < 0) fail('UNSUPPORTED_CONTENT');
  return { source, id, title, body: exactBody, markdown, filename: `habitude-${source}-${id}-${nonce}.md` };
}
function fromJoplinNote(note, nonce = Date.now()) {
  if (!note || typeof note.id !== 'string' || !/^[a-f0-9]{32}$/i.test(note.id)) fail('NO_SELECTION');
  if (note.encryption_applied || note.markup_language !== 1) fail('UNSUPPORTED_CONTENT');
  const id = note.id.toLowerCase();
  return document('joplin', id, note.title, note.body, isoDate(note.created_time), isoDate(note.updated_time), `joplin://x-callback-url/openNote?id=${id}`, nonce);
}
function serializeBlocks(blocks) {
  if (!Array.isArray(blocks)) fail('UNSUPPORTED_CONTENT');
  const seen = new Set(), lines = [], pending = blocks.map(block => ({ block, depth: 0 })).reverse();
  let count = 0, length = 0;
  while (pending.length) {
    const { block, depth } = pending.pop();
    if (!block || typeof block !== 'object' || !UUID.test(block.uuid) || seen.has(block.uuid) || depth > 40 || ++count > 2000) fail('UNSUPPORTED_CONTENT');
    seen.add(block.uuid);
    if (block.format && block.format !== 'markdown') fail('UNSUPPORTED_CONTENT');
    const content = bodyText(block.content);
    const parts = content.split('\n');
    lines.push(`${'  '.repeat(depth)}- ${parts[0]}`);
    for (const part of parts.slice(1)) lines.push(`${'  '.repeat(depth + 1)}${part}`);
    length += bytes(content) + parts.length * (depth * 2 + 4);
    if (length > MAX_BYTES) fail('CONTENT_LIMIT');
    if (block.children !== undefined && !Array.isArray(block.children)) fail('UNSUPPORTED_CONTENT');
    for (const child of [...(block.children || [])].reverse()) pending.push({ block: child, depth: depth + 1 });
  }
  return bodyText(lines.join('\n'));
}
function fromLogseqPage(page, blocks, graph, nonce = Date.now()) {
  if (!page || !UUID.test(page.uuid) || typeof page.name !== 'string') fail('NO_SELECTION');
  if (page.format !== 'markdown' || ['whiteboard', 'property', 'hidden', 'class'].includes(page.type)) fail('UNSUPPORTED_CONTENT');
  if (!graph || typeof graph.name !== 'string' || !graph.name.trim() || graph.name.length > 1000) fail('UNSUPPORTED_CONTENT');
  const id = page.uuid.toLowerCase();
  const title = page.originalName || page.name;
  const url = `logseq://graph/${encodeURIComponent(graph.name)}?page=${encodeURIComponent(title)}`;
  return document('logseq', id, title, serializeBlocks(blocks), isoDate(page.createdAt), isoDate(page.updatedAt), url, nonce);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
module.exports = { ExportError, MAX_BYTES, fromJoplinNote, fromLogseqPage, serializeBlocks, escapeHtml };

return module.exports;})();const {registerLogseq}=(()=>{const module={exports:{}};const exports=module.exports;
'use strict';

const TEXT = {
  ko: {
    heading: 'Habitude로 페이지 내보내기', close: '닫기', download: 'Markdown 다운로드', copy: 'Markdown 복사', open: 'Habitude 열기', preview: '내보낼 Markdown 미리보기',
    explanation: '현재 Markdown 페이지의 블록을 목록으로 내보냅니다. 현재 Habitude 파일 가져오기는 텍스트 전용이며 첨부 참조가 있으면 미리보기에서 중단됩니다. 원문·체크박스·참조 링크를 보존하고 첨부 원본은 복사하지 않습니다.',
    next: 'Habitude 설정 → 데이터 → 파일 가져오기에서 Logseq를 선택해 이 파일을 가져오세요.',
    loading: '현재 페이지를 확인하는 중…', ready: '이 내용만 내보냅니다. 원래 페이지는 바뀌지 않습니다.',
    no: '현재 Markdown 페이지를 열고 다시 시도해 주세요.', editing: '블록 편집을 마친 뒤 다시 내보내세요.',
    unsupported: '이 페이지나 graph 형식은 아직 지원하지 않습니다. Markdown 파일 graph만 지원합니다.',
    changed: '페이지가 바뀌었습니다. 다시 내보내기를 실행해 주세요.', failed: '페이지를 내보내지 못했습니다. 원본을 유지했습니다. 다시 시도해 주세요.',
    downloaded: '다운로드를 요청했습니다. 선택한 폴더나 다운로드 폴더를 확인해 주세요.', copied: 'Markdown을 클립보드에 복사했습니다.', copyFailed: '복사하지 못했습니다. Markdown 다운로드를 사용해 주세요.',
  },
  en: {
    heading: 'Export a page for Habitude', close: 'Close', download: 'Download Markdown', copy: 'Copy Markdown', open: 'Open Habitude', preview: 'Markdown export preview',
    explanation: 'Exports the current Markdown page as a block outline. Habitude file import currently accepts text only and stops at preview if attachment references are present. Text, checkboxes and source links are preserved without copying attachments.',
    next: 'In Habitude, open Settings → Data → File import, select Logseq, and choose this file.',
    loading: 'Checking the current page…', ready: 'Only this content will be exported. The original page stays unchanged.',
    no: 'Open a Markdown page and try again.', editing: 'Finish editing the block, then export again.',
    unsupported: 'This page or graph format is not supported yet. Markdown file graphs are supported.',
    changed: 'The page changed. Run the export command again.', failed: 'Could not export the page. The original is kept. Please retry.',
    downloaded: 'Download requested. Check your selected folder or Downloads.', copied: 'Markdown copied to the clipboard.', copyFailed: 'Could not copy. Use Download Markdown instead.',
  },
};

async function registerLogseq(logseq, portable, doc, environment) {
  let snapshot = null, busy = false, generation = 0;
  const element = id => doc.getElementById(id);
  const text = () => TEXT[logseq.settings.language] || TEXT.ko;
  function status(message, error = false) { element('status').textContent = message; element('status').className = error ? 'status error' : 'status'; }
  function render() {
    const t = text();
    for (const [id, key] of [['heading', 'heading'], ['close', 'close'], ['download', 'download'], ['copy', 'copy'], ['open', 'open'], ['preview-label', 'preview'], ['explanation', 'explanation'], ['next', 'next']]) element(id).textContent = t[key];
    element('language').value = logseq.settings.language === 'en' ? 'en' : 'ko';
    element('preview').setAttribute('aria-label', t.preview);
    element('page-title').textContent = snapshot ? snapshot.title : '';
    element('preview').value = snapshot ? snapshot.markdown : '';
    element('download').disabled = element('copy').disabled = !snapshot || busy;
  }
  function clear() { generation++; snapshot = null; busy = false; render(); status(''); }
  async function openExporter() {
    if (busy) return;
    clear(); busy = true; const revision = generation;
    render(); status(text().loading); logseq.showMainUI({ autoFocus: true });
    try {
      if (await logseq.App.checkCurrentIsDbGraph()) throw new portable.ExportError('UNSUPPORTED_CONTENT');
      if (await logseq.Editor.checkEditing()) throw new portable.ExportError('EDITING');
      const graph = await logseq.App.getCurrentGraph();
      const page = await logseq.Editor.getCurrentPage();
      const blocks = await logseq.Editor.getCurrentPageBlocksTree();
      const first = portable.fromLogseqPage(page, blocks, graph);
      const graphAfter = await logseq.App.getCurrentGraph();
      const pageAfter = await logseq.Editor.getCurrentPage();
      const blocksAfter = await logseq.Editor.getCurrentPageBlocksTree();
      const second = portable.fromLogseqPage(pageAfter, blocksAfter, graphAfter, Number(first.filename.match(/-(\d+)\.md$/)[1]));
      if (first.markdown !== second.markdown) throw new portable.ExportError('SOURCE_CHANGED');
      if (revision !== generation) return;
      snapshot = first; status(text().ready);
    } catch (error) {
      if (revision !== generation) return;
      const code = error instanceof portable.ExportError ? error.code : '';
      status(code === 'NO_SELECTION' ? text().no : code === 'EDITING' ? text().editing : code === 'SOURCE_CHANGED' ? text().changed : code === 'UNSUPPORTED_CONTENT' || code === 'CONTENT_LIMIT' ? text().unsupported : text().failed, true);
    } finally { if (revision === generation) { busy = false; render(); } }
  }
  logseq.useSettingsSchema([{ key: 'language', type: 'enum', title: '언어 / Language', default: 'ko', enumChoices: ['ko', 'en'] }]);
  element('language').addEventListener('change', () => { logseq.updateSettings({ language: element('language').value === 'en' ? 'en' : 'ko' }); render(); status(snapshot ? text().ready : ''); });
  element('close').addEventListener('click', () => { clear(); logseq.hideMainUI(); });
  element('download').addEventListener('click', () => {
    if (!snapshot || busy) return;
    try {
      const url = environment.URL.createObjectURL(new environment.Blob([snapshot.markdown], { type: 'text/markdown;charset=utf-8' }));
      const link = doc.createElement('a'); link.href = url; link.download = snapshot.filename;
      doc.body.appendChild(link); link.click(); link.remove();
      environment.setTimeout(() => environment.URL.revokeObjectURL(url), 5000);
      status(text().downloaded);
    } catch { status(text().failed, true); }
  });
  element('copy').addEventListener('click', async () => {
    if (!snapshot || busy) return;
    const revision = generation, markdown = snapshot.markdown;
    try { await environment.navigator.clipboard.writeText(markdown); if (revision === generation) status(text().copied); }
    catch { if (revision === generation) status(text().copyFailed, true); }
  });
  element('open').addEventListener('click', () => { void logseq.App.openExternalLink('https://habitude.ai').catch(() => status(text().failed, true)); });
  logseq.on('ui:visible:changed', event => { if (event && event.visible === false) clear(); });
  logseq.beforeunload(async () => { clear(); });
  logseq.provideModel({ openExporter });
  logseq.App.registerCommandPalette({ key: 'habitude-export-page', label: 'Habitude: 페이지 내보내기 / Export current page' }, openExporter);
  logseq.App.registerCommandPalette({ key: 'habitude-open', label: 'Habitude 열기 / Open Habitude' }, () => logseq.App.openExternalLink('https://habitude.ai'));
  logseq.App.registerUIItem('toolbar', { key: 'habitude-export-page', template: '<a class="button" data-on-click="openExporter" title="Habitude: 페이지 내보내기 / Export current page" aria-label="Habitude: Export current page">H</a>' });
  render();
}
module.exports = { registerLogseq };

return module.exports;})();logseq.ready(()=>registerLogseq(logseq,portable,document,window)).catch(()=>{const status=document.getElementById('status');if(status)status.textContent='플러그인을 시작하지 못했습니다. / Could not start the plugin.';});})();
