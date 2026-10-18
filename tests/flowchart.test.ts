import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSource, safeFilename } from '../src/flowchart.ts';
import { examples } from '../src/examples.ts';

test('accepts examples, graph aliases, comments and all flowchart directions', () => {
  for (const { code } of Object.values(examples)) assert.doesNotThrow(() => checkSource(code));
  for (const kind of ['graph', 'flowchart']) {
    for (const direction of ['TD', 'TB', 'BT', 'LR', 'RL']) {
      assert.doesNotThrow(() => checkSource(`%% comment\n\n${kind} ${direction}; A --> B`));
    }
  }
});

test('rejects empty, other diagram types, directives and oversized input', () => {
  for (const code of ['', '  ', 'classDiagram\n class User', 'flowchart TD\n%%{init: {}}%%', '---\ntitle: hi\n---\nflowchart TD', 'flowchart TD\n' + 'A'.repeat(50_000)]) {
    assert.throws(() => checkSource(code));
  }
});

test('rejects external image and interaction features', () => {
  for (const code of ['flowchart TD\nclick A callback', 'flowchart TD\nA@{ img: "https://example.com/a.png" }', 'flowchart TD\nA["<img src=x>"]']) {
    assert.throws(() => checkSource(code));
  }
});

test('creates usable filenames while keeping Chinese characters', () => {
  assert.equal(safeFilename('  流程圖  '), '流程圖');
  assert.equal(safeFilename('a/b:c?.'), 'a-b-c-');
  assert.equal(safeFilename('...'), 'mermaid-diagram');
  assert.equal(safeFilename(' '), 'mermaid-diagram');
  assert.equal(safeFilename('x'.repeat(200)).length, 100);
});

test('accepts sequence diagrams with comments and rejects invalid declarations', () => {
  assert.doesNotThrow(() => checkSource('%% comment\nsequenceDiagram\n A->>B: hello'));
  assert.throws(() => checkSource('sequenceDiagramInvalid\n A->>B: hello'));
});
