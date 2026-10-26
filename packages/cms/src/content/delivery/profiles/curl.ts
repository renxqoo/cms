import type { ExampleContext } from './program.ts';
import { renderProgram } from './program.ts';
const program = String.raw`
set -euo pipefail
: "\${ONEASTER_API_KEY:?Set ONEASTER_API_KEY}"
base=$(printf '%s' '@@BASE@@' | jq -Rr '@base64d')
intent="\${ONEASTER_INTENT_ID:-$(uuidgen)}"
printf 'Keep this intent and input: %s\n' "$intent" >&2
body=$(printf '%s' '@@BODY@@' | jq -Rr '@base64d')
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
request() {
  curl --fail-with-body --silent --show-error --max-time @@REQUEST_SECONDS@@ --max-filesize @@MAX_BYTES@@ \
    --header "Authorization: Bearer $ONEASTER_API_KEY" "$@"
}
if [ '@@MODE@@' = 'sse' ]; then
  printf '%s' "$body" | request --no-buffer --request POST "$base/chat/completions" --header 'Content-Type: application/json' --header "Idempotency-Key: $intent" --data-binary @- |
  while IFS= read -r line; do
    case "$line" in
      'data: '*)
        data="\${line#data: }"
        if [ "$data" = '[DONE]' ]; then touch "$work/done"; break; fi
        printf '%s\n' "$data" | jq -e 'if .error then error("Stream failed; inspect original intent") else . end' | jq -jr '.choices[]?.delta.content // empty'
        ;;
    esac
  done
  test -f "$work/done" || { printf 'Incomplete stream; keep intent %s\n' "$intent" >&2; exit 1; }
elif [ '@@MODE@@' = 'json' ]; then
  printf '%s' "$body" | request --request POST "$base/chat/completions" --header 'Content-Type: application/json' --header "Idempotency-Key: $intent" --data-binary @- | jq -er '.choices[0].message.content'
else
  if [ '@@MODE@@' = 'transcription' ]; then
    [ -n "\${ONEASTER_AUDIO_FILE:-}" ] || { printf 'Set ONEASTER_AUDIO_FILE to a PCM WAV file\n' >&2; exit 1; }
    size=$(wc -c < "$ONEASTER_AUDIO_FILE")
    [ "$size" -ge 44 ] && [ "$size" -le 8388608 ] || { printf 'PCM WAV must be 44 bytes to 8 MiB\n' >&2; exit 1; }
    request --request POST "$base/audio/transcriptions" --header "Idempotency-Key: $intent" \
      --form-string "model=$(printf '%s' "$body" | jq -er '.model')" \
      --form-string "language=$(printf '%s' "$body" | jq -r '.language // empty')" \
      --form 'file=@-;type=audio/wav;filename=input.wav' < "$ONEASTER_AUDIO_FILE" > "$work/accepted"
  else
    printf '%s' "$body" | request --request POST "$base/tasks" --header 'Content-Type: application/json' --header "Idempotency-Key: $intent" --data-binary @- > "$work/accepted"
  fi
  task=$(jq -er 'select(.success == true) | .data.id | select(test("^[0-9a-fA-F-]{36}$"))' "$work/accepted")
  deadline=$(( $(date +%s) + @@DEADLINE_SECONDS@@ ))
  complete=false
  while [ "$(date +%s)" -lt "$deadline" ]; do
    request "$base/tasks/$task" > "$work/task"
    state=$(jq -er 'select(.success == true) | .data.state' "$work/task")
    if [ "$state" = 'success' ]; then
      jq -e '.data.billing_state == "settled" and .data.artifact_available == true' "$work/task" > /dev/null
      case "$(jq -r '.data.kind' "$work/task")" in
        image) request "$base/tasks/$task/content" --output result.png;;
        music) request "$base/tasks/$task/content" --output result.mp3;;
        asr) jq -er '.data.artifact.text' "$work/task";;
        video) jq -er '.data.artifact.url' "$work/task";;
        *) printf 'Unsupported task kind\n' >&2; exit 1;;
      esac
      complete=true; break
    fi
    case "$state" in failed|rejected|unknown) printf 'Task %s ended: %s\n' "$task" "$state" >&2; exit 1;; esac
    sleep @@POLL_SECONDS@@
  done
  [ "$complete" = true ] || { printf 'Polling deadline; retain task %s\n' "$task" >&2; exit 1; }
fi
`;
export function curlExample(context: ExampleContext): string {
  return renderProgram(
    program
      .replaceAll('@@REQUEST_SECONDS@@', String(Math.ceil(context.requestTimeoutMs / 1000)))
      .replaceAll('@@DEADLINE_SECONDS@@', String(Math.ceil(context.pollDeadlineMs / 1000)))
      .replaceAll('@@POLL_SECONDS@@', String(context.pollIntervalMs / 1000))
      .replaceAll('\\${', '${'),
    context,
  );
}
