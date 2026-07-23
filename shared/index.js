/**
 * Shared building blocks for the agents in this repo.
 *
 * Everything here is agent-agnostic: transport wiring, auth, JSON-RPC and A2A
 * object helpers, task storage, and config resolution. Agent-specific logic
 * (skills, domain services, the message/send handler) lives under agents/.
 */
module.exports = {
  ...require('./src/config'),
  ...require('./src/auth'),
  ...require('./src/taskStore'),
  ...require('./src/jsonrpc'),
  ...require('./src/a2aRouter'),
  ...require('./src/createApp'),
  ...require('./src/startup'),
  ...require('./src/parseLocation')
};
