// TGWAB — the interpolated-JSON XSS rule. DEV-STANDARDS §15.
//
// Place at:  eslint.config.js  (repo root; merge into an existing flat config)
// Fixture:   templates/xss-lint-fixture.js  →  test/xss-lint-fixture.test.js
//
// WHAT IT CATCHES. `JSON.stringify` interpolated into a template literal that
// becomes HTML. A string ending `</script>` closes the tag early and everything
// after it is markup, so a value the user controls becomes script. The remedy is
// never a different escaper — it is to stop putting data in a script body:
//
//     BAD   `<script>window.__D__ = ${JSON.stringify(d)};</script>`
//     GOOD  `<div id="d" data-payload="${escapeAttr(JSON.stringify(d))}"></div>`
//           …then JSON.parse(el.dataset.payload) on the client.
//
// WHY THE SELECTOR IS A DESCENDANT (` `) AND NOT A DIRECT CHILD (` > `).
// This is measured, not argued. Both forms were run against the seven-case
// fixture that ships beside this file:
//
//     TemplateLiteral > CallExpression[…]   catches 2 of 5 hazards
//     TemplateLiteral   CallExpression[…]   catches 5 of 5
//
// The three the direct-child form misses are ordinary code, not exotic:
//
//     ${n ? JSON.stringify(n) : 'null'}     the call is under a Conditional
//     ${escapeHtml(JSON.stringify(n))}      the call is an argument
//     ${xs.map((x) => JSON.stringify(x))}   the call is inside an arrow body
//
// In each the CallExpression is a GRANDCHILD of the TemplateLiteral, so `>` does
// not match. Both forms leave both negative controls alone, so the descendant
// form is strictly better rather than merely louder. Re-run the fixture before
// believing this comment.
//
// ON `${escapeHtml(JSON.stringify(x))}` — READ THIS BEFORE DECIDING THE RULE IS
// WRONG. The rule flags it, and it is NOT exploitable: HTML entities are not
// decoded inside a `<script>` element, so `&lt;/script&gt;` cannot close the tag.
// What you get is broken JavaScript, not XSS. It is still the wrong pattern, the
// remedy is the same data attribute, and the flag is correct — but the finding is
// "this does not work", not "this is a hole". Say that in review, or someone will
// conclude the rule is wrong rather than that their code is.
//
// The rule is deliberately blunt: it does not test whether the literal contains
// `<script`. A rule gated on that misses every case where the tags come from a
// wrapper — which is the bug resizewizard-api's rule was written for and does not
// catch. Blunt plus a declared opt-out beats clever and silent.

import js from '@eslint/js';
import globals from 'globals';

export default [
  // ---------------------------------------------------------------------------
  // WHAT IS NOT LINTED: generated output and vendored code — files nobody here
  // wrote. Global ignores, so they apply to every block below.
  //
  // THE `**/` PREFIXES ARE LOAD-BEARING, and this is measured. A bare `dist/`
  // matches the REPO-ROOT dist only. The estate keeps 24 `dist/`, 29 `.astro/`,
  // and 33 `.wrangler/` directories and they are routinely nested —
  // `herald/ui/dist`, `muster/worker/.wrangler`, `tomatick/site/.astro`. The
  // shipped `dist/` caught the root one and missed every nested one.
  //
  // `vendor` is the one that actually bites in CI, and NOT `dist`: lint runs
  // before build, so `dist/` does not exist yet on a CI run. `ipcow.com` alone
  // reports 148 errors, every one of them inside one committed
  // `public/vendor/leaflet/leaflet.js`. Vendored code sits at six different
  // depths across the estate and one of them (`mykk.us-extension/worker/src/
  // vendor`) is UNDER `src/`, so it defeated the old scope too.
  // ---------------------------------------------------------------------------
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/build/',
      '**/.astro/',
      '**/.wrangler/',
      '**/vendor/**',
      '**/*.min.js',

      // The §15 fixture is a SPECIMEN, and this line is what keeps `npm run
      // lint` green in a repo that complies with §15 by shipping it. Measured:
      // without this, the fixture's five deliberate hazards become five errors
      // in every adopting repo, and the obvious "fix" is to delete the control.
      //
      // DO NOT rename the test's synthetic lint path to match this pattern. The
      // test lints the fixture's TEXT under `src/__xss-lint-fixture__.js`; the
      // leading and trailing underscores are why this ignore does not swallow
      // it. Rename it to `src/xss-lint-fixture.js` and this ignore swallows the
      // fixture: ESLint returns one "File ignored" warning and no findings, so
      // `flaggedCases()` is `[]` and BOTH assertions go RED — `toEqual([case1
      // ..case5])` and `toContain('case1')`. THE TEST FAILS LOUDLY. Measured
      // 2026-09-05 on eslint@10.9.1 against this config: the underscored path
      // reports 5 cases and both assertions green; the renamed path reports 0.
      //
      // THIS COMMENT SAID "the test goes green reporting zero findings" UNTIL
      // 2026-09-05, and shipped that to eleven adopters — counted in
      // `eslint.config.{js,mjs}` at each default branch, which is a different
      // population from the fixture generations. The kit's own test
      // file had already been corrected; this half had not, so the two halves
      // of one kit contradicted each other and the wrong half was the one every
      // adopter reads. The reason to keep the underscores is that the rename
      // DESTROYS THE MEASUREMENT, not that it hides the failure — a control
      // that passed by not running is the failure this fixture exists to
      // prevent, and this one does not do that. Re-derive before editing this
      // paragraph; it has been wrong once. (DS §15 trap 9.)
      //
      // That outcome is WHOLE ADOPTION — a repo carrying this config, so this
      // ignore is present. A repo that merged the §15 blocks into its own
      // config need not have it, and there the rename changes nothing: the run
      // still reports 5 and still passes. `xss-lint-fixture.test.js` carries
      // the full treatment of both shapes. Read which one you are in before
      // concluding anything from a rename.
      '**/xss-lint-fixture.js',
    ],
  },

  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // `webextensions` supplies `chrome` and `browser`. Without it every
      // `chrome.*` call in an extension repo is a `no-undef` error, which is a
      // large share of the noise in exactly the repos §15 most needs to reach.
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.webextensions,
        // Vendored inline libraries still in index.html <script> blobs.
        hljs: 'readonly',
        jsyaml: 'readonly',
        JSON5: 'readonly',
        JSZip: 'readonly',
        DOMPurify: 'readonly',
        marked: 'readonly',
        beautifier: 'readonly',
        XLSX: 'readonly',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // CROSS-FILE GLOBAL, DECLARED RATHER THAN SUPPRESSED.
  //
  // eml-core.js assigns `root.EMLCORE`; app.js consumes it. They load in
  // document order as two plain <script src> tags, so the reference is correct
  // at runtime — ESLint simply does not track globals across files without
  // being told. A per-line suppression would silence any future undefined name
  // on those lines too. Declaring the name says what is true.
  // ---------------------------------------------------------------------------
  {
    files: ['app.js'],
    languageOptions: {
      globals: { EMLCORE: 'readonly' },
    },
  },

  {
    rules: {
      // ESLint 9 changed `caughtErrors` from 'none' to 'all', so every
      // `catch (e) {}` that ignores its binding became an error on upgrade.
      // Measured: 57 of 80 unused-variable findings estate-wide are caught
      // errors, 33 of them the same copied `test/harness.mjs` across the viewer
      // family. This restores the pre-9 default rather than editing 33 copies
      // of a harness to say `catch {}`.
      'no-unused-vars': ['error', { caughtErrors: 'none', varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      // Same class as caughtErrors: none — empty `catch (e) {}` is how
      // this family swallows storage/media errors. allowEmptyCatch, not no-empty off.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // ---------------------------------------------------------------------------
  // §15: required in any repo whose source renders HTML.
  //
  // WHY THE SCOPE IS `**/*.{js,mjs,cjs}` AND NOT A LIST OF DIRECTORIES OR ONE
  // EXTENSION. Read this before narrowing either half, because narrowing is how
  // this rule was inert on arrival — twice, in two unrelated ways.
  //
  // (1) THE PATH HALF. The shipped scope was `src/**/*.js`. Five repos have ZERO
  // files under `src/` — their JavaScript sits at the repo root — so the rule
  // matched nothing at all in them:
  //
  //     copywizard-extension       0 under src/,  5 .js at root
  //     capturewizard-extension    0 under src/, 10 .js at root
  //     bookmarkwizard-extension   0 under src/,  6 .js at root
  //     mykk.us-extension          0 under src/,  2 .js at root
  //     textwizard-tools           0 under src/,  1 .js at root
  //
  // Those are the browser extensions — the repos that render untrusted content
  // into a DOM, and so the ones this rule exists for. A security control that
  // covers everything except its highest-risk consumers is not a partial
  // control; it is a control that passes by not running.
  //
  // `*.js` + `src/**/*.js` would have fixed those five and NOTHING ELSE. The
  // estate already has a third layout and a fourth — `apps/<app>/src/`,
  // `worker/src/`, `js/`, `functions/` — and an enumerated list meets each new
  // one by silently matching zero files in it. That is the same defect again,
  // rediscovered later by whoever is unlucky. The `**/` prefix cannot fail that
  // way. Its failure mode is the opposite and the safe one: a layout nobody
  // anticipated gets linted, and if that surfaces vendored or generated code the
  // answer is a named entry in the ignores above, which is reviewable. Too many
  // findings is a conversation. Zero findings looks exactly like success.
  //
  // (2) THE EXTENSION HALF, which the path fix left behind. `**/*.js` matches
  // NEITHER `.mjs` NOR `.cjs`. Both are plain JavaScript that ESLint already
  // parses with no extra dependency and no parser option — they were excluded
  // only because the pattern named a single extension. Measured by planting ONE
  // byte-identical hazard three times and reading back which rules fired:
  //
  //     file          §15 rule   no-unused-vars (the control)
  //     hazard.js         1             1
  //     hazard.mjs        0             1   <-- linted, and not covered
  //     hazard.cjs        0             1   <-- linted, and not covered
  //
  // The control column is the whole point. `no-unused-vars` fired on all three,
  // so ESLint was demonstrably reading every file: the instrument worked and the
  // rule still said nothing. Widening the extension is free — same parser, same
  // dependencies, same fixture result (still 5 of 5, both negative controls
  // still clean).
  //
  // Measured across the 75 local clones with the ignores above applied: 371
  // `.js` and 149 `.mjs` (no `.cjs` in the estate yet). So the extension half
  // alone left 149 files of plain JavaScript unreachable — and 25 of the 58
  // repos that ship any plain JavaScript contain not one `.js` file, so the rule
  // was FULLY INERT in all 25. `uploadwizard-app` and every `*-viewer.us` are
  // among them.
  //
  // WHAT THIS SCOPE STILL DOES NOT REACH — DECLARED, SO A GREEN RUN IS NOT READ
  // AS COVERAGE. `.ts`, `.tsx`, and `.astro` are NOT linted by this config. They
  // need a parser (`typescript-eslint`, `eslint-plugin-astro`), which is a
  // dependency and an estate-level decision, not a glob edit — deliberately out
  // of scope here and owned by devops. It is also the larger half: the same scan
  // counts 315 `.ts` and 290 `.astro` against 520 files of plain JavaScript, and
  // in an Astro or TS repo the HTML is rendered in exactly the files this rule
  // cannot see. Widening to `.mjs`/`.cjs` moves the rule from 371 to 520 of
  // 1,125 source files (33% -> 46%). That closes a plain defect; it does not
  // finish the job.
  // ---------------------------------------------------------------------------
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'TemplateLiteral CallExpression[callee.object.name="JSON"][callee.property.name="stringify"]',
          message:
            'Do not interpolate JSON.stringify into a template literal — a value containing "</script>" closes the tag and becomes markup. Pass it through a data attribute and JSON.parse it on the client (DS §15).',
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // THE §15 KIT IS VENDORED, SO REPO-LOCAL STYLE DOES NOT APPLY TO IT.
  //
  // Both shipped files are specimens, not this repo's code. Their value is the
  // MEASUREMENT they encode -- a direct-child selector catches 2 of 5 hazards, a
  // descendant catches 5 of 5. If each repo reformats them to satisfy its own
  // style config the specimens diverge, the counts stop being comparable across
  // the estate, and the fixture stops being evidence and becomes decoration.
  // Any change to either file is a change to the STANDARD, not to the repo: it
  // lands in tgwab-standards and is re-vendored from there (DS §15).
  //
  // WHICH FILE ACTUALLY NEEDS THIS, BECAUSE IT IS NOT THE OBVIOUS ONE. The
  // unbraced `if (...) continue;` is in xss-lint-fixture.TEST.js, not in the
  // fixture -- the fixture contains no if/for/continue/break at all. The fixture
  // is also named in the global ignores above, so it is not linted in a repo
  // that adopts this config whole. An exemption naming only the fixture would
  // therefore be scoped to a file that has no offending line AND is not linted:
  // precise, inherited, and protecting nothing.
  //
  // The fixture IS still listed, and honestly: that entry is inert today and was
  // measured to be. It changes no outcome in either adoption shape -- whole
  // (fixture globally ignored, never linted) or partial, where repos merge the
  // §15 blocks into an existing config and keep their own `ignores`
  // (resizewizard-api is the live example). In the partial shape the fixture is
  // linted and does report errors, but they are the five deliberate XSS
  // findings, which no `curly` exemption touches. It is listed because §15
  // exempts the whole vendored kit from repo-local style and the config should
  // say what the standard says -- and so a future revision that gives the
  // fixture a conditional is covered without rediscovering this.
  //
  // SCOPED TO TWO FILENAMES, NOT TO A DIRECTORY. The adopting repo's own tests
  // keep `curly` and every other style rule. An exemption that leaks past its
  // two files is the silent version of this fix and looks identical to a working
  // one, so it is verified in both directions.
  //
  // KEEP THIS BLOCK LAST AMONG RULE BLOCKS. Flat config is last-wins; hoisted
  // above a repo's own style block, it is silently overridden.
  // ---------------------------------------------------------------------------
  {
    files: ['**/xss-lint-fixture.js', '**/xss-lint-fixture.test.js'],
    rules: { curly: 'off' },
  },

  // ---------------------------------------------------------------------------
  // THE OPT-OUT IS A DECLARATION, NOT AN ABSENCE.
  //
  // A repo that legitimately interpolates JSON into something that is not HTML
  // uncomments this block and names EVERY path with its reason. The point is the
  // same as MUSTER_OPT_OUT=1: a silence cannot be reviewed, and a repo that
  // simply never adopted the rule is indistinguishable from one that considered
  // it. A named exemption is a claim someone can check.
  //
  // Do NOT widen this to a whole directory to make a run green. One line per
  // reason, and if you cannot write the reason, the exemption is wrong.
  //
  // Known exemptions from the sweep of 75 clones, as worked examples:
  //
  //   proton-mail-bridge-client — 12 sites under src/: CLI stdout in --json
  //     mode, a JSON config write, an NDJSON audit append, an AppleScript
  //     string. None reaches a browser.
  //   tgwab-packages/packages/auth/src/licenseStore.js — storage payload.
  //   ipcow.com/apps/checkip/src/index.ts — a JSON API response.
  //
  // That last one is why "it returns a Response" cannot be the discriminator: a
  // Response is exactly what an HTML page is returned as too. The discriminator
  // is whether the string is ever parsed as HTML, and only a human knows that.
  // ---------------------------------------------------------------------------
  // {
  //   files: [
  //     'src/cli/output.js',      // --json mode writes to stdout, never a page
  //     'src/config/write.js',    // JSON config file on disk
  //   ],
  //   rules: { 'no-restricted-syntax': 'off' },
  // },
];

// ---------------------------------------------------------------------------
// Product JavaScript lives in app.js (and a *-core.js where this repo has one).
// Family backlog: MichalAFerber/cert-viewer.us#13.
// ---------------------------------------------------------------------------
