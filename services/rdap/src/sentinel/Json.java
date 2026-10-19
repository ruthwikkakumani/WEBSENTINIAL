package sentinel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A small JSON reader for registry documents. No third-party parser. */
final class Json {
    private Json() {}

    static Object parse(String s) {
        if (s == null) {
            throw new IllegalArgumentException("empty json");
        }
        if (!s.isEmpty() && s.charAt(0) == '\uFEFF') {
            s = s.substring(1);
        }
        Parser p = new Parser(s);
        Object v = p.parseValue();
        p.skip();
        if (p.i != s.length()) {
            throw new IllegalArgumentException("trailing json");
        }
        return v;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> asMap(Object o) {
        if (o instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        return Map.of();
    }

    @SuppressWarnings("unchecked")
    static List<Object> asList(Object o) {
        if (o instanceof List<?> list) {
            return (List<Object>) list;
        }
        return List.of();
    }

    static String asString(Object o) {
        return o instanceof String s ? s : null;
    }

    static boolean asBool(Object o) {
        return o instanceof Boolean b && b;
    }

    private static final class Parser {
        private final String s;
        private int i;

        Parser(String s) {
            this.s = s;
        }

        Object parseValue() {
            skip();
            if (i >= s.length()) {
                throw new IllegalArgumentException("unexpected end");
            }
            char c = s.charAt(i);
            return switch (c) {
                case '{' -> parseObject();
                case '[' -> parseArray();
                case '"' -> parseString();
                case 't' -> literal("true", Boolean.TRUE);
                case 'f' -> literal("false", Boolean.FALSE);
                case 'n' -> literal("null", null);
                default -> parseNumber();
            };
        }

        Map<String, Object> parseObject() {
            expect('{');
            Map<String, Object> map = new LinkedHashMap<>();
            skip();
            if (peek('}')) {
                i++;
                return map;
            }
            while (true) {
                skip();
                String key = parseString();
                skip();
                expect(':');
                map.put(key, parseValue());
                skip();
                if (peek('}')) {
                    i++;
                    return map;
                }
                expect(',');
            }
        }

        List<Object> parseArray() {
            expect('[');
            List<Object> list = new ArrayList<>();
            skip();
            if (peek(']')) {
                i++;
                return list;
            }
            while (true) {
                list.add(parseValue());
                skip();
                if (peek(']')) {
                    i++;
                    return list;
                }
                expect(',');
            }
        }

        String parseString() {
            expect('"');
            StringBuilder b = new StringBuilder();
            while (i < s.length()) {
                char c = s.charAt(i++);
                if (c == '"') {
                    return b.toString();
                }
                if (c == '\\') {
                    if (i >= s.length()) {
                        throw new IllegalArgumentException("bad escape");
                    }
                    char e = s.charAt(i++);
                    switch (e) {
                        case '"', '\\', '/' -> b.append(e);
                        case 'b' -> b.append('\b');
                        case 'f' -> b.append('\f');
                        case 'n' -> b.append('\n');
                        case 'r' -> b.append('\r');
                        case 't' -> b.append('\t');
                        case 'u' -> {
                            if (i + 4 > s.length()) {
                                throw new IllegalArgumentException("bad unicode");
                            }
                            int cp = Integer.parseInt(s.substring(i, i + 4), 16);
                            b.append((char) cp);
                            i += 4;
                        }
                        default -> throw new IllegalArgumentException("bad escape");
                    }
                } else {
                    b.append(c);
                }
            }
            throw new IllegalArgumentException("unterminated string");
        }

        Number parseNumber() {
            int start = i;
            if (peek('-')) {
                i++;
            }
            while (i < s.length() && Character.isDigit(s.charAt(i))) {
                i++;
            }
            boolean real = false;
            if (i < s.length() && s.charAt(i) == '.') {
                real = true;
                i++;
                while (i < s.length() && Character.isDigit(s.charAt(i))) {
                    i++;
                }
            }
            if (i < s.length() && (s.charAt(i) == 'e' || s.charAt(i) == 'E')) {
                real = true;
                i++;
                if (i < s.length() && (s.charAt(i) == '+' || s.charAt(i) == '-')) {
                    i++;
                }
                while (i < s.length() && Character.isDigit(s.charAt(i))) {
                    i++;
                }
            }
            String num = s.substring(start, i);
            if (real) {
                return Double.parseDouble(num);
            }
            return Long.parseLong(num);
        }

        Object literal(String word, Object value) {
            if (!s.startsWith(word, i)) {
                throw new IllegalArgumentException("bad literal");
            }
            i += word.length();
            return value;
        }

        void skip() {
            while (i < s.length() && Character.isWhitespace(s.charAt(i))) {
                i++;
            }
        }

        void expect(char c) {
            skip();
            if (i >= s.length() || s.charAt(i) != c) {
                throw new IllegalArgumentException("expected " + c);
            }
            i++;
        }

        boolean peek(char c) {
            return i < s.length() && s.charAt(i) == c;
        }
    }
}
