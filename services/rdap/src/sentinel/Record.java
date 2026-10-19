package sentinel;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** A registration record reduced to the fields WebSentinel scores and shows. */
final class Record {
    boolean found;
    String source = "";
    String ldhName = "";
    String registrar = "";
    List<String> statuses = List.of();
    List<String> nameservers = List.of();
    String registered = "";
    String updated = "";
    String expires = "";
    boolean dnssec;
    boolean dnssecKnown;
    String error = "";

    static Record unavailable(String message) {
        Record r = new Record();
        r.error = message;
        return r;
    }

    static Record fromRdap(String body, String source) {
        Object parsed;
        try {
            parsed = Json.parse(body);
        } catch (RuntimeException ex) {
            return unavailable("The registry returned data that could not be read.");
        }
        Map<String, Object> root = Json.asMap(parsed);
        if (root.isEmpty()) {
            return unavailable("The registry returned data that could not be read.");
        }
        Object code = root.get("errorCode");
        if (code instanceof Number n && n.intValue() >= 400) {
            String title = Json.asString(root.get("title"));
            if (n.intValue() == 404) {
                return unavailable("No registration record was published for this domain.");
            }
            return unavailable(title == null ? "The registry returned an error." : title);
        }
        Record r = new Record();
        r.found = true;
        r.source = source == null ? "" : source;
        String name = Json.asString(root.get("ldhName"));
        r.ldhName = name == null ? "" : name.toLowerCase(Locale.ROOT);
        r.statuses = strings(Json.asList(root.get("status")));
        r.nameservers = nameservers(Json.asList(root.get("nameservers")));
        r.registrar = registrar(Json.asList(root.get("entities")));
        for (Object event : Json.asList(root.get("events"))) {
            Map<String, Object> row = Json.asMap(event);
            String action = Json.asString(row.get("eventAction"));
            String when = normalizeTime(Json.asString(row.get("eventDate")));
            if (action == null || when == null) {
                continue;
            }
            switch (action.toLowerCase(Locale.ROOT)) {
                case "registration" -> {
                    if (r.registered.isEmpty()) r.registered = when;
                }
                case "expiration", "registrar expiration" -> {
                    if (r.expires.isEmpty()) r.expires = when;
                }
                case "last changed" -> {
                    if (r.updated.isEmpty()) r.updated = when;
                }
                default -> { }
            }
        }
        Map<String, Object> secure = Json.asMap(root.get("secureDNS"));
        if (!secure.isEmpty() && secure.get("delegationSigned") instanceof Boolean) {
            r.dnssecKnown = true;
            r.dnssec = Json.asBool(secure.get("delegationSigned"));
        }
        return r;
    }

    String toJson() {
        StringBuilder b = new StringBuilder(512);
        b.append('{');
        field(b, "found", found);
        b.append(',');
        field(b, "source", source);
        b.append(',');
        field(b, "ldhName", ldhName);
        b.append(',');
        field(b, "registrar", registrar);
        b.append(',');
        field(b, "statuses", statuses);
        b.append(',');
        field(b, "nameservers", nameservers);
        b.append(',');
        field(b, "registered", registered);
        b.append(',');
        field(b, "updated", updated);
        b.append(',');
        field(b, "expires", expires);
        b.append(',');
        field(b, "dnssec", dnssec);
        b.append(',');
        field(b, "dnssecKnown", dnssecKnown);
        b.append(',');
        field(b, "error", error);
        b.append('}');
        return b.toString();
    }

    private static List<String> strings(List<Object> raw) {
        List<String> out = new ArrayList<>();
        for (Object item : raw) {
            String s = Json.asString(item);
            if (s != null && !s.isBlank()) {
                out.add(s);
            }
        }
        return out;
    }

    private static List<String> nameservers(List<Object> raw) {
        List<String> out = new ArrayList<>();
        for (Object item : raw) {
            String name = Json.asString(Json.asMap(item).get("ldhName"));
            if (name != null && !name.isBlank()) {
                out.add(name.toLowerCase(Locale.ROOT));
            }
        }
        return out;
    }

    private static String registrar(List<Object> entities) {
        for (Object entity : entities) {
            Map<String, Object> row = Json.asMap(entity);
            boolean registrar = false;
            for (Object role : Json.asList(row.get("roles"))) {
                String s = Json.asString(role);
                if (s != null && s.equalsIgnoreCase("registrar")) {
                    registrar = true;
                    break;
                }
            }
            if (!registrar) {
                continue;
            }
            String fn = fn(row.get("vcardArray"));
            if (fn != null && !fn.isBlank()) {
                return fn;
            }
            String name = Json.asString(row.get("handle"));
            if (name != null) {
                return name;
            }
        }
        return "";
    }

    private static String fn(Object vcardArray) {
        List<Object> card = Json.asList(vcardArray);
        if (card.size() < 2) {
            return null;
        }
        for (Object prop : Json.asList(card.get(1))) {
            List<Object> parts = Json.asList(prop);
            if (parts.size() >= 4 && "fn".equalsIgnoreCase(Json.asString(parts.get(0)))) {
                return Json.asString(parts.get(3));
            }
        }
        return null;
    }

    private static String normalizeTime(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(raw).toString();
        } catch (DateTimeParseException ignored) {
            // RDAP often uses an offset instead of Z.
        }
        try {
            return OffsetDateTime.parse(raw).toInstant().toString();
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private static void field(StringBuilder b, String key, boolean value) {
        b.append('"').append(key).append("\":").append(value);
    }

    private static void field(StringBuilder b, String key, String value) {
        b.append('"').append(key).append("\":").append(escape(value));
    }

    private static void field(StringBuilder b, String key, List<String> values) {
        b.append('"').append(key).append("\":[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) b.append(',');
            b.append(escape(values.get(i)));
        }
        b.append(']');
    }

    static String escape(String s) {
        if (s == null) {
            return "\"\"";
        }
        StringBuilder b = new StringBuilder(s.length() + 2);
        b.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> {
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
                }
            }
        }
        b.append('"');
        return b.toString();
    }
}
