/**
 * TGWAB — fixture for the interpolated-JSON XSS rule. DEV-STANDARDS §15.
 *
 * Place at:  test/fixtures/xss-lint-fixture.js
 * Its test:  test/xss-lint-fixture.test.js  (templates/xss-lint-fixture.test.js)
 *
 * WHY A FIXTURE SHIPS WITH THE RULE. A rule only ever shown to pass on clean
 * input has not been shown to do anything. This file is the positive control:
 * five cases that MUST flag and two that MUST NOT, so a run proves the rule can
 * both fire and stay silent. It is also how the selector choice was measured —
 * the direct-child form catches cases 1 and 2 only.
 *
 * THIS FILE IS DELIBERATELY NOT LINTED BY THE REPO'S OWN RUN. The config's
 * scope is `files: ['**\/*.js']`, which DOES reach this file, so what keeps it
 * out is the explicit `'**\/xss-lint-fixture.js'` entry in that config's global
 * ignores — named there with this reason. That is what lets `npm run lint` stay
 * green with a file full of deliberate hazards in the tree; without it this
 * fixture contributes five errors to every adopting repo. The test does NOT lint it where it sits — that would apply no rule at
 * all — it reads this text and lints it under a synthetic src/ path so the
 * repo's real scoping applies. See the test's header.
 */
/* eslint-disable no-unused-vars, no-undef -- every case here is a specimen: it
   is never called, and `escapeHtml` is deliberately undeclared because the
   point is the SHAPE of the call, not a working implementation. Only these two
   rules are disabled, and never no-restricted-syntax — disabling that would
   silence the very thing this file exists to trip. */
// Seven cases: five that MUST flag, two that MUST NOT.
// Numbered so a run's output can be read against the spec without counting.

// ---- MUST FLAG -------------------------------------------------------------

// 1. Direct child. The shape the shipped rules were written for.
function case1(n) {
  return `<script>window.__DATA__ = ${JSON.stringify(n)};</script>`;
}

// 2. Direct child, no <script> in this literal — the tags come from a wrapper.
//    This is the one resizewizard-api's `<script`-gated rule misses.
function case2(n) {
  return `window.__DATA__ = ${JSON.stringify(n)};`;
}

// 3. Grandchild via a conditional.
function case3(n) {
  return `<script>const n = ${n ? JSON.stringify(n) : 'null'};</script>`;
}

// 4. Grandchild via a wrapper call. NOT exploitable — see the template comment —
//    but the same wrong pattern with the same remedy.
function case4(n) {
  return `<script>const n = ${escapeHtml(JSON.stringify(n))};</script>`;
}

// 5. Grandchild via an arrow inside .map().
function case5(xs) {
  return `<script>const all = [${xs.map((x) => JSON.stringify(x))}];</script>`;
}

// ---- MUST NOT FLAG ---------------------------------------------------------

// 6. The literal TEXT "JSON.stringify" inside a browser-script template. No call.
function case6() {
  return `<script>console.log('use JSON.stringify here');</script>`;
}

// 7. An ordinary call, nowhere near a template literal.
function case7(x) {
  const body = JSON.stringify(x);
  return body;
}
