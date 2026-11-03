#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * The topic a programmatic page's prose names is a noun phrase, never a whole
 * question or ranking query (scripts/lib/programmatic_prose.js nounTopic).
 * Dropped whole into a slot, "how to host a virtual event" gave readers
 * "narrow how to host a virtual event work".
 */
'use strict';
const { nounTopic, topicFor } = require('./lib/programmatic_prose.js');

let failed = 0;
const expect = (name, actual, want) => {
  if (actual !== want) { failed++; console.error(`FAIL ${name}: got ${JSON.stringify(actual)}, want ${JSON.stringify(want)}`); }
};

const cases = [
  ['how to host a virtual event', 'virtual event hosting'],
  ['how to host virtual events', 'virtual event hosting'],
  ['how do I run webinars', 'webinar running'],
  ['how to plan a hybrid event for 500 people', 'planning a hybrid event for 500 people'],
  ['best virtual event platforms', 'virtual event platforms'],
  ['top virtual conference platforms', 'virtual conference platforms'],
  ['platforms to host virtual events', 'virtual event hosting platforms'],
  ['common challenges in virtual broadcast production', 'virtual broadcast production'],
  ['what is a run of show', 'run of show'],
  ['virtual event trends 2026', 'virtual event trends'],
  ['event run of show template', 'event run of show'],
  // Already a noun phrase, or too little left to name anything: unchanged.
  ['virtual event production', 'virtual event production'],
  ['livekit', 'livekit'],
  ['best platforms', 'best platforms'],
  ['how to choose', 'how to choose'],
];
for (const [q, want] of cases) expect(`nounTopic(${JSON.stringify(q)})`, nounTopic(q), want);

// The page's topic: a query with no intent phrase and no cluster label is
// reshaped, not printed whole; a bucket key is still never the topic.
expect('topicFor a how-to query with a bucket cluster',
  topicFor({ query: 'how to host a virtual event', needle: null, audience: null, clusterLabel: 'unclustered' }),
  'virtual event hosting');
expect('topicFor keeps a real cluster label',
  topicFor({ query: 'livekit', needle: null, audience: null, clusterLabel: 'Virtual Event Platforms' }),
  'virtual event platforms');

if (failed) process.exit(1);
console.log(`test:programmatic-topic OK: ${cases.length + 2} queries named by a noun phrase`);
