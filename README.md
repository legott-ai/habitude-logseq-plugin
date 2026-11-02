# Habitude for Logseq · 0.1.0 preview

한국어: 현재 열린 Markdown 페이지를 Habitude 가져오기 파일로 내보냅니다. 명령 팔레트에서 **Habitude: 페이지 내보내기** 또는 도구 모음의 **H**를 누릅니다. 내보낼 내용을 확인하고 **Markdown 다운로드** 또는 **Markdown 복사**를 선택하세요. Habitude의 **설정 → 데이터 → 파일 가져오기 → Logseq**에서 저장한 `.md` 파일을 미리 본 뒤 가져옵니다. **Habitude 열기**는 본문 없이 Habitude 웹사이트를 엽니다. 플러그인 화면에서 한국어·English를 선택할 수 있습니다.

English: Open a Markdown page and run **Habitude: Export current page** in the command palette, or click **H** in the toolbar. Review the exact export, then choose **Download Markdown** or **Copy Markdown**. In Habitude, select **Settings → Data → File import → Logseq**, preview the `.md` file and confirm. **Open Habitude** opens the website without note content. The plugin UI supports Korean and English.

## Install / 설치

Unzip `habitude-logseq-0.1.0.zip` into a folder. In Logseq desktop enable developer mode, open Plugins → Load unpacked plugin, and choose the folder containing `package.json`. This is a manually installable preview; marketplace catalog review is separate from a public download release. No mobile support is claimed.

ZIP을 폴더에 풀고 Logseq 데스크톱에서 개발자 모드 → 플러그인 → 압축 해제 플러그인 불러오기로 `package.json`이 있는 폴더를 고릅니다. 등록 심사를 통과했다고 표시하지 않습니다.

## Supported content and privacy

- Markdown **file graphs** only. DB graphs, Org pages, whiteboards, incomplete blocks or oversized trees stop instead of producing a partial export.
- Reads only the open page and its block tree after an explicit command. It reads twice and refuses an export if the selected source changes.
- The outline is serialized as Markdown bullets. Each block's text, checkbox text and source links are retained; this is an SDK page snapshot, not a byte-identical copy of the underlying `.md` file.
- Stable page UUID plus real native timestamps, when provided, support repeat imports and renamed export files. An unavailable source creation date stays absent.
- Original pages are not edited. Attachments remain source links and are not copied or backed up. No automatic habit-completion mapping.
- Habitude's file importer currently accepts text only. Local/resource attachment references stop import preview rather than producing a note with missing photographs.
- No API account, analytics or automated network request. The official SDK is bundled locally; the plugin does not load a CDN. A local Blob download and clipboard copy happen only when selected.
- Limits: 1 MiB, 2,000 blocks, nesting depth 40 and 30,000 lines. Finish active block editing before export.

다운로드를 요청한 뒤 실제 파일이 저장되었는지는 Logseq의 다운로드 폴더/선택한 폴더에서 확인하세요. 자동·양방향 동기화 기능은 아닙니다.

## Verification and upstream code

Synthetic host API tests cover selection changes, unsupported graph rejection, explicit download/copy and source preservation. Actual Logseq GUI/plugin loading is not yet verified in the build environment; this package is a preview.

Uses the official [Logseq SDK](https://logseq.github.io/plugins/) `@logseq/libs` **0.3.4**, upstream commit `3de7c75154b628dadfdb53dae6253c8bf5e2ab1b` (the registry's `next` channel at build time; the older `latest` channel is 0.0.17). Distribution includes the unmodified runtime, notices, source/provenance and upstream license. This Logseq package is offered under **AGPL-3.0-only**; that scope does not change the separate Habitude app's license. See `THIRD_PARTY.md` and `LICENSE` inside the release.

Official API references: [Editor](https://logseq.github.io/plugins/interfaces/IEditorProxy.html), [App](https://logseq.github.io/plugins/interfaces/IAppProxy.html), [page metadata](https://logseq.github.io/plugins/interfaces/PageEntity.html), [marketplace submission](https://github.com/logseq/marketplace#how-to-submit-your-plugin).

## Build this source repository

The runnable plugin is at the repository root. Authored source, deterministic archive builder, tests, verified SDK tarball and preferred SDK source are under `source/`. Run `npm test`, then `npm run build` and `npm run verify`. The builder may fetch the pinned official SDK/source/license on its first run into a temporary cache; plugin runtime uses local files only. Generated artifacts are under `source/dist/`.
