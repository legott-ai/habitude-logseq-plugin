# Desktop qualification · 2026-11-02

Official Logseq 0.10.15, isolated Markdown file graph, synthetic Korean/English writing only. No personal notes or account used.

- Toolbar, native keyed review and KO/EN switching observed in the actual host.
- Native macOS Save produced the expected 407-byte Markdown snapshot; its SHA-256 is `3a858a3c480cfed4d9f1efb2b398317bf03f22b9901d5cdab553b3b63829611d`.
- Imported into a new disposable Habitude Vault: inserted1. Reimport: unchanged1. Original file bytes remained unchanged.
- Two foreground mouse interaction/Close cycles returned the complete visible source page. An additional final UI-label smoke also passed.
- The host denied optional clipboard writes. Download is the primary tested path; no additional clipboard privileges were requested.
- AXPress/background automated captures sometimes showed a blank main area while accessibility retained the source; Tab repainted it. This discrepancy was not reproduced during foreground mouse cycles. It remains a limitation of that automation result, not proof of all host versions or interaction methods.

Final release ZIP SHA-256: `ea999154ebab34f28c3ef61ae869e5d8610d426b58a444a033fc5c405d9b9141` (290229 bytes). Runtime `index.js` SHA-256: `aaf2748545dbabed622192c5190072f98f8b58d1507727c0e11e95ac98180145`. This runtime is byte-identical to the final actual-host visual-smoke package; subsequent archive changes are factual documentation only.

`npm test`, `npm run build` and `npm run verify` pass. Public-source builds reproduce the pinned ZIP. The builder's `actualHostGUIVerified:false` refers to what that automated builder itself executes; the separate manual host checks above are not simulated as builder tests.

DB graphs, Org, mobile and other host versions have not been qualified. This download release is separate from Marketplace acceptance.
