#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * The rewrite bar refuses filler (scripts/lib/rewrite_quality.js). Proven both
 * ways: a page body repeating one slot phrase more than three times fails, the
 * same page without the repetition passes, and an invented number fails.
 */
'use strict';
const { check } = require('./lib/rewrite_quality.js');

const facts = ['Moderated webinars: $2,500 to $7,500 per production.'];
const PARAS = [
  'Before the day, the producer briefs every speaker in writing, collects slides a week early, and checks each microphone, camera and network on the setup the speaker will really use, so nothing new appears on the morning of the webinar.',
  'Rehearsal happens on the real platform with the real slides. The producer runs every transition, plays each video, tests the poll and the question tool, and times the whole run so the host knows where to cut if a segment overruns.',
  'During the live session one person calls cues, one moderates questions, and a backup stream stays ready to take over. Speakers only present; they never manage the platform, the chat or the recording themselves.',
  'Choosing the platform comes first. A webinar for prospects needs registration, reminders and analytics; an internal briefing needs single sign-on and a reliable recording; a partner session needs breakout rooms. Match the tool to the job before booking speakers.',
  'Afterwards the recording is trimmed, captioned and sent to registrants with the slides. Short clips go to social channels, and unanswered questions get a written reply in the follow-up email so every attendee hears back.',
];
const para = (i) => PARAS[i];
const base = () => ({
  h1: 'Webinar production checklist for a launch',
  definition: 'A webinar production checklist is the list of tasks a producer completes before, during and after a live webinar so the presenters only have to present: platform setup, speaker rehearsal, run of show, moderation, a backup stream and the recording edit.',
  sections: [0, 1, 2, 3, 4].map((i) => ({ h2: `What happens in stage ${['one', 'two', 'three', 'four', 'five'][i]}?`, blocks: [{ p: para(i) }, ...(i === 0 ? [{ ul: ['Brief every speaker in writing', 'Test each speaker setup a week before', 'Keep a backup stream ready to switch'] }] : [])] })),
  faq: [
    { q: 'Who should host the webinar?', a: 'The person the audience came to hear. Keep them free of every platform task: a producer runs slides, polls and the backstage, and a moderator handles questions, so the host can look at the camera and talk.' },
    { q: 'Do speakers need special equipment?', a: 'Usually a wired headset or a decent USB microphone, a camera at eye level and a wired connection beat any upgrade. The technical check finds the weak link while there is still time to post a microphone to the speaker.' },
    { q: 'How far ahead should we start?', a: 'Start with the date and work back: speakers need the brief and a technical check well before the day, slides need a review round, and registration needs time to fill. A repeat format moves faster because the run of show and graphics already exist.' },
    { q: 'What if the stream drops?', a: 'The backup stream takes over and the moderator tells the audience in chat what happened and when the session resumes. The run of show names who makes that call, so nobody debates it while the audience waits.' },
  ],
});

let failed = 0;
const expect = (name, cond) => { if (!cond) { failed += 1; console.error(`FAIL ${name}`); } };

const good = check(base(), { allowedFacts: facts });
expect(`a specific page passes (${good.fails.join('; ')})`, good.ok);

const slot = base();
for (const s of slot.sections) s.blocks.push({ p: 'Treat audience participation as the read on whether the sequence is running clean, and decide again.' });
const r1 = check(slot, { allowedFacts: facts });
expect('a body repeating one slot phrase four times fails', !r1.ok && r1.fails.some((f) => f.startsWith('REPEATED_PHRASE')));

const num = base();
num.sections[0].blocks.push({ p: 'Most teams see a 37% lift in attendance when they do this.' });
const r2 = check(num, { allowedFacts: facts });
expect('an invented figure fails', !r2.ok && r2.fails.some((f) => f === 'UNSOURCED_NUMBER:37'));

const price = base();
price.sections[0].blocks.push({ p: 'A moderated webinar costs $2,500 to $7,500 to produce.' });
expect('a figure from an approved fact passes', check(price, { allowedFacts: facts }).ok);

if (failed) process.exit(1);
console.log('test:rewrite-quality OK: filler and invented numbers are refused; specific pages pass');
