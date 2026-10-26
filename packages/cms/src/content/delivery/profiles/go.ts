import type { ExampleContext } from './program.ts';
import { renderProgram } from './program.ts';
const program = String.raw`
package main
import (
 "bufio"
 "bytes"
 "crypto/rand"
 "encoding/base64"
 "encoding/hex"
 "encoding/json"
 "fmt"
 "io"
 "net/http"
 "mime/multipart"
 "os"
 "regexp"
 "strings"
 "time"
)
var base string
var key = os.Getenv("ONEASTER_API_KEY")
var intent = os.Getenv("ONEASTER_INTENT_ID")
var client = &http.Client{Timeout: @@REQUEST_MS@@ * time.Millisecond, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return fmt.Errorf("redirect rejected") }}
func check(err error) { if err != nil { panic(err) } }
func request(path string, body []byte, remaining time.Duration, mediaTypes ...string) *http.Response {
 method := "GET"; if body != nil { method = "POST" }
 req, err := http.NewRequest(method, base + path, bytes.NewReader(body)); check(err)
 req.Header.Set("Authorization", "Bearer " + key)
 mediaType := "application/json"; if len(mediaTypes) > 0 { mediaType = mediaTypes[0] }; req.Header.Set("Content-Type", mediaType); req.Header.Set("Idempotency-Key", intent)
 active := *client; if remaining > 0 && remaining < active.Timeout { active.Timeout = remaining }
 response, err := active.Do(req); check(err)
 if response.StatusCode < 200 || response.StatusCode >= 300 { response.Body.Close(); panic(fmt.Sprintf("HTTP %d; retain intent %s", response.StatusCode, intent)) }
 return response
}
func readBytes(response *http.Response) []byte {
 defer response.Body.Close()
 raw, err := io.ReadAll(io.LimitReader(response.Body, @@MAX_BYTES@@ + 1)); check(err)
 if len(raw) > @@MAX_BYTES@@ { panic("response exceeds limit") }; return raw
}
func readJSON(path string, body []byte, remaining time.Duration, mediaTypes ...string) map[string]json.RawMessage {
 var value map[string]json.RawMessage
 check(json.Unmarshal(readBytes(request(path, body, remaining, mediaTypes...)), &value)); return value
}
func text(value json.RawMessage) string { var result string; check(json.Unmarshal(value, &result)); return result }
func upload(body []byte) map[string]json.RawMessage {
 filename := os.Getenv("ONEASTER_AUDIO_FILE"); if filename == "" { panic("set ONEASTER_AUDIO_FILE to a PCM WAV file") }
 source, err := os.Open(filename); check(err); defer source.Close()
 audio, err := io.ReadAll(io.LimitReader(source, 8388609)); check(err)
 if len(audio) < 44 || len(audio) > 8388608 { panic("PCM WAV must be 44 bytes to 8 MiB") }
 var fields map[string]string; check(json.Unmarshal(body, &fields))
 var payload bytes.Buffer; form := multipart.NewWriter(&payload)
 check(form.WriteField("model", fields["model"])); if fields["language"] != "" { check(form.WriteField("language", fields["language"])) }
 file, err := form.CreateFormFile("file", "input.wav"); check(err); _, err = file.Write(audio); check(err); check(form.Close())
 return readJSON("/audio/transcriptions", payload.Bytes(), 0, form.FormDataContentType())
}
func main() {
 decodedBase, decodeError := base64.StdEncoding.DecodeString("@@BASE@@"); check(decodeError); base = string(decodedBase)
 if key == "" { panic("set ONEASTER_API_KEY") }
 if intent == "" { raw := make([]byte, 16); _, err := rand.Read(raw); check(err); intent = hex.EncodeToString(raw) }
 fmt.Fprintln(os.Stderr, "Keep this intent and input:", intent)
 body, err := base64.StdEncoding.DecodeString("@@BODY@@"); check(err)
 if "@@MODE@@" == "sse" {
  response := request("/chat/completions", body, 0); defer response.Body.Close()
  if !strings.HasPrefix(response.Header.Get("Content-Type"), "text/event-stream") { panic("expected SSE") }
  limited := &io.LimitedReader{R: response.Body, N: @@MAX_BYTES@@ + 1}
  scanner := bufio.NewScanner(limited); scanner.Buffer(make([]byte, 4096), @@MAX_BYTES@@)
  complete := false
  for scanner.Scan() {
   line := scanner.Text(); if !strings.HasPrefix(line, "data:") { continue }; data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
   if data == "[DONE]" { complete = true; break }
   var event struct { Error json.RawMessage; Choices []struct { Delta struct { Content string } } }
   check(json.Unmarshal([]byte(data), &event)); if len(event.Error) > 0 && string(event.Error) != "null" { panic("stream failed; retain original intent") }
   for _, choice := range event.Choices { fmt.Print(choice.Delta.Content) }
  }
  check(scanner.Err()); if !complete || limited.N <= 0 { panic("incomplete or oversized SSE; retain original intent") }
 } else if "@@MODE@@" == "json" {
  result := readJSON("/chat/completions", body, 0)
  var choices []struct { Message struct { Content string } }; check(json.Unmarshal(result["choices"], &choices))
  if len(choices) != 1 { panic("invalid response") }; fmt.Print(choices[0].Message.Content)
 } else {
  var accepted map[string]json.RawMessage
  if "@@MODE@@" == "transcription" { accepted = upload(body) } else { accepted = readJSON("/tasks", body, 0) }
  var entry struct { ID string }; check(json.Unmarshal(accepted["data"], &entry))
  if string(accepted["success"]) != "true" || !regexp.MustCompile("^[0-9a-fA-F-]{36}$").MatchString(entry.ID) { panic("invalid task acknowledgement") }
  deadline := time.Now().Add(@@DEADLINE_MS@@ * time.Millisecond); path := "/tasks/" + entry.ID
  for time.Now().Before(deadline) {
   result := readJSON(path, nil, time.Until(deadline))
   var task struct { Kind string; State string; Billing string @@BILLING_TAG@@; Available bool @@ARTIFACT_TAG@@; Artifact struct { URL string; Text string } }
   check(json.Unmarshal(result["data"], &task)); if string(result["success"]) != "true" { panic("invalid task response") }
   if task.State == "success" && task.Billing == "settled" && task.Available {
    switch task.Kind { case "image": check(os.WriteFile("result.png", readBytes(request(path + "/content", nil, time.Until(deadline))), 0600)); case "music": check(os.WriteFile("result.mp3", readBytes(request(path + "/content", nil, time.Until(deadline))), 0600)); case "asr": fmt.Print(task.Artifact.Text); case "video": fmt.Print(task.Artifact.URL); default: panic("unsupported task kind") }; return
   }
   if task.State == "success" || task.State == "failed" || task.State == "rejected" || task.State == "unknown" { panic("task ended without usable settled result: " + task.State) }
   time.Sleep(min(@@POLL_MS@@ * time.Millisecond, time.Until(deadline)))
  }
  panic("polling deadline; retain task " + entry.ID)
 }
}
`;
export function goExample(context: ExampleContext): string {
  return renderProgram(
    program
      .replaceAll('@@BILLING_TAG@@', '`json:"billing_state"`')
      .replaceAll('@@ARTIFACT_TAG@@', '`json:"artifact_available"`'),
    context,
  );
}
