// Normal HTML collapses ASCII formatting whitespace; preserve preformatted text.
export function elementContract(node, { skipScripts = false } = {}) {
  if (node.nodeType === 3) {
    if (node.parentElement?.closest('pre, textarea, script, style')) return node.textContent;
    return node.textContent.replace(/[ \t\r\n\f]+/g, ' ').replace(/^ | $/g, '') || null;
  }
  if (node.nodeType !== 1 || (skipScripts && node.localName === 'script')) return null;
  return {
    tag: node.localName,
    attributes: [...node.attributes].map((a) => [a.name, a.value]).sort(([a], [b]) => a.localeCompare(b)),
    children: [...node.childNodes].map((child) => elementContract(child, { skipScripts })).filter((child) => child !== null),
  };
}
