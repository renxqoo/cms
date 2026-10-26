import type { ExampleContext } from './program.ts';
import { encodedBody, renderProgram } from './program.ts';
const program = String.raw`
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
public class OneAsterExample {
  static final ObjectMapper JSON = new ObjectMapper();
  static final String BASE = new String(Base64.getDecoder().decode("@@BASE@@"), StandardCharsets.UTF_8);
  static final String KEY = System.getenv("ONEASTER_API_KEY");
  static final String INTENT = Optional.ofNullable(System.getenv("ONEASTER_INTENT_ID")).orElseGet(() -> UUID.randomUUID().toString());
  static final HttpClient CLIENT = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(@@REQUEST_MS@@)).followRedirects(HttpClient.Redirect.NEVER).build();
  record Reply(InputStream body, String type) {}
  static Reply request(String path, byte[] body, long remaining, String... mediaTypes) throws Exception {
    var builder = HttpRequest.newBuilder(URI.create(BASE + path)).timeout(Duration.ofMillis(Math.max(1, Math.min(@@REQUEST_MS@@, remaining)))).header("Authorization", "Bearer " + KEY).header("Content-Type", mediaTypes.length > 0 ? mediaTypes[0] : "application/json").header("Idempotency-Key", INTENT);
    if (body == null) builder.GET(); else builder.POST(HttpRequest.BodyPublishers.ofByteArray(body));
    var response = CLIENT.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
    if (response.statusCode() < 200 || response.statusCode() >= 300) { response.body().close(); throw new IOException("HTTP " + response.statusCode() + "; retain intent " + INTENT); }
    Timer timer = new Timer(true);
    timer.schedule(new TimerTask() { public void run() { try { response.body().close(); } catch (IOException failure) { } } }, Math.max(1, Math.min(@@REQUEST_MS@@, remaining)));
    InputStream bounded = new FilterInputStream(response.body()) {
      long received = 0;
      void accept(int count) throws IOException { if (count > 0) received += count; if (received > @@MAX_BYTES@@) throw new IOException("Response exceeds limit"); }
      public int read() throws IOException { int value = in.read(); if (value >= 0) accept(1); return value; }
      public int read(byte[] bytes, int offset, int length) throws IOException { int count = in.read(bytes, offset, length); accept(count); return count; }
      public void close() throws IOException { timer.cancel(); super.close(); }
    };
    return new Reply(bounded, response.headers().firstValue("Content-Type").orElse(""));
  }
  static byte[] readBytes(InputStream stream) throws IOException {
    try (stream) {
      byte[] raw = stream.readNBytes(@@MAX_BYTES@@ + 1);
      if (raw.length > @@MAX_BYTES@@) throw new IOException("Response exceeds limit");
      return raw;
    }
  }
  static JsonNode readJSON(String path, byte[] body, long remaining, String... mediaTypes) throws Exception {
    return JSON.readTree(readBytes(request(path, body, remaining, mediaTypes).body()));
  }
  static JsonNode upload(byte[] body) throws Exception {
    String filename = System.getenv("ONEASTER_AUDIO_FILE");
    if (filename == null || filename.isEmpty()) throw new IOException("Set ONEASTER_AUDIO_FILE to a PCM WAV file");
    byte[] audio;
    try (var source = Files.newInputStream(Path.of(filename))) { audio = source.readNBytes(8388609); }
    if (audio.length < 44 || audio.length > 8388608) throw new IOException("PCM WAV must be 44 bytes to 8 MiB");
    String boundary = "oneaster-" + UUID.randomUUID();
    var payload = new ByteArrayOutputStream();
    JsonNode fields = JSON.readTree(body);
    for (String name : List.of("model", "language")) {
      String value = fields.path(name).asText("");
      if (!value.isEmpty()) payload.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n").getBytes(StandardCharsets.UTF_8));
    }
    payload.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"input.wav\"\r\nContent-Type: audio/wav\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
    payload.write(audio); payload.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.US_ASCII));
    return readJSON("/audio/transcriptions", payload.toByteArray(), @@REQUEST_MS@@, "multipart/form-data; boundary=" + boundary);
  }
  public static void main(String[] args) throws Exception {
    if (KEY == null || KEY.isEmpty()) throw new IllegalArgumentException("Set ONEASTER_API_KEY");
    System.err.println("Keep this intent and input: " + INTENT);
    byte[] body = Base64.getDecoder().decode("@@BODY@@");
    if ("@@MODE@@".equals("sse")) {
      var response = request("/chat/completions", body, @@REQUEST_MS@@);
      if (!response.type().startsWith("text/event-stream")) { response.body().close(); throw new IOException("Expected SSE"); }
      boolean complete = false; long size = 0;
      try (var reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
        String line;
        while ((line = reader.readLine()) != null) {
          size += line.getBytes(StandardCharsets.UTF_8).length + 1;
          if (size > @@MAX_BYTES@@) throw new IOException("Stream exceeds limit");
          if (!line.startsWith("data:")) continue;
          String data = line.substring(5).stripLeading();
          if ("[DONE]".equals(data)) { complete = true; break; }
          JsonNode event = JSON.readTree(data);
          if (event.hasNonNull("error")) throw new IOException("Stream failed; retain original intent");
          for (JsonNode choice : event.path("choices")) System.out.print(choice.path("delta").path("content").asText(""));
          System.out.flush();
        }
      }
      if (!complete) throw new IOException("Incomplete SSE; retain original intent " + INTENT);
    } else if ("@@MODE@@".equals("json")) {
      JsonNode result = readJSON("/chat/completions", body, @@REQUEST_MS@@);
      System.out.print(result.path("choices").path(0).path("message").path("content").asText());
    } else {
      JsonNode accepted = "@@MODE@@".equals("transcription") ? upload(body) : readJSON("/tasks", body, @@REQUEST_MS@@);
      String id = accepted.path("data").path("id").asText();
      if (!accepted.path("success").asBoolean() || !id.matches("[0-9a-fA-F-]{36}")) throw new IOException("Invalid task acknowledgement");
      String path = "/tasks/" + id; long deadline = System.nanoTime() + @@DEADLINE_MS@@L * 1000000;
      while (System.nanoTime() < deadline) {
        long remaining = Math.max(1, (deadline - System.nanoTime()) / 1000000);
        JsonNode result = readJSON(path, null, remaining); JsonNode task = result.path("data");
        if (!result.path("success").asBoolean() || !task.path("model").asText().equals(JSON.readTree(body).path("model").asText())) throw new IOException("Invalid task");
        String state = task.path("state").asText();
        if ("success".equals(state) && "settled".equals(task.path("billing_state").asText()) && task.path("artifact_available").asBoolean()) {
          if ("image".equals(task.path("kind").asText())) Files.write(Path.of("result.png"), readBytes(request(path + "/content", null, remaining).body()));
          else if ("music".equals(task.path("kind").asText())) Files.write(Path.of("result.mp3"), readBytes(request(path + "/content", null, remaining).body()));
          else if ("asr".equals(task.path("kind").asText())) System.out.print(task.path("artifact").path("text").asText());
          else if ("video".equals(task.path("kind").asText())) System.out.print(task.path("artifact").path("url").asText());
          else throw new IOException("Unsupported task kind");
          return;
        }
        if (Set.of("success", "failed", "rejected", "unknown").contains(state)) throw new IOException("Task ended without a usable settled result: " + state);
        Thread.sleep(Math.max(0, Math.min(@@POLL_MS@@, (deadline - System.nanoTime()) / 1000000)));
      }
      throw new IOException("Polling deadline; retain task " + id);
    }
  }
}
`;
export function javaExample(context: ExampleContext): string {
  const encoded = encodedBody(context);
  const chunks: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += 16000)
    chunks.push(JSON.stringify(encoded.slice(offset, offset + 16000)));
  const value = `String.join("", ${chunks.join(', ')})`;
  return renderProgram(program.replace('"@@BODY@@"', value), context);
}
