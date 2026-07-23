const express = require('express');
const { ERRORS, rpcResult, rpcError } = require('./jsonrpc');

/**
 * Builds the POST /a2a JSON-RPC router.
 *
 * The dispatch logic — request validation, tasks/get, tasks/cancel, unsupported
 * methods, error mapping — is identical for every agent. Each agent supplies
 * only `handleMessageSend(params)`, which returns either:
 *
 *   { task }                       — a completed/failed/input-required Task
 *   { error: [code, message] }     — a JSON-RPC level parameter error
 */
function createA2ARouter({ handleMessageSend, taskStore, streaming = false }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const body = req.body;

    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return res.status(400).json(
        rpcError(body?.id, ERRORS.INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request', {
          receivedContentType: req.get('content-type') || null,
          receivedBodyType: Array.isArray(body) ? 'array' : typeof body,
          receivedKeys: body && typeof body === 'object' ? Object.keys(body) : null,
          hint:
            body && typeof body === 'object' && Object.keys(body).length === 0
              ? 'Request body was empty after parsing — check that the caller/proxy is forwarding the body.'
              : 'Expected {"jsonrpc":"2.0","id":<id>,"method":"message/send","params":{...}}'
        })
      );
    }

    const { id, method, params } = body;

    try {
      switch (method) {
        case 'message/send': {
          const outcome = await handleMessageSend(params);
          if (outcome.error) {
            return res.status(400).json(rpcError(id, outcome.error[0], outcome.error[1]));
          }
          taskStore.save(outcome.task);
          return res.json(rpcResult(id, outcome.task));
        }

        case 'tasks/get': {
          const taskId = params?.id;
          if (!taskId) {
            return res
              .status(400)
              .json(rpcError(id, ERRORS.INVALID_PARAMS, 'params.id is required'));
          }
          const task = taskStore.get(taskId);
          if (!task) {
            return res.status(404).json(rpcError(id, ERRORS.TASK_NOT_FOUND, 'Task not found'));
          }
          return res.json(rpcResult(id, task));
        }

        case 'tasks/cancel': {
          const taskId = params?.id;
          const task = taskId ? taskStore.get(taskId) : null;
          if (!task) {
            return res.status(404).json(rpcError(id, ERRORS.TASK_NOT_FOUND, 'Task not found'));
          }
          // Work is synchronous and already finished — the task is terminal.
          return res
            .status(400)
            .json(
              rpcError(
                id,
                ERRORS.TASK_NOT_CANCELABLE,
                'Task is in a terminal state and cannot be canceled'
              )
            );
        }

        case 'message/stream':
        case 'tasks/resubscribe': {
          if (!streaming) {
            return res
              .status(400)
              .json(
                rpcError(
                  id,
                  ERRORS.UNSUPPORTED_OPERATION,
                  'Streaming is not supported by this agent (capabilities.streaming = false)'
                )
              );
          }
          return res
            .status(500)
            .json(rpcError(id, ERRORS.INTERNAL, 'Streaming declared but not implemented'));
        }

        default:
          return res
            .status(404)
            .json(rpcError(id, ERRORS.METHOD_NOT_FOUND, `Unknown method: ${method}`));
      }
    } catch (err) {
      console.error('A2A handler error:', err);
      return res.status(500).json(rpcError(id, ERRORS.INTERNAL, 'Internal error', err.message));
    }
  });

  return router;
}

module.exports = { createA2ARouter };
