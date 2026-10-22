# Isometric Learning Studio

A QR-based engineering-graphics visualiser. Faculty create exercises (three orthographic drawings, a 3D model, dimensions). Each exercise gets a permanent code (`EG-0001`) and a QR code. Students scan it and see the 3D object next to its first- or third-angle views.

Stack: Vite, React 18, TypeScript, Three.js (react-three-fiber), Supabase (Postgres, Auth, Storage).
Read **TEST_REPORT.md** first to see what was tested and what was not.

## What you need

- A free Supabase account and project (database, login, file storage).
- A place to host the built site over **https** (Netlify, Vercel, Cloudflare Pages, or your college server) and a permanent address for it, for example `https://eg.your-college.edu`. The address is printed into every QR code, so choose it before you print worksheets.
- Node.js 20 or newer on your computer.

## 1. Create the Supabase project

1. supabase.com → New project. Save the database password.
2. **SQL editor** → paste the whole of `supabase/migrations/0001_schema.sql` → Run. This creates the tables, access rules, the storage bucket and the functions.
3. Optional: run `supabase/seed.sql` for starter subjects and topics.
4. **Project settings → API**: copy the *Project URL* and the *anon public* key.

## 2. Configure and run locally

```bash
npm install
cp .env.example .env      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Only the **anon** key goes in `.env`. Never put the `service_role` key in any `VITE_` variable or in the website; it bypasses every security rule.

## 3. Make the first faculty account

1. Open the site → **Sign in → Create an account** with your email.
2. If Supabase asks for email confirmation, confirm it.
3. In the Supabase SQL editor run:
   ```sql
   update public.users set role = 'admin' where email = 'you@your-college.edu';
   ```
4. Sign in again; you are sent to `/admin`.

All sign-ups are students by default. Only an admin can change a role (enforced by the database, not the screens). To stop strangers creating student accounts, turn off *Authentication → Providers → Email → Allow new users to sign up* after creating the accounts you need, or leave it on if students should register. Exercises that do not tick "require sign-in" need no account at all.

## 4. Set the permanent QR address

Faculty area → **Settings → Public web address**. Enter your final https address. The app refuses `localhost`, `127.0.0.1`, `192.168.x.x`, `10.x.x.x`, `*.local` and addresses without a domain name. Alternatively set `VITE_PUBLIC_BASE_URL` at build time; the saved setting wins.
QR codes contain `https://<address>/exercise/EG-0001` and nothing else. Do not print worksheets until this address is final.

## 5. Deploy

```bash
npm run build      # type-checks, then writes dist/
```

Upload `dist/` to your host and set the two `VITE_` variables in the host's build settings if it builds for you.
The site is a single-page app, so unknown paths must serve `index.html`. `public/_redirects` (Netlify/Cloudflare) and `vercel.json` already do this; on other servers add the equivalent rewrite. Without it, scanning a QR code gives a 404.
In Supabase → *Authentication → URL configuration* set the Site URL to your address.

## 6. Load the sample exercise (optional)

`sample/` holds a finished exercise (notched block with a through-hole): three drawings, a GLB model, dimensions. To load it into your project, on your own computer only:

```bash
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...      # Project settings → API → service_role. Keep secret, never commit, never VITE_.
npm run seed:sample
```

It prints the exercise code. Alternatively create the exercise by hand in the faculty area using the files in `sample/`. `npm run sample` rebuilds those files and re-checks that the GLB matches the geometry.

## Using it

- **Create Exercise**: sections A to E on one page. Choose first or third angle explicitly (nothing is assumed). Upload the three drawings (rotate or trim white margins before upload if needed). Attach a `.glb` or `.stl` model, or build one with the geometry builder (block plus through-holes, blind holes, pockets, slots and steps).
- **Models**: GLB is best. STEP files cannot be shown in a browser and no conversion service is connected, so the app says so and does not pretend to convert them. Pictures are never turned into 3D models. glTF uses metres: if you give a reference dimension, the app compares it with the model and warns about unit mistakes.
- **Publish** unlocks only when the checklist is complete, including an automatic test that decodes the generated QR image and compares it with the intended address. The database also refuses to publish without three views and a model.
- **QR Code Manager**: download PNG or SVG, copy the link, run the decode test, open the printable worksheet. **Worksheet → Print / Save as PDF** uses the browser's print dialog (choose "Save as PDF").
- **Students** open the QR link (phone camera app) or use the scanner or code box on the home page. The in-app scanner needs https and camera permission.

## Security notes

- The browser only holds the anon key. Reading and writing is controlled by Postgres row-level security and by security-definer functions; the faculty screens being hidden is a convenience, not the protection. `supabase/tests/` checks these rules.
- Students (anonymous) can read published exercises only, through `get_public_exercise`. Drafts and archived exercises answer "not available".
- **Public storage bucket trade-off:** drawings and models are stored in a public bucket under unguessable paths (`<uuid>/<kind>-<random>.<ext>`). Anyone who knows an exact file URL can fetch it, including for an unpublished exercise. Paths are not listed anywhere public. If drafts must be strictly confidential, switch the bucket to private and serve signed URLs (a code change).
- Uploads are validated in the browser (type and size) and by the bucket (allowed types, 50 MB limit). Browser checks are not security; the bucket rules are.
- Rate limiting: Supabase applies its own auth and API limits (see Authentication → Rate limits). There is no extra application-level limiter.
- Analytics store a random per-tab session id, the exercise, the source and the time. No names or emails.

## Backup and recovery

Enable Supabase daily backups (paid plans) or run `pg_dump` on a schedule. Storage files are not in database dumps: download the `exercise-assets` bucket separately. Keep the SQL migration and `.env` values in your records. If the public address changes, old printed QR codes keep pointing to the old address: keep a redirect from it.

## AI reconstruction (future)

Not implemented and not operational. The editor shows a disabled panel that says so. The design leaves room for it: the three drawings are stored in separate fields (`front_view_path`, `top_view_path`, `side_view_path`) with the projection convention (`projection_type`, `side_view_kind`), and a model is just a GLB path with `model_source` (`none`, `upload`, `generated`). A future service could read the drawings, return a GLB, and faculty would review it as a draft before use. Until such a service exists, the fallback is uploading a model or using the geometry builder.

## Project layout

```
supabase/migrations/0001_schema.sql   tables, row-level security, storage, functions
supabase/tests/                       SQL policy tests (need a scratch Postgres, see run.sh)
src/lib/                              geometry builder, projection layout, QR rules, API, auth
src/components/                       3D viewer, orthographic views, QR block
src/pages, src/admin                  student and faculty screens
scripts/                              sample generator, sample loader (service key, local use only)
tests/smoke.mjs                       browser smoke test with a mocked backend
```

Commands: `npm run dev | build | typecheck | test | sample | seed:sample`.

## Known limits

- Chamfers and fillets are not available in the geometry builder (the builder says so); upload a model for those.
- Alignment guides only mean something when each drawing is cropped to the part's outline. They do not match individual edges, and the app does not claim they do.
- Dimension labels on the 3D view show the overall length, width and height only.
- Only the three standard views are supplied per exercise; Back and Bottom camera views have no matching drawing and the app says so.
