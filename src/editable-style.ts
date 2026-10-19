// Read resolved Mermaid styles, including classDef, theme defaults and linkStyle.
export function previewStyles(svg: string) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  host.innerHTML = svg;
  document.body.append(host);
  const read = (element: Element | null, property: string) => {
    if (!element) return undefined;
    const value = getComputedStyle(element).getPropertyValue(property).trim();
    if (value === 'none') return 'transparent';
    const rgb = value.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    return rgb ? `#${rgb.slice(1).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : value || undefined;
  };
  const styles = (shape: Element | null, label: Element | null) => ({
    backgroundColor: read(shape, 'fill'),
    strokeColor: read(shape, 'stroke'),
    strokeWidth: shape ? Number.parseFloat(getComputedStyle(shape).strokeWidth) : undefined,
    labelColor: read(label, 'fill'),
  });
  try {
    const nodes = new Map<string, ReturnType<typeof styles>>();
    for (const node of host.querySelectorAll('.node, .cluster')) {
      const id = node.id.match(/(?:^|-)flowchart-(.*)-\d+$/)?.[1] ?? node.id;
      nodes.set(id, styles(node.querySelector('.label-container, rect, polygon, circle, ellipse, path'), node.querySelector('text tspan.text-inner-tspan, text tspan, text')));
    }
    const edges = [...host.querySelectorAll('.edgePaths path.flowchart-link')].map((edge) => styles(edge, null));
    return { nodes, edges };
  } finally {
    host.remove();
  }
}
