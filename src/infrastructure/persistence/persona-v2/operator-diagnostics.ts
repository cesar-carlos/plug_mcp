/** Local-only provenance. Never classify arbitrary messages or remote details. */
export type OperatorFailureReason =
  | "channel_input_ended"
  | "channel_input_error"
  | "channel_output_error"
  | "channel_invalid_json"
  | "channel_frame_too_large"
  | "channel_queue_overflow"
  | "channel_read_timeout"
  | "channel_write_timeout"
  | "channel_write_failed"
  | "channel_closed"
  | "channel_concurrent_read"
  | "channel_serialization_failed"
  | "ssh_spawn_failed"
  | "ssh_spawn_not_found"
  | "ssh_spawn_denied"
  | "ssh_exit_timeout"
  | "ssh_exit_nonzero"
  | "ssh_exit_signal"
  | "result_identity_mismatch"
  | "unexpected_fixture_request";

const reasons = new WeakMap<Error, OperatorFailureReason>();
export function operatorFailure(reason: OperatorFailureReason): Error {
  const error = new Error("Operator channel unavailable; do not retry.");
  reasons.set(error, reason);
  return error;
}
export function operatorFailureReason(error: unknown): OperatorFailureReason | undefined {
  return error instanceof Error ? reasons.get(error) : undefined;
}

export const operatorStageReasons = {
  arguments: "invalid_arguments",
  read_request: "request_read_failed",
  validate_request: "invalid_request",
  open_fixture: "fixture_open_failed",
  spawn: "ssh_spawn_failed",
  send_start: "start_send_failed",
  await_message: "remote_message_unconfirmed",
  validate_request_frame: "invalid_remote_frame",
  pace_fixture: "fixture_pacing_failed",
  handle_fixture: "fixture_handler_failed",
  send_response: "fixture_response_send_failed",
  validate_result: "invalid_remote_frame",
  await_exit: "ssh_exit_unconfirmed",
} as const;
export type OperatorStage = keyof typeof operatorStageReasons;
