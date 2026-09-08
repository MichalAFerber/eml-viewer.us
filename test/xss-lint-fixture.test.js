/**
 * TGWAB — the XSS rule's own control, node:test variant. DEV-STANDARDS §15.
 *
 * Place at:  test/xss-lint-fixture.test.js      (the SAME path as the vitest
 *            sibling — an adopter ships one of the two, never both)
 * Fixture:   test/fixtures/xss-lint-fixture.js  (byte-identical either way)
 *
 * WHICH TEMPLATE A REPO TAKES.
 *   templates/xss-lint-fixture.test.js       repo already runs vitest
 *   templates/xss-lint-fixture-node.test.js  everything else            <- this
 *
 * `node:test` and `node:assert/strict` are standard library, so this variant
 * adds ZERO dependencies. That asymmetry is the whole reason it exists: the
 * vitest template was the only one shipped, and it made `import ... from
 * 'vitest'` a hard prerequisite for a §15 control. Seven repos in the estate
 * carry the XSS rule with no vitest, and requiring it would add a second test
 * runner to each of them to obtain what Node already ships — which §15 already
 * declines to do elsewhere ("adding a test runner is a dependency decision,
 * not a glob edit").
 *
 * WHAT HAPPENED WITHOUT IT, because this is a repair and not a feature.
 * Measured 2026-09-07: two repos hand-ported the vitest template rather than
 * take a dependency — `gh-office` (93 lines) and `TGWAB/markdownwizard-tools`
 * (178) — and neither matched any template version ever shipped, so the estate
 * had three incompatible copies of a file §15 requires to be byte-identical.
 * Nothing reported it until `scripts/check-xss-kit-drift.sh` existed. This file
 * is SEEDED FROM `markdownwizard-tools`' port, which carried all four controls
 * correctly; the port was right and the kit was missing.
 *
 * THE TWO TEMPLATES MUST MEASURE IDENTICALLY, and that is enforceable rather
 * than hoped for: same fixture, same synthetic path, same five-of-five, same
 * two negative controls, same coverage declaration, same reported line. A
 * change to either is a change to the standard and lands in tgwab-standards
 * (§15) — never edited in an adopting repo. `scripts/check-xss-kit-drift.sh`
 * accepts a vendored copy that matches EITHER template and nothing else.
 *
 * WHERE THIS RUNS. In the ADOPTING repo, against that repo's own installed
 * ESLint and its own eslint.config.js — not in tgwab-standards, which has no
 * package.json and whose CI runs one shell script. Adopting the rule means
 * adopting its control; a rule with no failing case has not been shown to work.
 *
 * WHY `lintText` WITH A SYNTHETIC PATH, AND NOT `lintFiles`.
 * The fixture is named in the config's global ignores (it must be, or its five
 * deliberate hazards fail every `npm run lint`), and flat-config scoping is by
 * path — so linting the fixture where it actually lives applies NO rule and the
 * run comes back clean.
 *
 * THE SYNTHETIC NAME'S UNDERSCORES MATTER IN ONE ADOPTION SHAPE AND NOT THE
 * OTHER, AND THIS FILE USED TO CLAIM OTHERWISE. Read which shape you are in
 * before concluding anything from a rename.
 *
 *   WHOLE ADOPTION — the repo takes this kit's `eslint.config.js` entire, so
 *   the global `'**\/xss-lint-fixture.js'` ignore is present. Here the
 *   underscores ARE load-bearing: `src/__xss-lint-fixture__.js` does not match
 *   that ignore, and renaming to `src/xss-lint-fixture.js` makes the fixture
 *   invisible, so `flaggedCases()` returns []. The run then reports zero
 *   findings and FAILS — `assert.deepEqual([...five cases])` catches it.
 *
 *   PARTIAL ADOPTION — the repo merged the §15 blocks into its own config,
 *   scoping the rule `files: ['src/**\/*.js']` and keeping its own `ignores`,
 *   which name no fixture because the fixture lives under `test/`.
 *   `resizewizard-api` is the live example. Here the disguise is protecting
 *   against an ignore that does not exist: renaming changes nothing, the run
 *   still reports 5 findings, and it still passes.
 *
 * This paragraph previously said the rename "makes this whole test report zero
 * findings AND PASS" — which described the first draft of this file, before the
 * `toEqual` existed. It was then wrong in every repo: it fails under whole
 * adoption and is inert under partial adoption. A warning about the failure
 * this fixture exists to prevent must not itself be stale, or a reader
 * restructures the test to close a hole that is already closed.
 *
 * `lintText` with `filePath` under src/ makes the repo's REAL config apply — the
 * same rule, the same scope, the same opt-out blocks — without putting a file
 * full of deliberate hazards where `npm run lint` would fail on it.
 *
 * WHAT IT ASSERTS, in three directions:
 *   - the five hazards flag (the rule can fire),
 *   - the two negative controls do not (the rule is not just shouting), and
 *   - the rule resolves for every file this repo NAMES as covered product
 *     source, in `fixtures/xss-lint-covers.json` (it is not merely wired).
 *
 * WHY THE THIRD EXISTS, AND WHY THE FIRST TWO CANNOT STAND IN FOR IT.
 * Everything above is measured through `lintText` at the SYNTHETIC path
 * `src/__xss-lint-fixture__.js`. That path is a string in this file, not a file
 * in the repo, and it matches the rule's glob no matter what the repo contains.
 * So the first two tests pass 5-of-5 with both controls clean in a repo where
 * the rule covers NOTHING — measured in `uploadwizard-app` and `cert-viewer.us`,
 * which ship zero `.js` files and were therefore fully inert under the earlier
 * `**\/*.js` scope while this fixture reported success.
 *
 * A fixture is a control on whether the rule is WIRED. It was never a control on
 * whether the rule REACHES anything, and it was being read as one.
 *
 * HOW THE THIRD IS BUILT, because the obvious versions are all wrong, AND THIS
 * PARAGRAPH HAS ALREADY BEEN WRONG ONCE — it described a count long after the
 * count stopped being the assertion. Read the code below before trusting it.
 *   - A hardcoded source path in THIS file breaks in the next repo laid out
 *     differently. The path is named by the ADOPTER, in a sidecar this file
 *     reads, precisely so the kit itself can stay byte-identical everywhere.
 *   - Asserting a count equals the repo's file count re-fails whenever somebody
 *     adds a file, so it gets deleted within the month.
 *   - Asserting "more than zero files are covered" was the assertion here until
 *     2026-09-05, and it is the original bug in new clothing. It passed at 7 of
 *     29 in `resizewizard-api`, over the scope defect that repo's own #62
 *     documents; and at 3 of 3 in `uploadwizard-app`, where all three files are
 *     build tooling and the 141 .astro/.ts files that render the HTML are
 *     invisible. A proportion is worse still: uploadwizard-app scores 100%.
 *
 * So the count is REPORTED and the ADOPTER'S NAMED FILES are asserted. It asks
 * ESLint itself, per file, whether THIS rule resolves for it. `isPathIgnored`
 * drops what the config excludes — and also drops `package.json`, `README.md`,
 * and everything else ESLint would not lint, so the reported denominator needs
 * no extension list of its own to maintain. `calculateConfigForFile` then says
 * whether `no-restricted-syntax` resolves to an error carrying the
 * JSON.stringify selector, rather than merely to some rule of that name the repo
 * configured for its own reasons.
 *
 * THE THREE EXCLUDED FILENAMES ARE THE POINT. `eslint.config.js`,
 * `xss-lint-fixture.js`, and `xss-lint-fixture.test.js` are the files a repo
 * GAINS BY ADOPTING THIS KIT. Measured: in a repo with no `.js` source at all,
 * `eslint.config.js` and this very test file both resolve the rule — so without
 * the exclusion the assertion passes by proving the kit lints itself, which is
 * not coverage. Do not "simplify" it by dropping them.
 *
 * WHAT IT STILL DOES NOT PROVE: that the rule reaches the source that renders
 * HTML. `.ts`, `.tsx`, and `.astro` are not linted by the shipped config, so in
 * an Astro or TypeScript repo this passes on a `.mjs` build script while the
 * pages stay invisible. That gap is declared in `eslint.config.js`. This test
 * raises the bar from "wired" to "not inert" — not to "covered".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, relative, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, 'fixtures/xss-lint-fixture.js');

/** Case numbers the rule fired on, read back from the fixture's own markers. */
async function flaggedCases() {
  const code = readFileSync(FIXTURE, 'utf8');
  const eslint = new ESLint();
  // Linted AS IF it lived in src/, so the repo's own scoping applies.
  const [result] = await eslint.lintText(code, {
    filePath: resolve(process.cwd(), 'src/__xss-lint-fixture__.js'),
  });
  const lines = code.split('\n');
  const cases = new Set();
  for (const m of result.messages) {
    if (m.ruleId !== 'no-restricted-syntax') continue;
    for (let i = m.line - 1; i >= 0; i--) {
      const name = /function (case\d)/.exec(lines[i]);
      if (name) {
        cases.add(name[1]);
        break;
      }
    }
  }
  return [...cases].sort();
}

test('the XSS rule flags all five hazards, including the three a direct-child selector misses (DS §15)', async () => {
  const flagged = await flaggedCases();
  // case3 conditional, case4 wrapper call, case5 arrow in .map() — each a
  // GRANDCHILD of the TemplateLiteral. A `TemplateLiteral > CallExpression`
  // selector returns only case1 and case2, which is what this pins against.
  assert.deepEqual(flagged, ['case1', 'case2', 'case3', 'case4', 'case5']);
});

test('the XSS rule leaves the two negative controls alone (DS §15)', async () => {
  const flagged = await flaggedCases();
  // THIS ASSERTION COMES FIRST BECAUSE THE TWO BELOW CANNOT STAND WITHOUT IT.
  // A rule that is switched off flags nothing, and nothing contains neither
  // control — so the two `assert.ok(!...)` below pass green on a wholly
  // INERT rule. Measured with `no-restricted-syntax: 'off'`: the test above
  // goes red,
  // this one stayed green and reported success. Conjoined with that test the
  // pair was always sound, but this file's own framing — "a run proves the
  // rule can both fire and stay silent" — reads as if each half stands
  // alone, and half of it did not. Establishing that the rule fired at all is
  // what makes the silence below evidence rather than an absence.
  assert.ok(flagged.includes('case1'));
  // case6 is the literal TEXT "JSON.stringify" in a script template; case7 is
  // an ordinary call nowhere near a template. A rule that flagged either would
  // be unusable, and this is what says it does not.
  assert.ok(!flagged.includes('case6'));
  assert.ok(!flagged.includes('case7'));
});

/**
 * Filenames a repo GAINS BY ADOPTING THIS KIT, excluded from the count below:
 * a rule that resolves only for these proves the kit lints itself.
 */
const KIT_FILES = new Set([
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'xss-lint-fixture.js',
  'xss-lint-fixture.test.js',
]);

/** Every path in the working tree, minus VCS metadata and installed deps. */
function* shippedFiles(dir, root) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* shippedFiles(full, root);
    else if (entry.isFile()) yield relative(root, full);
  }
}

/**
 * Whether a RESOLVED config carries this rule as an error. Severity is checked
 * against the number 2 because `calculateConfigForFile` normalises it; the
 * selector is checked so a repo's own unrelated `no-restricted-syntax` cannot
 * satisfy this by name alone.
 */
function carriesTheRule(config) {
  const entry = config?.rules?.['no-restricted-syntax'];
  if (!Array.isArray(entry) || entry[0] !== 2) return false;
  return entry
    .slice(1)
    .some(
      (o) =>
        typeof o?.selector === 'string' &&
        o.selector.includes('JSON') &&
        o.selector.includes('stringify'),
    );
}

async function ruleCoverage(root = process.cwd()) {
  const eslint = new ESLint();
  const covered = [];
  let linted = 0;
  for (const rel of shippedFiles(root, root)) {
    if (KIT_FILES.has(basename(rel))) continue;
    if (await eslint.isPathIgnored(rel)) continue;
    linted++;
    if (carriesTheRule(await eslint.calculateConfigForFile(rel))) covered.push(rel);
  }
  return { covered, linted };
}

/**
 * The adopter's own declaration of what the rule covers. Sits beside the
 * fixture, resolved from THIS file rather than from `process.cwd()`, so it is
 * found identically whether CI runs at the repo root or inside a workspace
 * package.
 *
 * THAT ROBUSTNESS USED TO STOP AT THE FILE AND NOT REACH THE NAMES INSIDE IT.
 * The names then went through `existsSync` and `calculateConfigForFile`, both
 * cwd-relative, so finding the sidecar from a subdirectory only bought four
 * confusing "does not exist" failures instead of one clear one. Two adopters
 * had already resolved the ambiguity in opposite directions — `wizard-web`
 * writes `../../apps/…` because `turbo` runs the suite inside
 * `packages/config`, `mykk.us-extension` writes `content.js` from the repo
 * root — so the same field meant two things. `resolveNamed` below accepts
 * both.
 */
const COVERS = resolve(here, 'fixtures/xss-lint-covers.json');

/**
 * The repo root: the nearest ancestor of THIS file holding `.git`. A worktree's
 * `.git` is a file rather than a directory, which `existsSync` handles.
 */
function repoRoot() {
  let dir = here;
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * A name from the declaration, resolved to an absolute path. Tried against the
 * cwd first and the repo root second, so a declaration written for either
 * convention works from either place. Returns null when the file is at neither,
 * which is the declaration doing its job.
 */
function resolveNamed(named, root) {
  const fromCwd = resolve(process.cwd(), named);
  if (existsSync(fromCwd)) return fromCwd;
  if (root) {
    const fromRoot = resolve(root, named);
    if (existsSync(fromRoot)) return fromRoot;
  }
  return null;
}

/**
 * WHY A NAMED FILE AND NOT A COUNT. Read this before replacing it with a
 * number, because a number is what it replaced.
 *
 * This assertion used to be `assert.ok(covered.length > 0)` — "the
 * rule reaches at least one file this repo ships." That is not the claim
 * anybody read it as, and both failure directions were measured on 2026-09-05:
 *
 *   resizewizard-api    passes at 7 of 29, sailing straight over the scope
 *                       defect its own issue #62 documents.
 *   uploadwizard-app    passes at 3 of 3 — a PERFECT proportion — where all
 *                       three files are `astro.config.mjs`, a migrations
 *                       runner, and a version stamper. None renders HTML. The
 *                       141 .astro/.ts files that do, 49 of them containing
 *                       JSON.stringify, are invisible to the rule.
 *
 * A FLOOR PROPORTION WOULD HAVE BEEN WORSE, WHICH IS WHY THIS IS NOT ONE.
 * uploadwizard-app scores 100%. It is the worst-covered repo in the estate and
 * the only one a proportion would have called perfect. Any threshold is
 * satisfiable by a repo whose linted set is entirely build tooling, because the
 * denominator is "files ESLint lints" and build tooling is the part of a
 * TypeScript repo that ESLint can still parse.
 *
 * So the adopter NAMES the files instead, in `fixtures/xss-lint-covers.json`,
 * and this asserts the rule actually resolves for each one. The gain is not
 * arithmetic — it is that the claim becomes FALSIFIABLE BY A REVIEWER. A count
 * cannot be wrong in an interesting way. "src/portal.js is product source this
 * repo ships" can be wrong, and a human can say so in review.
 *
 * BE HONEST ABOUT WHAT THIS IS. Nothing here can check that a named file is
 * genuinely product source rather than a build script — that judgement is the
 * adopter's and the reviewer's. This is a REVIEWABLE DECLARATION, not a
 * measurement. Recording that plainly is the point: the reason the `> 0`
 * version failed was that it was read as a measurement of coverage when it was
 * only ever a measurement of non-inertness, and replacing one overclaiming
 * control with another would be the same mistake wearing a different number.
 *
 * THE EMPTY DECLARATION IS A FEATURE, NOT AN ESCAPE HATCH. A repo whose product
 * source this kit cannot parse (.ts/.tsx/.astro) declares `covers: []` and
 * writes `declaredGap`. It stays green — the gap is an estate-level decision
 * that no single repo can fix by editing a glob — but it now says so IN THE
 * REPO, where a reviewer meets it, instead of reporting a confident 3 of 3.
 * That converts a silence into a claim, which is the same move as §15's rule
 * opt-out.
 */
/**
 * Shapes that are NOT product source. Deliberately short and evidence-led: each
 * entry is a file that was actually named as coverage by a repo covering
 * nothing real, not a guess at what build tooling looks like.
 *
 * Measured 2026-09-05 in `uploadwizard-app`, whose coverage check passed 3 of 3
 * on exactly these three shapes — `astro.config.mjs`, `migrations/run.mjs`,
 * `scripts/stamp-version.mjs` — while 141 .astro/.ts files rendered the HTML.
 * Blocking them turns the one case that actually happened from "a reviewer
 * might notice" into "CI says so."
 *
 * THE SECOND PATTERN IS ANCHORED, AND THAT ANCHOR IS LOAD-BEARING. It matches
 * only at the top of the path the adopter names — `scripts/stamp-version.mjs`,
 * not `apps/punctuationwizard/src/scripts/tool-mount.js`. The unanchored version
 * was written first and rejected that second file, which is real browser product
 * source in `wizard-web`, on its first run against a monorepo. A denylist that
 * blocks legitimate source is worse than one that misses a case: the miss is
 * caught in review, the false positive is "fixed" by weakening the check.
 *
 * SO THIS DOES NOT CATCH EVERYTHING, deliberately. `apps/foo/scripts/build.mjs`
 * passes it. That is the reviewer's job and this file cannot do it — see the
 * honesty note above about what this control is.
 *
 * `../../scripts/foo.js` USED TO PASS IT TOO, and no longer does: the name is
 * normalised to its repo-root-relative form before these run, so a path that
 * climbs out of a workspace package is tested as the anchor reads it. That is a
 * side effect of fixing the resolution, not a second control.
 *
 * A repo whose genuine product source lives at one of these top-level paths
 * raises it in tgwab-standards rather than editing this vendored file — that is
 * §15's rule for any change to the kit, not a special case here.
 */
const NOT_PRODUCT_SOURCE = [
  /(^|\/)[^/]*\.config\.(js|mjs|cjs)$/,
  /^(scripts|migrations|tests?|__tests__|e2e|loadtest|test-kit)\//,
];

function readDeclaration() {
  let raw;
  try {
    raw = readFileSync(COVERS, 'utf8');
  } catch {
    throw new Error(
      `DS §15: ${relative(process.cwd(), COVERS)} is missing. Create it naming ` +
        'the product source this repo ships that the rule must cover, e.g. ' +
        '{"covers": ["src/index.js"], "why": "renders the portal HTML"}. If this ' +
        'kit cannot parse this repo\'s product source (.ts/.tsx/.astro), use ' +
        '{"covers": [], "declaredGap": "<reason, and where it is tracked>"}.',
    );
  }
  const d = JSON.parse(raw);
  if (!Array.isArray(d.covers)) throw new Error('DS §15: `covers` must be an array.');
  return d;
}

test('the rule resolves for every file this repo NAMES as covered product source (DS §15)', async () => {
  const d = readDeclaration();
  const { covered, linted } = await ruleCoverage();

  // REPORTED, NOT ASSERTED. The shape is worth seeing — 7 of 29 and 3 of 3
  // are very different repos — but neither number is the gate, because both
  // of those passed the gate that WAS a number.
  //
  // WRITTEN STRAIGHT TO STDOUT, AND THE REASON IS THE SIBLING'S, NOT THIS
  // RUNNER'S. Do not "simplify" it to console.log on the grounds that the
  // hazard below does not apply here — parity is the point.
  //
  // In the vitest sibling this is load-bearing. vitest 4 picks its reporter
  // with `reporters.push([isAgent ? 'agent' : 'default', {}])`, and the agent
  // reporter is MinimalReporter with `silent: 'passed-only'` — console output
  // from PASSING tests is dropped. `isAgent` is std-env's, set by CLAUDECODE /
  // AI_AGENT / CURSOR_AGENT, so every agent-run `npm test` in this estate hid
  // the line while every CI run showed it. Three reviewers filed "the count
  // never appears" from such a run and blocked the amendment that added this
  // control.
  //
  // MEASURED FOR node:test, 2026-09-07, node v24.19.0: the hazard does NOT
  // reproduce here. Under `node --test`, console.log and process.stdout.write
  // are BOTH visible, with and without CLAUDECODE/AI_AGENT set — 1 occurrence
  // each in all four combinations. So this line is not fixing anything in this
  // file. It is here so both templates emit the SAME line by the SAME route,
  // which is what lets a reviewer compare a node:test adopter's output against
  // a vitest adopter's without knowing which runner produced it.
  process.stdout.write(
    `DS §15 coverage: the rule resolves for ${covered.length} of ${linted} ` +
      `linted files; ${d.covers.length} named as product source.\n`,
  );

  if (d.covers.length === 0) {
    assert.ok(
      typeof d.declaredGap === 'string' && d.declaredGap.trim().length > 0,
      'DS §15: `covers` is empty, so `declaredGap` MUST say why this kit ' +
        'reaches none of this repo\'s product source, and where that is ' +
        'tracked. An empty declaration with no reason is the silence this ' +
        'file exists to prevent.',
    );
    return;
  }

  const eslint = new ESLint();
  const root = repoRoot();
  for (const named of d.covers) {
    const abs = resolveNamed(named, root);
    // The form the denylist above is written against. Falls back to the raw
    // name when the file is at neither location — the existence check below
    // is the one that should report that, not a confusing denylist hit.
    const normalized = abs && root ? relative(root, abs) : named;

    assert.equal(
      KIT_FILES.has(basename(named)),
      false,
      `DS §15: \`${named}\` is a file this repo GAINS by adopting the kit. ` +
        'Naming it proves the kit lints itself, which is not coverage.',
    );
    assert.equal(
      NOT_PRODUCT_SOURCE.some((re) => re.test(normalized)),
      false,
      `DS §15: \`${named}\` is build tooling, not product source. A repo ` +
        'passed this check 3 of 3 on a config file, a migrations runner and a ' +
        'version stamper while every file that rendered HTML was invisible — ' +
        'which is why naming one fails here. If this repo genuinely ships ' +
        'product source from that path, raise it in tgwab-standards; do not ' +
        'edit this vendored file.',
    );
    assert.ok(
      abs !== null,
      `DS §15: \`${named}\` is named in xss-lint-covers.json but does not ` +
        `exist. Looked from the cwd (${process.cwd()}) and from the repo ` +
        `root (${root ?? 'not found'}). If it moved, update the ` +
        'declaration — this failing is the declaration doing its job.',
    );
    assert.ok(
      carriesTheRule(await eslint.calculateConfigForFile(abs)),
      `DS §15: the rule does NOT resolve for \`${named}\`, which this repo ` +
        'names as covered product source. Widen the rule block\'s `files` ' +
        'glob, or correct the declaration. Do not delete this test to go ' +
        'green.',
    );
  }
});
