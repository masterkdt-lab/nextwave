#!/usr/bin/env node
/**
 * Restore link-preview metadata to a Claude Artifact export.
 *
 * The deployed index.html is a single-file artifact export from claude.ai.
 * Its outer <head> is REGENERATED on every export, and the exporter copies
 * only <title> across from the artifact's own <helmet> block — the viewport
 * meta and favicon link in the artifact source are both dropped, which is how
 * we know Open Graph tags added inside the artifact would be dropped too.
 *
 * Crawlers never run the unpacker script, so anything they must read has to
 * live in that outer head. This script puts it back, idempotently.
 *
 *   node apply-og.js index.html
 *
 * Exit 0 = file is correct (whether or not it changed). Exit 1 = error.
 */
'use strict';
const fs = require('fs');

const SITE = 'https://www.nextwave.bet';
const IMAGE = '/og-nwb.png';
const IMAGE_VERSION = 'v=2'; // bump when the card artwork changes
const TITLE = 'nw.b — advisors, partners, founders';
const DESCRIPTION = "Advisors, partners and founders building what's next. Think you belong?";
const IMAGE_ALT = 'The nw.b logo: an orange sun arc over blue water ripples.';

const BEGIN = '<!-- og:begin — managed by apply-og.js, do not edit by hand -->';
const END = '<!-- og:end -->';

const imageUrl = `${SITE}${IMAGE}?${IMAGE_VERSION}`;

const BLOCK = `${BEGIN}
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${DESCRIPTION}">

  <meta property="og:site_name" content="nw.b">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE}/">
  <meta property="og:title" content="${TITLE}">
  <meta property="og:description" content="${DESCRIPTION}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${IMAGE_ALT}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${TITLE}">
  <meta name="twitter:description" content="${DESCRIPTION}">
  <meta name="twitter:image" content="${imageUrl}">
  ${END}`;

const file = process.argv[2] || 'index.html';
let html;
try {
  html = fs.readFileSync(file, 'utf8');
} catch (err) {
  console.error(`apply-og: cannot read ${file}: ${err.message}`);
  process.exit(1);
}

// Only ever touch the OUTER head. The artifact's inner page is stored later in
// the file as a JSON-escaped string that also contains <head>/<title>/<meta>;
// rewriting inside it would corrupt the bundle.
const headEnd = html.indexOf('</head>');
if (headEnd === -1) {
  console.error('apply-og: no </head> found — is this the artifact export?');
  process.exit(1);
}
let head = html.slice(0, headEnd);
const rest = html.slice(headEnd);
const before = head;

// Drop a previous block so re-running replaces rather than stacks.
const managed = new RegExp(
  BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?\\s*'
);
head = head.replace(managed, '');

// Clear stray tags an export may have emitted, so we do not end up with two.
head = head
  .replace(/^[ \t]*<meta\s+(?:property|name)="(?:og|twitter):[^"]*"[^>]*>[ \t]*\r?\n?/gim, '')
  .replace(/^[ \t]*<meta\s+name="(?:description|viewport)"[^>]*>[ \t]*\r?\n?/gim, '');

// Anchor immediately after <meta charset>, which must stay first in the head.
const charset = head.match(/<meta\s+charset=["'][^"']*["']\s*\/?>/i);
if (!charset) {
  console.error('apply-og: no <meta charset> found — refusing to guess placement.');
  process.exit(1);
}
const at = head.indexOf(charset[0]) + charset[0].length;
head = head.slice(0, at) + '\n  ' + BLOCK + '\n' + head.slice(at);

// The exporter carries the artifact's <title> across; make it the real one.
head = head.replace(/<title>[\s\S]*?<\/title>/i, `<title>${TITLE}</title>`);

const out = head + rest;
if (out === before + rest) {
  console.log('apply-og: already up to date — no change.');
  process.exit(0);
}

fs.writeFileSync(file, out);

// Sanity check: the tags must be readable without running any JavaScript.
const check = out.slice(0, out.indexOf('</head>'));
const found = (check.match(/<meta\s+(?:property|name)="(?:og|twitter):/g) || []).length;
if (found !== 14 - 1) {
  // 13 og:/twitter: tags (description and viewport are not prefixed)
  console.error(`apply-og: expected 13 og/twitter tags in head, found ${found}.`);
  process.exit(1);
}
if (!fs.existsSync('og-nwb.png')) {
  console.warn('apply-og: WARNING — og-nwb.png is missing from this directory; previews will have no image.');
}
console.log(`apply-og: wrote ${file} — ${found} og/twitter tags in the static head.`);
