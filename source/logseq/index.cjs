'use strict';

const TEXT = {
  ko: {
    heading: 'Habitude로 페이지 내보내기', close: '닫기', download: 'Markdown 다운로드', copy: 'Markdown 복사 (선택)', open: 'Habitude 열기', preview: '내보낼 Markdown 미리보기',
    explanation: '현재 Markdown 페이지의 블록을 목록으로 내보냅니다. 현재 Habitude 파일 가져오기는 텍스트 전용이며 첨부 참조가 있으면 미리보기에서 중단됩니다. 원문·체크박스·참조 링크를 보존하고 첨부 원본은 복사하지 않습니다.',
    next: 'Habitude 설정 → 데이터 → 파일 가져오기에서 Logseq를 선택해 이 파일을 가져오세요.',
    clipboard: '파일 내보내기는 Markdown 다운로드를 사용하세요. 클립보드 복사는 호스트 권한에 따라 거부될 수 있습니다. 미리보기의 글을 선택한 뒤 운영체제의 복사 단축키를 사용할 수도 있습니다.',
    loading: '현재 페이지를 확인하는 중…', ready: '이 내용만 내보냅니다. 원래 페이지는 바뀌지 않습니다.',
    no: '현재 Markdown 페이지를 열고 다시 시도해 주세요.', editing: '블록 편집을 마친 뒤 다시 내보내세요.',
    unsupported: '이 페이지나 graph 형식은 아직 지원하지 않습니다. Markdown 파일 graph만 지원합니다.',
    changed: '페이지가 바뀌었습니다. 다시 내보내기를 실행해 주세요.', failed: '페이지를 내보내지 못했습니다. 원본을 유지했습니다. 다시 시도해 주세요.',
    downloaded: '다운로드를 요청했습니다. 선택한 폴더나 다운로드 폴더를 확인해 주세요.', copied: 'Markdown을 클립보드에 복사했습니다.', copyFailed: '복사하지 못했습니다. Markdown 다운로드를 사용해 주세요.',
  },
  en: {
    heading: 'Export a page for Habitude', close: 'Close', download: 'Download Markdown', copy: 'Copy Markdown (optional)', open: 'Open Habitude', preview: 'Markdown export preview',
    explanation: 'Exports the current Markdown page as a block outline. Habitude file import currently accepts text only and stops at preview if attachment references are present. Text, checkboxes and source links are preserved without copying attachments.',
    next: 'In Habitude, open Settings → Data → File import, select Logseq, and choose this file.',
    clipboard: 'Use Download Markdown to export the file. Optional clipboard copy can be denied by the host. You can also select text in the preview and use your operating system’s Copy shortcut.',
    loading: 'Checking the current page…', ready: 'Only this content will be exported. The original page stays unchanged.',
    no: 'Open a Markdown page and try again.', editing: 'Finish editing the block, then export again.',
    unsupported: 'This page or graph format is not supported yet. Markdown file graphs are supported.',
    changed: 'The page changed. Run the export command again.', failed: 'Could not export the page. The original is kept. Please retry.',
    downloaded: 'Download requested. Check your selected folder or Downloads.', copied: 'Markdown copied to the clipboard.', copyFailed: 'Could not copy. Use Download Markdown instead.',
  },
};

function isFileGraph(graph) {
  if (!graph || typeof graph.path !== 'string' || typeof graph.url !== 'string' || typeof graph.name !== 'string') return false;
  const absolute = /^\/(?!\/)/.test(graph.path) || /^[A-Za-z]:[\\/]/.test(graph.path);
  return absolute && !/[\x00-\x1f\x7f]/.test(graph.path + graph.name) && graph.name.length > 0 && graph.url === 'logseq_local_' + graph.path;
}

async function fileGraphContext(logseq, portable) {
  const info = await logseq.App.getInfo();
  const graph = await logseq.App.getCurrentGraph();
  if (!info || typeof info.version !== 'string' || !isFileGraph(graph)) throw new portable.ExportError('UNSUPPORTED_CONTENT');
  // Official 0.10.15 predates the DB graph API. Its file graph identity is documented in
  // https://github.com/logseq/logseq/blob/0.10.15/src/main/frontend/config.cljs .
  // The SDK proxy can make an absent host method look callable, so feature detection alone is insufficient.
  if (info.version === '0.10.15' && (info.supportDb === undefined || info.supportDb === false)) return { graph, legacyFileGraph: true };
  if (typeof logseq.App.checkCurrentIsDbGraph !== 'function' || await logseq.App.checkCurrentIsDbGraph() !== false) throw new portable.ExportError('UNSUPPORTED_CONTENT');
  return { graph, legacyFileGraph: false };
}

function pageForExport(page, blocks, context, portable) {
  if (!page || page.format !== undefined || !context.legacyFileGraph) return page;
  // In 0.10.15 PageEntity.format is optional. Accept its absence only when every
  // block positively identifies Markdown; an empty, unknown or Org tree is not proof.
  if (!Array.isArray(blocks) || !blocks.length || blocks.length > 2000) throw new portable.ExportError('UNSUPPORTED_CONTENT');
  const pending = [...blocks]; let count = 0;
  while (pending.length) {
    const block = pending.pop();
    if (!block || block.format !== 'markdown' || ++count > 2000 || block.children !== undefined && !Array.isArray(block.children)) throw new portable.ExportError('UNSUPPORTED_CONTENT');
    if (block.children) {
      if (pending.length + block.children.length > 2000) throw new portable.ExportError('UNSUPPORTED_CONTENT');
      pending.push(...block.children);
    }
  }
  return { ...page, format: 'markdown' };
}

async function registerLogseq(logseq, portable, doc, environment) {
  const key = 'habitude-export-review';
  let snapshot = null, busy = false, generation = 0, visible = false, message = '', isError = false;
  let language = logseq.settings.language === 'en' ? 'en' : 'ko';
  const text = () => TEXT[language];
  const escape = value => portable.escapeHtml(value);
  function status(value, error = false) { message = value; isError = error; }
  function button(handler, label, extra = '') {
    return `<button type="button" data-on-click="${handler}" ${extra} style="min-height:40px;padding:8px 14px;border:1px solid var(--ls-border-color);border-radius:8px;color:inherit;background:var(--ls-secondary-background-color);font:inherit;cursor:pointer">${escape(label)}</button>`;
  }
  function render() {
    if (!visible) return;
    const t = text(), disabled = !snapshot || busy ? 'disabled' : '';
    logseq.provideUI({
      key, path: 'body',
      attrs: { role: 'dialog', 'aria-label': t.heading },
      style: { position: 'fixed', zIndex: 999, left: '50%', top: '8vh', transform: 'translateX(-50%)', width: 'min(680px, calc(100vw - 48px))', maxHeight: '84vh', overflowY: 'auto', padding: '24px', backgroundColor: 'var(--ls-primary-background-color)', color: 'var(--ls-primary-text-color)', border: '1px solid var(--ls-border-color)', borderRadius: '16px', boxShadow: '0 20px 70px #0004' },
      template: `<section style="font-family:var(--ls-font-family,-apple-system,BlinkMacSystemFont,sans-serif);font-size:14px;line-height:1.6">
        <header style="display:flex;align-items:center;justify-content:space-between;gap:16px"><h2 style="margin:0;font-size:22px">${escape(t.heading)}</h2>${button('closeExporter', t.close)}</header>
        <div style="display:flex;gap:8px;margin-top:16px">${button('changeLanguage', '한국어', `data-language="ko" aria-pressed="${language === 'ko'}"`)}${button('changeLanguage', 'English', `data-language="en" aria-pressed="${language === 'en'}"`)}</div>
        <h3 style="font-size:17px;overflow-wrap:anywhere">${snapshot ? escape(snapshot.title) : ''}</h3><p>${escape(t.explanation)}</p>
        <label style="display:block">${escape(t.preview)}<textarea readonly spellcheck="false" aria-label="${escape(t.preview)}" style="display:block;width:100%;height:220px;box-sizing:border-box;padding:14px;border:1px solid var(--ls-border-color);border-radius:8px;background:var(--ls-secondary-background-color);color:inherit;font:13px/1.6 ui-monospace,monospace;resize:vertical">${snapshot ? escape(snapshot.markdown) : ''}</textarea></label>
        <p role="status" aria-live="polite" style="min-height:24px;${isError ? 'color:var(--ls-error-text-color,#c1463a)' : ''}">${escape(message)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${button('downloadMarkdown', t.download, disabled)}${button('copyMarkdown', t.copy, disabled)}${button('openHabitude', t.open)}</div><p>${escape(t.clipboard)}</p><p>${escape(t.next)}</p>
      </section>`,
    });
  }
  function closeExporter() {
    generation++; snapshot = null; busy = false; visible = false; message = '';
    // The supported keyed native UI avoids legacy full-screen iframe focus/paint bugs.
    logseq.provideUI({ key, path: 'body', template: null });
  }
  async function openExporter() {
    if (busy) return;
    closeExporter(); visible = true; busy = true; const revision = generation;
    status(text().loading); render();
    try {
      const context = await fileGraphContext(logseq, portable), graph = context.graph;
      if (await logseq.Editor.checkEditing()) throw new portable.ExportError('EDITING');
      const page = await logseq.Editor.getCurrentPage();
      const blocks = await logseq.Editor.getCurrentPageBlocksTree();
      const first = portable.fromLogseqPage(pageForExport(page, blocks, context, portable), blocks, graph);
      const contextAfter = await fileGraphContext(logseq, portable), graphAfter = contextAfter.graph;
      if (graph.path !== graphAfter.path || graph.url !== graphAfter.url) throw new portable.ExportError('SOURCE_CHANGED');
      const pageAfter = await logseq.Editor.getCurrentPage();
      const blocksAfter = await logseq.Editor.getCurrentPageBlocksTree();
      const second = portable.fromLogseqPage(pageForExport(pageAfter, blocksAfter, contextAfter, portable), blocksAfter, graphAfter, Number(first.filename.match(/-(\d+)\.md$/)[1]));
      if (first.markdown !== second.markdown) throw new portable.ExportError('SOURCE_CHANGED');
      if (revision !== generation) return;
      snapshot = first; status(text().ready);
    } catch (error) {
      if (revision !== generation) return;
      const code = error instanceof portable.ExportError ? error.code : '';
      status(code === 'NO_SELECTION' ? text().no : code === 'EDITING' ? text().editing : code === 'SOURCE_CHANGED' ? text().changed : code === 'UNSUPPORTED_CONTENT' || code === 'CONTENT_LIMIT' ? text().unsupported : text().failed, true);
    } finally { if (revision === generation) { busy = false; render(); } }
  }
  function downloadMarkdown() {
    if (!visible || !snapshot || busy) return;
    try {
      const url = environment.URL.createObjectURL(new environment.Blob([snapshot.markdown], { type: 'text/markdown;charset=utf-8' }));
      const link = doc.createElement('a'); link.href = url; link.download = snapshot.filename;
      doc.body.appendChild(link); link.click(); link.remove();
      environment.setTimeout(() => environment.URL.revokeObjectURL(url), 5000);
      status(text().downloaded);
    } catch { status(text().failed, true); }
    render();
  }
  async function copyMarkdown() {
    if (!visible || !snapshot || busy) return;
    const revision = generation, markdown = snapshot.markdown;
    try { await environment.navigator.clipboard.writeText(markdown); if (revision === generation) status(text().copied); }
    catch { if (revision === generation) status(text().copyFailed, true); }
    if (revision === generation) render();
  }
  function changeLanguage(event) {
    if (!visible) return;
    const requested = event && event.dataset && event.dataset.language;
    if (requested !== 'ko' && requested !== 'en') return;
    language = requested; logseq.updateSettings({ language }); status(snapshot ? text().ready : ''); render();
  }
  async function openHabitude() {
    try { await logseq.App.openExternalLink('https://habitude.ai'); }
    catch { status(text().failed, true); render(); }
  }
  logseq.useSettingsSchema([{ key: 'language', type: 'enum', title: '언어 / Language', default: 'ko', enumChoices: ['ko', 'en'] }]);
  logseq.beforeunload(async () => { closeExporter(); });
  logseq.provideModel({ openExporter, closeExporter, downloadMarkdown, copyMarkdown, changeLanguage, openHabitude });
  logseq.App.registerCommandPalette({ key: 'habitude-export-page', label: 'Habitude: 페이지 내보내기 / Export current page' }, openExporter);
  logseq.App.registerCommandPalette({ key: 'habitude-open', label: 'Habitude 열기 / Open Habitude' }, openHabitude);
  logseq.App.registerUIItem('toolbar', { key: 'habitude-export-page', template: '<a class="button" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:3px" data-on-click="openExporter" title="Habitude: 페이지 내보내기 / Export current page" aria-label="Habitude: Export current page"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320" width="16" height="22" style="display:block;width:16px;height:22px" fill="currentColor" aria-hidden="true" focusable="false"><g transform="scale(.84 1)"><path d="M96 8C66 15 33 31 16 45C7 53 4 63 4 76V264C4 293 22 312 51 312H92V264C92 250 86 242 74 235L21 203C8 195 8 183 21 175L96 130Z"/><path d="M110 149L156 122C169 114 181 114 194 121L246 151C237 152 230 155 222 160L110 224Z"/><path d="M258 165C272 174 280 187 280 204V312H241C212 312 192 294 192 265V204L247 171Z"/></g></svg></a>' });
}
module.exports = { registerLogseq };
