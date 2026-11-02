import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fallbackAnalyze,
  validatePoints,
  renderMessage,
  defaultTemplate,
} from '../lib/domain.ts';
const docs = [
  {
    id: 'd1',
    category: 'Discharge summary',
    name: 'summary.txt',
    text: 'Patient: A. Discharge summary. Surgery performed 4 October.',
    status: 'ready',
    claim: 'C1',
  },
];
test('unconfigured analysis does not silently mark missing documents or send incomplete results', () => {
  const points = fallbackAnalyze(
    '1. Provide discharge summary and payment receipt.\n2. Clarify duration of symptoms.',
    docs,
    'C1',
  );
  assert.equal(points.length, 3);
  assert.ok(points.every((p) => p.status === 'review'));
  assert.deepEqual(points[0].documentIds, ['d1']);
});
test('false evidence and nonexistent document references are held for review', () => {
  const p = validatePoints(
    [
      {
        request: 'Discharge summary',
        status: 'available',
        documentIds: ['d1'],
        evidence: 'Invented quote',
        reason: 'Matched',
      },
      {
        request: 'Receipt',
        status: 'available',
        documentIds: ['foreign'],
        evidence: 'test',
        reason: 'Matched',
      },
    ],
    docs,
  );
  assert.ok(p.every((p) => p.status === 'review'));
  assert.deepEqual(p[1].documentIds, []);
});
test('actual document evidence is retained', () => {
  const p = validatePoints(
    [
      {
        request: 'Discharge summary',
        status: 'available',
        documentIds: ['d1'],
        evidence: 'Surgery performed 4 October.',
        reason: 'Already held',
      },
    ],
    docs,
  );
  assert.equal(p[0].status, 'available');
});
test('patient request section excludes documents already held', () => {
  const points = validatePoints(
    [
      {
        request: 'Discharge summary',
        status: 'available',
        documentIds: ['d1'],
        evidence: 'Discharge summary.',
        reason: 'Already held',
      },
      {
        request: 'Receipt',
        status: 'needed',
        documentIds: [],
        evidence: '',
        reason: 'Proof of payment is needed.',
        patientRequest: 'Share the hospital payment receipt.',
      },
    ],
    docs,
  );
  const text = renderMessage(
    defaultTemplate,
    { name: 'A', claim: 'C1', patientId: 'P1', insurer: 'Insurer' },
    points,
  );
  const requests = text
    .split('Please provide:')[1]
    .split('Already available')[0];
  assert.ok(requests.includes('receipt'));
  assert.ok(!requests.includes('Discharge summary'));
  assert.ok(!text.includes('{{'));
});
test('empty and malformed analysis cannot become a successful response', () => {
  assert.throws(() => validatePoints([], docs));
  assert.throws(() =>
    validatePoints([{ request: 'a', status: 'invented' }], docs),
  );
});
