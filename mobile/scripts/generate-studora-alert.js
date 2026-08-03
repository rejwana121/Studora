#!/usr/bin/env node
/* global __dirname, Buffer */
'use strict';

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

// Fundamental + a phase-locked octave overtone (exact 2:1 ratio, so the two
// stay consonant with no beating) — same bell-tone construction as
// generate-focus-break-cue.js, just pitched higher for more urgency. Weights
// solved so the combined worst-case peak lands well under full scale: for
// phase-aligned sines at a 2:1 ratio with weights A and 0.4A, the combined
// peak factor is ~1.214*A (root of f'(theta)=0 for f(theta) = sin(theta) +
// 0.4*sin(2*theta)).
const FUNDAMENTAL_FREQ = 784; // G5
const OVERTONE_FREQ = 1568; // G6
const FUNDAMENTAL_PEAK_RATIO = 0.4283;
const OVERTONE_PEAK_RATIO = 0.1713;
const FUNDAMENTAL_AMPLITUDE = Math.round(FUNDAMENTAL_PEAK_RATIO * 32767);
const OVERTONE_AMPLITUDE = Math.round(OVERTONE_PEAK_RATIO * 32767);

// "Calm urgency", sustained: one short chime per second for the entire clip
// (a metronome-like cadence, not a siren sweep, not a melody, no voice) —
// distinct and noticeable throughout all 29 seconds without ever becoming a
// continuous tone. Each chime uses the same fast-attack/slow-decay bell
// envelope as before (quick onset reads as urgency, cosine decay keeps it
// calm rather than a harsh flat beep) and is followed by true silence, so
// the rhythm itself — not pitch or volume changes — carries the cue.
//
// PULSE_DURATION_S + GAP_DURATION_S deliberately sum to exactly 1 second
// (44100 samples) so that PULSE_COUNT repeats land on exact 1-second
// boundaries with zero rounding error, and PULSE_COUNT * 1s equals exactly
// the target clip duration.
const PULSE_DURATION_S = 0.35;
const GAP_DURATION_S = 0.65;
const PULSE_COUNT = 29;
const ATTACK_FRACTION = 0.12; // fraction of one pulse spent rising to peak

const TARGET_DURATION_S = 29.0; // iOS caps notification sounds at 30s; stay clear of the edge

const OUTPUT_PATH = path.join(__dirname, '..', 'assets', 'audio', 'studora_alert.wav');

function secondsToSamples(seconds) {
  return Math.round(seconds * SAMPLE_RATE);
}

// Fast-attack / slow-decay bell envelope for a single pulse, x in [0, 1].
// Rises smoothly from 0 to 1 over the first ATTACK_FRACTION of the pulse,
// then eases back down to exactly 0 by the end — both endpoints silent, so
// concatenating pulses with silent gaps never introduces a click.
function pulseEnvelope(x) {
  if (x < ATTACK_FRACTION) {
    return 0.5 * (1 - Math.cos((Math.PI * x) / ATTACK_FRACTION));
  }
  const decayX = (x - ATTACK_FRACTION) / (1 - ATTACK_FRACTION);
  return 0.5 * (1 + Math.cos(Math.PI * decayX));
}

function generateAlertTone() {
  const pulseSamples = secondsToSamples(PULSE_DURATION_S);
  const gapSamples = secondsToSamples(GAP_DURATION_S);
  const cycleSamples = pulseSamples + gapSamples;
  const totalSamples = PULSE_COUNT * cycleSamples;
  const samples = new Int16Array(totalSamples); // gaps stay at 0 (silence) by default

  const lastIndex = pulseSamples - 1;
  for (let p = 0; p < PULSE_COUNT; p++) {
    const pulseStart = p * cycleSamples;
    for (let i = 0; i < pulseSamples; i++) {
      const envelope = pulseEnvelope(i / lastIndex);
      const t = i / SAMPLE_RATE;
      const value =
        envelope *
        (FUNDAMENTAL_AMPLITUDE * Math.sin(2 * Math.PI * FUNDAMENTAL_FREQ * t) +
          OVERTONE_AMPLITUDE * Math.sin(2 * Math.PI * OVERTONE_FREQ * t));
      samples[pulseStart + i] = Math.round(value);
    }
  }
  return samples;
}

function buildWavBuffer(samples) {
  const dataSize = samples.length * 2; // 16-bit mono
  const byteRate = (SAMPLE_RATE * NUM_CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (NUM_CHANNELS * BITS_PER_SAMPLE) / 8;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat = PCM
  buffer.writeUInt16LE(NUM_CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }

  return buffer;
}

function verifyWavFile(filePath, expectedSamples) {
  const buf = fs.readFileSync(filePath);

  const riffTag = buf.toString('ascii', 0, 4);
  const waveTag = buf.toString('ascii', 8, 12);
  const fmtTag = buf.toString('ascii', 12, 16);
  const audioFormat = buf.readUInt16LE(20);
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const dataTag = buf.toString('ascii', 36, 40);
  const dataSize = buf.readUInt32LE(40);

  const numSamples = dataSize / 2;
  const durationSeconds = numSamples / sampleRate;

  let peak = 0;
  let nonSilentCount = 0;
  const SILENCE_EPSILON = 4; // int16 units

  for (let i = 0; i < numSamples; i++) {
    const sample = buf.readInt16LE(44 + i * 2);
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    if (abs > SILENCE_EPSILON) nonSilentCount++;
  }

  const fileSize = buf.length;
  const expectedFileSize = 44 + expectedSamples * 2;

  return {
    riffTag,
    waveTag,
    fmtTag,
    dataTag,
    audioFormat,
    isPcm: audioFormat === 1,
    numChannels,
    sampleRate,
    bitsPerSample,
    numSamples,
    expectedSamples,
    sampleCountMatches: numSamples === expectedSamples,
    durationSeconds,
    durationMatchesTarget: Math.abs(durationSeconds - TARGET_DURATION_S) < 1e-9,
    peak,
    peakRatio: peak / 32767,
    clipped: peak >= 32767,
    fileSize,
    expectedFileSize,
    fileSizeMatches: fileSize === expectedFileSize,
    nonSilentCount,
    nonSilentRatio: nonSilentCount / numSamples,
  };
}

function main() {
  const samples = generateAlertTone();
  const wavBuffer = buildWavBuffer(samples);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, wavBuffer);

  const report = verifyWavFile(OUTPUT_PATH, samples.length);

  console.log('--- studora_alert.wav generated ---');
  console.log('Output path:', OUTPUT_PATH);
  console.log('');
  console.log('Format verification:');
  console.log(`  RIFF tag:          ${report.riffTag} (expected RIFF)`);
  console.log(`  WAVE tag:          ${report.waveTag} (expected WAVE)`);
  console.log(`  fmt  tag:          ${report.fmtTag} (expected "fmt ")`);
  console.log(`  data tag:          ${report.dataTag} (expected data)`);
  console.log(`  Audio format:      ${report.audioFormat} (${report.isPcm ? 'PCM - OK' : 'NOT PCM - FAIL'})`);
  console.log(`  Channels:          ${report.numChannels} (expected 1)`);
  console.log(`  Sample rate:       ${report.sampleRate} Hz (expected 44100)`);
  console.log(`  Bits per sample:   ${report.bitsPerSample} (expected 16)`);
  console.log('');
  console.log('Duration verification:');
  console.log(`  Sample count:      ${report.numSamples} (match: ${report.sampleCountMatches})`);
  console.log(
    `  Duration:          ${report.durationSeconds.toFixed(6)} s (expected exactly ${TARGET_DURATION_S.toFixed(
      1
    )} s, match: ${report.durationMatchesTarget})`
  );
  console.log(`  Under 30s ceiling: ${report.durationSeconds < 30}`);
  console.log('');
  console.log('Amplitude verification:');
  console.log(`  Peak sample:       ${report.peak} / 32767 (ratio ${report.peakRatio.toFixed(4)})`);
  console.log(`  Clipping:          ${report.clipped ? 'CLIPPED - FAIL' : 'none - OK'}`);
  console.log('');
  console.log('File size verification:');
  console.log(`  Actual size:       ${report.fileSize} bytes`);
  console.log(`  Expected size:     ${report.expectedFileSize} bytes (match: ${report.fileSizeMatches})`);
  console.log('');
  console.log('Content verification:');
  console.log(
    `  Non-silent samples: ${report.nonSilentCount} / ${report.numSamples} (${(report.nonSilentRatio * 100).toFixed(2)}%)`
  );

  const allOk =
    report.riffTag === 'RIFF' &&
    report.waveTag === 'WAVE' &&
    report.isPcm &&
    report.numChannels === 1 &&
    report.sampleRate === 44100 &&
    report.bitsPerSample === 16 &&
    report.sampleCountMatches &&
    report.durationMatchesTarget &&
    report.durationSeconds < 30 &&
    !report.clipped &&
    report.fileSizeMatches &&
    report.nonSilentCount > 0;

  console.log('');
  console.log(allOk ? 'RESULT: ALL CHECKS PASSED' : 'RESULT: ONE OR MORE CHECKS FAILED');

  if (!allOk) {
    process.exitCode = 1;
  }
}

main();
