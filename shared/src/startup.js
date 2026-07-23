/**
 * Shared startup banner so both agents log a consistent set of URLs and warnings.
 */
function logStartup({ displayName, port, authMode, debugBody, extraLines = [] }) {
  const base = `http://localhost:${port}`;
  console.log(`${displayName} listening on port ${port}`);
  console.log(`  Agent card : ${base}/.well-known/agent-card.json   (A2A v0.3+ standard path)`);
  console.log(`  Agent card : ${base}/.well-known/agent.json        (v0.2.x alias)`);
  console.log(`  A2A RPC    : ${base}/a2a  (POST, x-api-key required)`);
  console.log(`  Health     : ${base}/health`);

  extraLines.forEach((line) => console.log(`  ${line}`));

  if (String(authMode).toLowerCase() === 'none') {
    console.log('  WARNING    : AUTH_MODE=none — the A2A endpoint is unauthenticated.');
  }
  if (debugBody) {
    console.log('  WARNING    : DEBUG_BODY=true — raw request bodies are being logged.');
  }
}

module.exports = { logStartup };
