# Internal demo assets

Files in this folder are **admin-only fixtures** used to render preview
tiles in the ContentCard admin templates dashboard. They are referenced
by `app/seed/demo_mcdonalds.py` and consumed by the demo render job
(PR 1.7) and the admin browse drawer (PR 1.8).

## Rights and scope

These assets are **never** served to end users, never embedded in
generated content, never returned by any user-facing API, and never
exposed to non-admin sessions.

- `mcdonalds-logo-arches.png` — used as a stand-in brand mark to
  visualize how a real, high-equity brand looks in the template grid.
  Static, internal, admin-only preview. Not redistributed, not used in
  customer-facing output.
- Any food / portrait imagery placed alongside is internal-only stock
  for the same admin-preview purpose.

If we ever expose this fixture beyond engineering review (e.g. live
sales demos), the rights / ToS review described in cross-cutting PR X.3
must run first.

## Adding new demo brands

If a future demo brand replaces or supplements McDonald's:

1. Drop the asset into this folder under a clear, brand-prefixed name.
2. Mirror the brand-kit shape used by `DEMO_BRAND_KIT` in
   `app/seed/demo_mcdonalds.py`.
3. Extend `find_demo_idea()` (or add a parallel module) so the demo
   render job can locate the new fixture by intent_family / content_type.
4. Update this README with the same rights note for the new asset.
