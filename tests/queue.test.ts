import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SerialQueue } from '../src/serial-queue.ts';

test('serializes jobs and continues after a conversion failure', async () => {
  const queue = new SerialQueue();
  const events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = queue.run(async () => { events.push('first:start'); await gate; events.push('first:end'); });
  const failure = queue.run(async () => { events.push('failure'); throw new Error('bad diagram'); });
  const failureCheck = assert.rejects(failure, /bad diagram/);
  const last = queue.run(async () => { events.push('last'); return 42; });
  await Promise.resolve();
  assert.deepEqual(events, ['first:start']);
  release();
  await first;
  await failureCheck;
  assert.equal(await last, 42);
  assert.deepEqual(events, ['first:start', 'first:end', 'failure', 'last']);
});
