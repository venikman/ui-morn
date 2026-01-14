A2A bakeoff reference

- Endpoints: /v1/message:send, /v1/message:stream, /v1/tasks/{taskId}, /v1/tasks/{taskId}:subscribe
- Streaming: SSE events include taskId and sequence id for resubscribe
- Errors: RFC 9457 ProblemDetails responses
- Extension: https://a2ui.org/a2a-extension/a2ui/v0.8 via X-A2A-Extensions
