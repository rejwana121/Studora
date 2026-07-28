#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;
const PEAK_AMPLITUDE = Math.round(0.35 * 32767); // 11468, moderate but clearly audible

const TONE_FREQ = 528;
const DURATION_S = 0.9;

const OUTPUT_PATH = path.join(__dirname, '..', 'assets', 'audio', 'focus-break-cue.wav');

function secondsToSamples(seconds) {
  return Math.round(seconds * SAMPLE_RATE);
}

// Full-window Hann envelope: rises smoothly from 0 to a single peak at the
// midpoint and back to 0, so both endpoints are exactly silent (no click)
// and the tone reads as one soft swell rather than a flat-sustained beep.
function generateSwellTone(freq, totalSamples, peakAmplitude) {
  const samples = new Int16Array(totalSamples);
  const lastIndex = totalSamples - 1;
  for (let i = 0; i < totalSamples; i++) {
    const envelope = 0.5 * (1 - Math.cos((2 * Math.PI * i) / lastIndex));
    const t = i / SAMPLE_RATE;
    const value = peakAmplitude * envelope * Math.sin(2 * Math.PI * freq * t);
    samples[i] = Math.round(value);
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
  const totalSamples = secondsToSamples(DURATION_S);

  const samples = generateSwellTone(TONE_FREQ, totalSamples, PEAK_AMPLITUDE);

  const wavBuffer = buildWavBuffer(samples);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, wavBuffer);

  const report = verifyWavFile(OUTPUT_PATH, totalSamples);

  console.log('--- focus-break-cue.wav generated ---');
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
  console.log(
    `  Sample count:      ${report.numSamples} (expected ${report.expectedSamples}, match: ${report.sampleCountMatches})`
  );
  console.log(`  Duration:          ${report.durationSeconds.toFixed(6)} s (expected ${DURATION_S.toFixed(6)} s)`);
  console.log('');
  console.log('Amplitude verification:');
  console.log(
    `  Peak sample:       ${report.peak} / 32767 (ratio ${report.peakRatio.toFixed(4)}, expected ~0.3500)`
  );
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
