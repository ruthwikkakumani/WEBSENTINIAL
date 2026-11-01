package sentinel;

import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/** Only invalid local requests: never performs an external RDAP lookup. */
final class MainTest {
    static void run() throws Exception {
        Client registry = new Client();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/domain", exchange -> Main.domain(exchange, registry));
        ByteArrayOutputStream logs = new ByteArrayOutputStream();
        PrintStream original = System.out;
        server.start();
        try (PrintStream capture = new PrintStream(logs, true, StandardCharsets.UTF_8)) {
            System.setOut(capture);
            HttpClient http = HttpClient.newHttpClient();
            for (String name : new String[]{
                    "https://example.invalid/login?token=private-test-token",
                    "user:private-test-password@example.invalid",
                    "example.invalid/path", "localhost"
            }) {
                URI uri = URI.create("http://127.0.0.1:" + server.getAddress().getPort()
                        + "/v1/domain?name=" + URLEncoder.encode(name, StandardCharsets.UTF_8));
                var response = http.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(2)).GET().build(),
                        HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() != 400) throw new AssertionError("invalid domain status");
                if (response.body().contains(name) || response.body().contains("private-test")) {
                    throw new AssertionError("invalid domain echoed into response");
                }
            }
            if (!logs.toString(StandardCharsets.UTF_8).isBlank()) {
                throw new AssertionError("invalid raw input logged");
            }
        } finally {
            System.setOut(original);
            server.stop(0);
        }
    }
}
