package sentinel;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

/** Local RDAP service. It binds to loopback and accepts a domain name, never a URL. */
public final class Main {
    public static void main(String[] args) throws IOException {
        int port = 8082;
        if (args.length == 1) {
            port = Integer.parseInt(args[0]);
        }
        Client client = new Client();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/health", Main::health);
        server.createContext("/v1/domain", exchange -> domain(exchange, client));
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.println("WebSentinel RDAP listening on http://127.0.0.1:" + port);
    }

    private static void health(HttpExchange exchange) throws IOException {
        byte[] body = "{\"service\":\"rdap\",\"status\":\"ok\"}".getBytes(StandardCharsets.UTF_8);
        write(exchange, 200, body);
    }

    private static void domain(HttpExchange exchange, Client client) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            write(exchange, 405, Record.unavailable("Use GET.").toJson().getBytes(StandardCharsets.UTF_8));
            return;
        }
        String name = query(exchange.getRequestURI().getRawQuery(), "name");
        if (name == null) {
            write(exchange, 400, Record.unavailable("Missing domain name.").toJson().getBytes(StandardCharsets.UTF_8));
            return;
        }
        name = name.toLowerCase(java.util.Locale.ROOT);
        Record record = client.lookup(name);
        int status = record.found || record.error.isBlank() ? 200 : 200;
        write(exchange, status, record.toJson().getBytes(StandardCharsets.UTF_8));
        System.out.println("rdap " + name + " found=" + record.found);
    }

    private static String query(String raw, String key) {
        if (raw == null) return null;
        for (String part : raw.split("&")) {
            int eq = part.indexOf('=');
            if (eq <= 0) continue;
            String k = URLDecoder.decode(part.substring(0, eq), StandardCharsets.UTF_8);
            if (key.equals(k)) {
                return URLDecoder.decode(part.substring(eq + 1), StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static void write(HttpExchange exchange, int status, byte[] body) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }
}
