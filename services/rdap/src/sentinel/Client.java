package sentinel;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Reads domain registration from the registry RDAP service published by IANA.
 * It never receives a user URL. Redirects are followed only to public HTTPS hosts.
 */
final class Client {
    private static final String BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
    private static final String FALLBACK = "https://rdap.org/domain/";

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(6))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    private final Object lock = new Object();
    private Map<String, List<String>> services = Map.of();
    private Instant loaded = Instant.EPOCH;

    Record lookup(String domain) {
        if (!validDomain(domain)) {
            return Record.unavailable("That is not a domain name this registry client will look up.");
        }
        List<String> bases;
        try {
            bases = basesFor(domain);
        } catch (IOException | InterruptedException ex) {
            if (ex instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            bases = List.of(FALLBACK);
        }
        String lastError = "No registration record was published for this domain.";
        for (String base : bases) {
            String url = join(base, domain);
            try {
                Exchange ex = get(URI.create(url), 0);
                if (ex.status == 404) {
                    lastError = "No registration record was published for this domain.";
                    continue;
                }
                if (ex.status >= 200 && ex.status < 300) {
                    Record record = Record.fromRdap(ex.body, base);
                    if (record.ldhName.isEmpty()) {
                        record.ldhName = domain;
                    }
                    return record;
                }
                lastError = "The registry returned status " + ex.status + ".";
            } catch (IOException ex) {
                lastError = "The registry could not be reached.";
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                return Record.unavailable("The registry lookup was interrupted.");
            }
        }
        return Record.unavailable(lastError);
    }

    private List<String> basesFor(String domain) throws IOException, InterruptedException {
        Map<String, List<String>> map = bootstrap();
        String[] labels = domain.split("\\.");
        for (int i = 1; i < labels.length; i++) {
            String suffix = String.join(".", java.util.Arrays.copyOfRange(labels, i, labels.length));
            List<String> urls = map.get(suffix);
            if (urls != null && !urls.isEmpty()) {
                List<String> out = new ArrayList<>(urls);
                out.add(FALLBACK);
                return out;
            }
        }
        return List.of(FALLBACK);
    }

    private Map<String, List<String>> bootstrap() throws IOException, InterruptedException {
        synchronized (lock) {
            if (!services.isEmpty() && Duration.between(loaded, Instant.now()).toHours() < 12) {
                return services;
            }
        }
        Exchange ex = get(URI.create(BOOTSTRAP), 0);
        if (ex.status < 200 || ex.status >= 300) {
            throw new IOException("bootstrap " + ex.status);
        }
        Map<String, List<String>> parsed = parseBootstrap(ex.body);
        synchronized (lock) {
            services = parsed;
            loaded = Instant.now();
            return services;
        }
    }

    static Map<String, List<String>> parseBootstrap(String body) {
        Map<String, Object> root = Json.asMap(Json.parse(body));
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (Object row : Json.asList(root.get("services"))) {
            List<Object> pair = Json.asList(row);
            if (pair.size() < 2) {
                continue;
            }
            List<String> urls = new ArrayList<>();
            for (Object u : Json.asList(pair.get(1))) {
                String url = Json.asString(u);
                if (url != null && url.startsWith("https://")) {
                    urls.add(url);
                }
            }
            if (urls.isEmpty()) {
                continue;
            }
            for (Object tld : Json.asList(pair.get(0))) {
                String name = Json.asString(tld);
                if (name != null && !name.isBlank()) {
                    out.put(name.toLowerCase(Locale.ROOT), urls);
                }
            }
        }
        return out;
    }

    private Exchange get(URI uri, int hops) throws IOException, InterruptedException {
        if (!publicHttps(uri)) {
            throw new IOException("refusing non-public registry address");
        }
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(8))
                .header("Accept", "application/rdap+json, application/json")
                .header("User-Agent", "WebSentinel/1.0 (academic RDAP client)")
                .GET()
                .build();
        HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        int status = response.statusCode();
        if (status >= 300 && status < 400 && hops < 3) {
            response.body().close();
            String loc = response.headers().firstValue("location").orElse("");
            if (loc.isBlank()) {
                throw new IOException("redirect without location");
            }
            URI next = uri.resolve(loc);
            return get(next, hops + 1);
        }
        try (InputStream in = response.body()) {
            byte[] data = in.readNBytes(1_000_001);
            if (data.length > 1_000_000) {
                throw new IOException("registry response too large");
            }
            return new Exchange(status, new String(data, StandardCharsets.UTF_8));
        }
    }

    static boolean publicHttps(URI uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            return false;
        }
        host = host.toLowerCase(Locale.ROOT);
        if (host.equals("localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
            return false;
        }
        try {
            InetAddress[] all = InetAddress.getAllByName(host);
            if (all.length == 0) {
                return false;
            }
            for (InetAddress addr : all) {
                if (!publicAddress(addr)) {
                    return false;
                }
            }
            return true;
        } catch (IOException ex) {
            return false;
        }
    }

    static boolean publicAddress(InetAddress addr) {
        if (addr.isAnyLocalAddress() || addr.isLoopbackAddress() || addr.isLinkLocalAddress()
                || addr.isSiteLocalAddress() || addr.isMulticastAddress()) {
            return false;
        }
        byte[] b = addr.getAddress();
        if (b.length == 4) {
            int a = b[0] & 0xff;
            int c = b[1] & 0xff;
            if (a == 0 || a >= 224) return false;
            if (a == 100 && c >= 64 && c <= 127) return false; // carrier-grade NAT
            if (a == 169 && c == 254) return false;
            if (a == 192 && c == 0 && (b[2] & 0xff) == 2) return false;
            if (a == 198 && (c == 18 || c == 19)) return false;
            if (a == 198 && c == 51 && (b[2] & 0xff) == 100) return false;
            if (a == 203 && c == 0 && (b[2] & 0xff) == 113) return false;
        }
        if (b.length == 16) {
            int first = b[0] & 0xff;
            if ((first & 0xfe) == 0xfc) return false; // unique local
        }
        return true;
    }

    static boolean validDomain(String name) {
        if (name == null || name.length() > 253 || name.isBlank()) {
            return false;
        }
        String[] labels = name.split("\\.");
        if (labels.length < 2) {
            return false;
        }
        for (String label : labels) {
            if (label.isEmpty() || label.length() > 63) return false;
            if (label.charAt(0) == '-' || label.charAt(label.length() - 1) == '-') return false;
            for (int i = 0; i < label.length(); i++) {
                char c = label.charAt(i);
                boolean ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
                if (!ok) return false;
            }
        }
        return true;
    }

    private static String join(String base, String domain) {
        String encoded = URLEncoder.encode(domain, StandardCharsets.UTF_8);
        if (base.endsWith("/domain/")) {
            return base + encoded;
        }
        String root = base.endsWith("/") ? base : base + "/";
        return root + "domain/" + encoded;
    }

    private record Exchange(int status, String body) {}
}
