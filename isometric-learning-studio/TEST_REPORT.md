# Test report

Rule used: an item is "Passed" only if it was actually executed. Everything that needs your real Supabase project, a real phone or real files is listed as **Not tested**.

## Executed and passed

| Area | How | Result |
|---|---|---|
| TypeScript (strict) | `npm run typecheck` | No errors |
| Production build | `npm run build` | Builds |
| Unit tests (14) | `npm test` (vitest) | 14/14 pass: view layout for first/third angle, which drawing is highlighted for each camera view, QR address rules (localhost, private IPs, missing domain rejected), geometry coordinate mapping and validation, solid volumes from boolean cuts, scale check |
| Database rules (27 checks) | `supabase/tests/run.sh` on a throwaway Postgres 16 with small stand-ins for Supabase's auth/storage objects | All pass: student cannot read or write exercises, drafts hidden from the public function, publish refused without views/model, exercise code immutable and sequential, roles cannot be self-promoted, analytics and stats admin-only, storage writes admin-only |
| Sample model | `npm run sample` | GLB re-loaded with GLTFLoader: 60 x 40 x 30 mm, volume 59,609 mm³ vs 59,607 mm³ computed from the definition (within 0.01%) |
| Browser smoke test (29 checks) | `tests/smoke.mjs` in real Chromium at phone size, **against a mocked backend** | All pass (see below) |

Smoke test coverage: student page loads, 3D canvas draws visible model pixels, three drawings load, third-angle arrangement (top above front, right beside front), dimension table, standard-view buttons highlight the matching drawing, the honest "no left-side drawing" note, Reset, compare mode, hints hidden until requested, access logged, no horizontal scroll at 390 px, not-found and not-available pages, rejection of non-exercise scanned/typed text, link text opening the exercise, signed-out redirect to login, mocked sign-in, all 7 faculty navigation items, localhost address refused in Settings, editor starts with no projection chosen, Publish locked on an empty draft, AI panel disabled, geometry builder renders a preview and reports volume, no uncaught page errors.

Because the backend was mocked, this proves the screens behave correctly given correct server replies. It does not prove the real server gives those replies.

## Not tested (no Supabase project, domain or phone was available)

- Real sign-up, email confirmation, sign-in and the admin promotion step.
- Real file uploads to Supabase Storage (progress bar, size/type limits at the bucket) and `npm run seed:sample` (the script is syntax-checked only).
- Saving, publishing, duplicating and archiving exercises against the real database from the screens (the rules were tested in SQL, the screens against mocks).
- Scanning a printed QR code with a phone camera, and the in-app camera scanner (needs https and a real camera). The "Test QR code" decode check in the editor and QR Manager (it re-reads the generated image) was **not executed** either; it is only type-checked.
- Touch gestures (pinch, two-finger pan) on a real phone. The controls are configured for them; not exercised.
- Worksheet print layout and PDF output (needs a saved exercise; not opened in the smoke test).
- Image rotate/trim tool, model upload preview and scale check with a real user file.
- Faculty screens other than those listed in the smoke test (list filters, Topics, Usage, QR Manager).
- Hosting redirects (`_redirects`, `vercel.json`) on a real host.
- Browsers other than Chromium; very large models (a 50 MB limit is set; performance is untested).

## Test A–E from the brief

The specification's scenarios A–E depend on a live project, so they are **not** claimed as passed. The parts that could be run without one are in the table above. Run them yourself after setup: create an exercise, publish, scan the printed code on a phone, check the views and model on the phone, then archive it and scan again.

## Defects found and fixed during testing

- False black lines on parts made with holes (triangulation artefacts from boolean cuts). Fixed in the viewer's edge overlay; re-checked by screenshot.
- Smoke-test timing and collapsed-on-phone assumptions in the test script itself.
