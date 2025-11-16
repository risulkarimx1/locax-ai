# Localization Source & Meta File Tech Plan

## Goals & Constraints
- Preserve the designer-provided spreadsheet exactly: `Key | Type | Desc | English | Deutsch [de] | Français [fr] | Español [es] | 日本語 [ja] | 한국어 [ko]`.
- Store Locax-only metadata (Context, screenshots, linked keys, etc.) in a sidecar file `localization_meta.csv` located next to the source file.
- Support both `.xlsx` and `.csv` sources for import/export; writes must touch only translation/Desc cells while keeping column order and formatting intact.
- Create a blank workbook with the mandated columns when the user starts a new project.
- When importing, automatically create `localization_meta.csv` if missing, prefilling Context with Desc.
- Treat `Desc` as designer-owned copy: Locax surfaces it for reference and only writes back changes when the user explicitly edits the Description field in-app; otherwise the original value is left untouched.

## Data Model Updates
- `LocalizationRow`: add `description: string` (from `Desc` column) and keep `context` for AI instructions. All existing optional fields (screenshots, linked keys) remain but are persisted via the meta file.
- `ProjectState`: include `sourceFileHandle`, `sourceFileType` (`"xlsx" | "csv"`), `metaFileHandle`, `metaExists`, and `sourceFolderHandle` (repo root directory). Retain git metadata fields; rename `csvFileHandle` usages accordingly.
- Maintain both a `workbookRowMap` (`key -> row index`) and a `languageColumnMap` (`lang -> column index + header label`) for XLSX files so edits target exact cells without shuffling columns.

## File Schemas
1. **Localization Source** (`.xlsx`/`.csv`)
   - Columns: Key, Type, Desc, plus language columns (English, Deutsch [de], etc.).
   - Keep `Type` as-is (`Text` by default). `Desc` stores designer description and is editable in-app.
   - Languages detected from headers (regex `\[(\w+)\]`); English is base `en`. Persist the import-time header ordering so CSV/XLSX exports keep the same column sequence users expect.
2. **`localization_meta.csv`**
   - Header: `Key,Context,ScreenshotBase64,LinkedKeys,Notes` (extensible; ignore unknown columns).
   - Context is the authoritative AI instruction; screenshots and linked keys stored as text (base64 + comma-separated keys).
   - When auto-generated, each key gets Context = Desc (fallback) and other cells blank.

## Import Workflow
1. User selects `Localization.xlsx` or `.csv`.
2. Parse file:
   - XLSX: read workbook via `XLSX.read`, grab first sheet, convert to rows while tracking row indices per key.
   - CSV: use `parseSourceCSV`, ensuring Key/Type/Desc columns exist.
3. Prompt for repo root / containing folder (existing git request flow). Store handle for meta operations.
4. Look for `localization_meta.csv` in the selected folder:
   - If found: read & parse into `Map<Key, MetaRow>` (ignore unknown columns for forward compatibility).
   - If missing: create file, write header + rows for every key (Context = Desc fallback), mark `metaExists=false` to show onboarding hint.
5. Merge source + meta data:
   - For each source key, set `description` from `Desc`, `context` from meta Context or fallback to description, and copy screenshot/linked keys.
   - Warn/log about meta rows whose keys don’t exist in source; keep them in-memory (flagged) so users can restore keys later, but exclude them from saves unless explicitly reattached.
6. Populate `ProjectState` with parsed rows, languages, handles, workbook row map, git status, etc.

## Runtime Editing Rules
- Edits to translations or `description` (`Desc`) mark the source as dirty. By default Description is shown read-only; once the user opts to edit, we track it like other source fields.
- Edits to `context`, screenshots, linked keys mark the meta file as dirty.
- When a key is renamed, update both internal rows and workbook/meta maps so future saves rewrite the correct row.
- Newly added keys should immediately exist in both in-memory structures; on save, append to source sheet and meta CSV. Deleting a key removes it from both files during the next save (after user confirmation).
- Track per-row dirty flags so large spreadsheets only rewrite touched rows/cells.

## Saving
1. **Auto temp save**: continue writing internal CSV snapshot (includes description + context) to OPFS/localStorage for crash recovery.
2. **Manual save**:
   - CSV sources: update `serializeSourceCSV` to write `row.description` into `Desc`, keep the captured header order, and emit UTF-8 with BOM so Excel preserves Asian-language text.
   - XLSX sources: reload the workbook, update only dirty cells (Desc + language columns) via stored row/column maps, append new rows when needed, then write back via `fileHandle.createWritable()` + `XLSX.write` to ArrayBuffer.
   - Meta file: serialize all rows into `localization_meta.csv` (sorted by key) and write using `metaFileHandle`. Large screenshots stay base64 for now but note the future option of moving them to a `/screenshots` folder with references.
   - Two-phase commit: write both files through `createWritable()` handles, flush, then `close()` so replacements are atomic. If either write fails, abort before closing (old data remains), surface a destructive toast, and keep dirty flags for retry.
   - Before writing, compare available `lastModified` timestamps to warn if the source changed externally and require re-import to avoid clobbering other edits.

## New Project Creation
1. “New Project” opens dialog for project name + language selection.
2. Prompt `showSaveFilePicker` to create `Localization.xlsx`.
3. Generate workbook with required columns (`Type` preset to `Text`) and empty rows; write to handle. Document that `Type` remains informational (Text, Audio, etc.) so future tooling can use it even though Locax ignores it initially.
4. Create neighboring `localization_meta.csv` with only the header row.
5. Ask user to select repo root (if not already) to capture folder handle + git branch.
6. Load the new project into the app using the same flow as imported projects.

## Meta Lookup on Reopen
- Persist both source and meta file handles in `ProjectReference`.
- On reopen, verify read/write permissions for both; if meta handle missing, attempt to locate `localization_meta.csv` via stored folder handle, or prompt user to reselect.

## UI Notes
- Surface Description (sheet-owned, subtle label) and Context (meta-owned, bold label) side-by-side with tooltips explaining storage locations.
- Show onboarding banner when contexts were auto-copied from descriptions.
- Display separate dirty indicators for source vs. meta saves so users know which file still needs to be written.
- Offer git best-practice hint (e.g., in project settings) encouraging teams to add `localization_meta.csv`/future `/screenshots` folder to `.gitignore` if AI metadata shouldn't leave the repo.

## Next Steps
Small reminder for the next Codex tab: the remaining tasks cover validation/missing pieces (mtime checks, dirty badges across UI, screenshot persistence, etc.) and the final phase of the plan. Please continue from here and avoid reworking finished items.

## Validation Checklist
1. Import provided `/Locax/TestLoc/Localization.xlsx`; verify meta file auto-creation and context fallback behavior.
2. Edit translations, descriptions, contexts, screenshots; ensure manual save updates XLSX + meta files with no column drift and that CSV exports remain UTF-8-friendly (Asian-language smoke test).
3. Rename/add/remove keys and confirm both source + meta stay in sync, including workbook/column maps.
4. Simulate concurrent edits (modify the XLSX outside Locax) and confirm the app warns before overwriting.
5. Create a fresh project and confirm blank template + meta file are generated.
6. Stress-test with 10k+ keys to validate table virtualization, per-row dirty tracking, and save duration.
7. Reopen recent project to ensure stored handles/permissions and git branch detection still work.

---

## Technical Review

*Response to reviewer feedback:* The plan above now clarifies Description ownership, documents key deletion and per-row dirty tracking, introduces XLSX `languageColumnMap`, spells out the two-phase save strategy + concurrent edit detection, notes UTF-8 BOM requirements, and expands validation/performance checkpoints as requested.

### Architecture Validation

**✅ Core Separation of Concerns**
- The dual-file approach correctly separates designer-controlled translation data from app-specific metadata
- Source file immutability (structure) is properly preserved while allowing translation updates
- Meta file serves as a clean sidecar without polluting the original spreadsheet

**✅ Data Model Alignment**
- `LocalizationRow` properly distinguishes `description` (from source Desc) vs `context` (from meta Context)
- `ProjectState` additions (`sourceFileHandle`, `sourceFileType`, `metaFileHandle`, `workbookRowMap`) provide necessary tracking
- Rename from `csvFileHandle` → `sourceFileHandle` accurately reflects multi-format support

**✅ Dual-Format Support**
- XLSX and CSV both supported as sources with format-preserving writes
- `workbookRowMap` strategy for XLSX prevents row reordering issues during updates
- Language header extraction (`\[(\w+)\]` regex) handles both formats consistently

### Critical Implementation Details

**✅ Import Workflow Robustness**
1. Meta file auto-creation with Context=Desc fallback is correct
2. Folder handle acquisition enables both meta file operations and git detection
3. Orphaned meta rows (keys not in source) logging prevents silent data loss
4. Merge strategy prioritizes source file as single source of truth for keys/languages

**✅ Save Strategy**
- Dirty tracking separation (source vs meta) enables efficient targeted writes
- XLSX cell-level updates using row indices preserve formatting
- CSV serialization maintains original language column order
- Auto temp save to OPFS/localStorage provides crash recovery without touching source files

**✅ Key Lifecycle Management**
- Key rename updates both workbookRowMap and meta Map
- New key addition appends to both source and meta
- Delete operations must synchronize across both files (implicit but should be explicit)

### Potential Issues & Refinements

> Note: The reviewer concerns below are retained for visibility; the plan changes above explicitly cover these areas (Description ownership, delete workflow, column order mapping, transactional saves, UTF-8, performance, etc.).

**⚠️ Issue 1: Desc Editability**
- Lines 18 & 40 state `Desc` is "editable in-app" and marks source as dirty
- **Concern**: This contradicts the original requirement that only translation values should change
- **Recommendation**: Clarify if Desc editing is allowed or make it read-only like in TECH_PLAN.md

**⚠️ Issue 2: Key Deletion Synchronization**
- Validation checklist tests add/rename but deletion isn't explicitly documented in runtime rules
- **Recommendation**: Add explicit delete workflow ensuring both workbookRowMap and meta Map remove entries

**⚠️ Issue 3: Type Column Usage**
- Type column is preserved but never utilized in app logic
- **Recommendation**: Document expected Type values (Text, Audio, etc.) or remove from new project template if unused

**⚠️ Issue 4: Transaction Safety**
- Line 51 mentions "both succeed or failure surfaced" but doesn't specify rollback
- **Recommendation**: Implement write-ahead strategy (write to temp, verify both, then replace) or clear user guidance on partial failure recovery

**⚠️ Issue 5: Meta File Schema Extensibility**
- `localization_meta.csv` schema includes "ignore unknown columns" for extensibility
- **Concern**: Screenshot storage as base64 in CSV will bloat file size rapidly
- **Recommendation**: Consider separate `screenshots/` folder with filename references in meta CSV, or keep base64 for simplicity with size warnings

**⚠️ Issue 6: Language Column Order Preservation**
- CSV save should maintain original header order, but XLSX row map doesn't track column order
- **Recommendation**: Store `languageColumnMap: Map<languageCode, columnIndex>` during XLSX import to preserve exact column positions

### Missing Considerations

**🔍 Git Integration**
- Plan mentions git branch detection but doesn't address `.gitignore` recommendations
- **Recommendation**: Auto-create `.gitignore` entry for `localization_meta.csv` if users want to exclude AI-generated context from version control (or document best practices)

**🔍 Concurrent Edit Detection**
- No mention of file modification time checking before saves
- **Recommendation**: Check source file mtime before writing to warn if external changes occurred

**🔍 Unicode & Special Characters**
- Asian language support (日本語, 한국어) requires UTF-8 encoding
- **Recommendation**: Explicitly specify UTF-8 BOM for CSV writes and verify XLSX encoding

**🔍 Performance with Large Files**
- No limits mentioned for number of keys or file size
- **Recommendation**: Test with 10k+ keys; consider virtualized table rendering and chunked meta file writes

### Alignment with TECH_PLAN.md

**Consistent Elements:**
- Context fallback strategy matches
- File structure and workflows align
- Migration strategy (backward compatibility) consistent
- Error handling philosophy similar

**Differences (techplan_data.md is more detailed):**
- Adds workbookRowMap for precise XLSX updates ✅
- Includes auto temp save consideration ✅
- Specifies meta CSV schema with extensibility ✅
- Provides validation checklist ✅
- Details permission re-verification on reopen ✅

### Final Recommendation

**Overall Assessment: APPROVED with refinements**

The techplan_data.md provides a comprehensive, implementable specification that addresses all core requirements. The dual-file architecture is sound, format preservation strategy is correct, and workflows are well-defined.

**Priority Action Items Before Implementation:**
1. **Clarify Desc editability** - Confirm read-only vs editable
2. **Add delete workflow** - Document key deletion synchronization
3. **Implement column order tracking** - For XLSX language column preservation
4. **Add transaction safety** - Define partial failure recovery UX
5. **Performance testing** - Validate with large datasets (10k+ keys)
6. **UTF-8 validation** - Ensure multi-language character support

**Optional Enhancements:**
- Screenshot folder storage vs base64 (evaluate after initial implementation)
- Git integration best practices documentation
- Concurrent edit detection with mtime checking

The plan is ready for implementation with the noted clarifications.

## Home & Save UX Enhancements

### Objectives
- Remove the Git tip banner from the editor screen; teams now keep `localization_meta.csv` in version control.
- Guarantee that pressing **Home** performs a manual save (when possible) before leaving the project view.
- Upgrade the Project Viewer cards with a context menu that can delete entries or open the repo folder (“Show in Folder” / “Show in Finder” on macOS).
- Display the repository folder name (instead of the file name) on the home dashboard so users can quickly recognize each project.

### Implementation Plan
1. **Saving flow**
   - Extract the manual-save logic in `Index.tsx` into a reusable `attemptManualSave({ showSuccessToast })` helper that returns a boolean.
   - Have both the “Save” button and the “Home” action call this helper; the Home action should block navigation if the save fails.
   - Preserve the existing dirty-flag reset, timestamp updates, and error toasts.
2. **UI tweaks inside the editor**
   - Remove the Git tip `Alert` in `Index.tsx`.
   - Update `Header.tsx` so the Home button awaits the async exit handler.
3. **Project metadata storage**
   - Extend `ProjectReference` / `SaveProjectReferenceInput` with `repoFolderName`.
   - When importing/creating projects, persist `folderHandle?.name` so the Project Viewer can show the repo name even after reload.
4. **Project Viewer polish**
   - Swap the inline trash icon for a `MoreHorizontal` menu: entries for “Show in Folder/Finder” and “Delete”.
   - Implement “Show in Folder” by reusing the stored `folderHandle` and opening a `showDirectoryPicker({ startIn: handle })` fallback; surface warnings via toasts when handles are missing.
   - Render the main card title using `repoFolderName ?? projectName` and update search filters accordingly.

### Validation
- Open an existing project, make edits, and click Home—verify the save runs first and that navigation aborts on failure.
- From the Project Viewer, open the overflow menu to delete a card and to trigger “Show in Folder”; ensure the latter opens a picker focused on the saved directory (or warns otherwise).
- Confirm that newly imported/created projects show their folder names on the dashboard and that references persist across reloads.
