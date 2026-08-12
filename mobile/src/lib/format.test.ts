import { formatEstimate } from './format';

describe('formatEstimate', () => {
  it('formats 0 hours', () => {
    expect(formatEstimate(0)).toBe('0 min');
  });

  it('formats 0.5 hours (30 min)', () => {
    expect(formatEstimate(0.5)).toBe('30 min');
  });

  it('formats 0.7 hours (42 min)', () => {
    expect(formatEstimate(0.7)).toBe('42 min');
  });

  it('formats 0.75 hours (45 min)', () => {
    expect(formatEstimate(0.75)).toBe('45 min');
  });

  it('formats 1 hour (singular)', () => {
    expect(formatEstimate(1)).toBe('1 hour');
  });

  it('formats 1.5 hours', () => {
    expect(formatEstimate(1.5)).toBe('1 hr 30 min');
  });

  it('formats 2 hours (plural)', () => {
    expect(formatEstimate(2)).toBe('2 hours');
  });

  it('formats fractional minutes that round to whole minutes', () => {
    expect(formatEstimate(0.0167)).toBe('1 min');
  });

  it('formats 3.25 hours', () => {
    expect(formatEstimate(3.25)).toBe('3 hr 15 min');
  });

  it('formats 10 hours', () => {
    expect(formatEstimate(10)).toBe('10 hours');
  });

  it('rounds 0.74 hours to 44 min (not 45)', () => {
    // 0.74 * 60 = 44.4 → Math.round = 44
    expect(formatEstimate(0.74)).toBe('44 min');
  });

  it('rounds 0.76 hours to 46 min (not 45)', () => {
    // 0.76 * 60 = 45.6 → Math.round = 46
    expect(formatEstimate(0.76)).toBe('46 min');
  });
});
