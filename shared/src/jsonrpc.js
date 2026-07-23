/**
 * JSON-RPC 2.0 and A2A object helpers shared by both agents.
 */

const crypto = require('crypto');

const uuid = () => crypto.randomUUID();

// Standard JSON-RPC codes plus the A2A-reserved range (spec section 8.2).
const ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,
  UNSUPPORTED_OPERATION: -32004,
  CONTENT_TYPE_NOT_SUPPORTED: -32005
};

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error };
}

function textMessage(text, role, contextId, taskId) {
  return {
    kind: 'message',
    role,
    messageId: uuid(),
    contextId,
    taskId,
    parts: [{ kind: 'text', text }]
  };
}

function buildTask({ contextId, state, userMessage, agentMessage, artifacts, metadata }) {
  const taskId = uuid();
  const history = [userMessage];
  if (agentMessage) history.push({ ...agentMessage, taskId });

  const task = {
    kind: 'task',
    id: taskId,
    contextId,
    status: {
      state,
      message: agentMessage ? { ...agentMessage, taskId } : undefined,
      timestamp: new Date().toISOString()
    },
    artifacts: artifacts || [],
    history
  };

  if (metadata) task.metadata = metadata;
  return task;
}

/** Concatenate the text parts of an incoming message. */
function extractText(message) {
  if (!message || !Array.isArray(message.parts)) return '';
  return message.parts
    .filter((p) => (p.kind || p.type) === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join(' ')
    .trim();
}

/** Normalize a caller's message into a well-formed A2A Message. */
function normalizeUserMessage(userMessage, contextId) {
  return {
    kind: 'message',
    role: userMessage.role || 'user',
    messageId: userMessage.messageId || uuid(),
    contextId,
    parts: userMessage.parts
  };
}

module.exports = {
  uuid,
  ERRORS,
  rpcResult,
  rpcError,
  textMessage,
  buildTask,
  extractText,
  normalizeUserMessage
};
