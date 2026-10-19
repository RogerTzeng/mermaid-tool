import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertEditable, toDrawio, xml, type DiagramElement } from '../src/drawio.ts';

function node(id: string, overrides: Partial<DiagramElement> = {}): DiagramElement {
  return { id, type: 'rectangle', x: 10, y: 20, width: 100, height: 60, groupIds: [], ...overrides };
}

function label(id: string, containerId: string, text: string): DiagramElement {
  return node(id, { type: 'text', containerId, text, originalText: text, fontSize: 20 });
}

test('escapes XML attributes, Chinese labels and multiline text', () => {
  assert.equal(xml('中文 & < > " \'\n下一行'), '中文 &amp; &lt; &gt; &quot; &apos;&#xa;下一行');
  const result = toDrawio([node('a'), label('text-a', 'a', '中文 & "文字"\n第二行')], '審核 & 訂單');
  assert.match(result, /name="審核 &amp; 訂單"/);
  assert.match(result, /value="中文 &amp; &quot;文字&quot;&#xa;第二行"/);
  assert.equal((result.match(/vertex="1"/g) ?? []).length, 1, 'bound labels belong to their editable node');
});

test('keeps parallel, labeled and self-loop edges bound to real nodes', () => {
  const arrow = (id: string, target: string) => node(id, {
    type: 'arrow', x: 110, y: 50, width: 100, height: 0,
    points: [[0, 0], [50, -20], [100, 0]],
    startBinding: { elementId: 'a' }, endBinding: { elementId: target }, endArrowhead: 'arrow',
  });
  const result = toDrawio([node('a'), node('b', { x: 210 }), arrow('ab-1', 'b'), arrow('ab-2', 'b'), arrow('loop', 'a'), label('edge-text', 'ab-1', '是')], 'flow');
  assert.equal((result.match(/edge="1"/g) ?? []).length, 3);
  assert.equal((result.match(/source="e1" target="e2"/g) ?? []).length, 2);
  assert.match(result, /source="e1" target="e1"/);
  assert.match(result, /value="是"[^>]+edge="1"/);
  assert.match(result, /<mxPoint x="160" y="30"\/>/);
  assert.match(result, /endArrow=open/);
  assert.match(result, /exitX=1;exitY=0.5;exitPerimeter=0;entryX=0;entryY=0.5;entryPerimeter=0/);
  const ids = [...result.matchAll(/<mxCell id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('creates nested editable groups with relative coordinates and standalone nodes', () => {
  const result = toDrawio([
    node('outer', { x: 100, y: 100, width: 400, height: 300, groupIds: ['outer-group'] }),
    node('inner', { x: 130, y: 150, width: 200, height: 150, groupIds: ['inner-group', 'outer-group'] }),
    node('child', { x: 160, y: 180, groupIds: ['inner-group', 'outer-group'] }),
    node('standalone', { x: 600, y: 100, type: 'ellipse' }),
  ], 'groups');
  assert.match(result, /id="g2" parent="g1" vertex="1"[^>]*><mxGeometry x="30" y="50"/);
  assert.match(result, /id="e3"[^>]*parent="g2"[^>]*><mxGeometry x="30" y="30"/);
  assert.match(result, /id="e4"[^>]*parent="1"/);
});

test('supports shape mapping and free-ended lines', () => {
  const result = toDrawio([
    node('round', { roundness: { type: 3 } }), node('circle', { type: 'ellipse' }), node('choice', { type: 'diamond' }),
    node('line', { type: 'line', points: [[0, 0], [-20, 60]], strokeStyle: 'dashed' }),
  ], 'shapes');
  for (const style of ['rounded=1', 'ellipse', 'rhombus', 'dashed=1', 'endArrow=none']) assert.ok(result.includes(style));
  assert.match(result, /as="sourcePoint"/);
  assert.match(result, /as="targetPoint"/);
});

test('fails explicitly for raster fallback, duplicate IDs, invalid geometry and lost bindings', () => {
  for (const elements of [
    [], [node('image', { type: 'image' })], [node('a'), node('a')],
    [node('a', { x: NaN })], [node('a', { angle: 1 })],
    [node('edge', { type: 'arrow', points: [[0, 0]] })],
    [node('edge', { type: 'arrow', points: [[0, 0], [1, 2]], endBinding: { elementId: 'missing' } })],
    [label('label', 'missing', 'text')],
  ]) assert.throws(() => assertEditable(elements));
});
