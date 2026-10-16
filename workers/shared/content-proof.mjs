// Domain-separated proof of an owner-authenticated Boss transaction. The tree
// binds every blob; the parent prevents replay onto another application state.
export function contentProofPayload(parent, tree, message) {
  if (!/^[a-f0-9]{40}$/.test(parent) || !/^[a-f0-9]{40}$/.test(tree) || !/^content: [^\r\n]+$/.test(message)) {
    throw new Error('Invalid content proof payload');
  }
  return new TextEncoder().encode(`americawhat-boss-content-v1\nhakandndr/americawhat\nmain\n${parent}\n${tree}\n${message}`);
}

export function fromBase64(value) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export async function signContentCommit(privateKey, parent, tree, message) {
  const key = await crypto.subtle.importKey('pkcs8', fromBase64(privateKey), 'Ed25519', false, ['sign']);
  const signature = await crypto.subtle.sign('Ed25519', key, contentProofPayload(parent, tree, message));
  return `${message}\n\nBoss-Content-Signature: ${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

export async function verifyContentCommit(publicKey, parent, tree, message) {
  try {
    const match = /^(content: [^\r\n]+)\n\nBoss-Content-Signature: ([A-Za-z0-9+/]{86}==)\n?$/.exec(message);
    if (!match) return false;
    const key = await crypto.subtle.importKey('spki', fromBase64(publicKey), 'Ed25519', false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, fromBase64(match[2]), contentProofPayload(parent, tree, match[1]));
  } catch { return false; }
}
