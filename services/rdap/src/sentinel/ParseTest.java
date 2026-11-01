package sentinel;

import java.net.InetAddress;

/** Standalone checks for the registry parser and the address policy. */
public final class ParseTest {
    public static void main(String[] args) throws Exception {
        Object parsed = Json.parse("{\"a\":1,\"b\":[true,null,\"x\\\"y\"],\"c\":{\"d\":\"z\"}}");
        var map = Json.asMap(parsed);
        if (!(map.get("a") instanceof Long) || ((Long) map.get("a")) != 1L) fail("number");
        if (Json.asList(map.get("b")).size() != 3) fail("array");
        if (!"z".equals(Json.asString(Json.asMap(map.get("c")).get("d")))) fail("nest");

        String fixture = """
                {
                  "ldhName": "Example.COM",
                  "status": ["active", "client transfer prohibited"],
                  "nameservers": [{"ldhName": "A.IANA-SERVERS.NET"}, {"ldhName": "b.iana-servers.net"}],
                  "secureDNS": {"delegationSigned": true},
                  "events": [
                    {"eventAction": "registration", "eventDate": "1995-08-14T04:00:00Z"},
                    {"eventAction": "expiration", "eventDate": "2026-08-13T04:00:00+00:00"},
                    {"eventAction": "last changed", "eventDate": "2024-08-14T07:01:38Z"},
                    {"eventAction": "last update of RDAP database", "eventDate": "2026-10-18T00:00:00Z"}
                  ],
                  "entities": [{
                    "roles": ["registrar"],
                    "vcardArray": ["vcard", [
                      ["version", {}, "text", "4.0"],
                      ["fn", {}, "text", "RESERVED-Internet Assigned Numbers Authority"]
                    ]]
                  }]
                }
                """;
        Record record = Record.fromRdap(fixture, "https://rdap.example/v1/");
        if (!record.found) fail("found");
        if (!"example.com".equals(record.ldhName)) fail("name " + record.ldhName);
        if (!record.registered.startsWith("1995-08-14")) fail("registered " + record.registered);
        if (!record.expires.startsWith("2026-08-13")) fail("expires " + record.expires);
        if (!record.updated.startsWith("2024-08-14")) fail("updated " + record.updated);
        if (!"RESERVED-Internet Assigned Numbers Authority".equals(record.registrar)) fail("registrar");
        if (record.nameservers.size() != 2 || !"a.iana-servers.net".equals(record.nameservers.get(0))) fail("ns");
        if (!record.dnssec || !record.dnssecKnown) fail("dnssec");
        if (record.toJson().contains("last update of RDAP")) fail("leaked event");

        Record missing = Record.fromRdap("{\"errorCode\":404,\"title\":\"Not Found\"}", "https://rdap.example/");
        if (missing.found || !missing.error.contains("No registration")) fail("404");

        String boot = """
                {"services":[[["com","net"],["https://rdap.verisign.com/com/v1/"]],[["co.uk"],["https://rdap.nominet.uk/uk/"]]]}
                """;
        var services = Client.parseBootstrap(boot);
        if (!services.get("com").get(0).contains("verisign")) fail("bootstrap com");
        if (!services.containsKey("co.uk")) fail("bootstrap uk");

        if (!Client.validDomain("example.com")) fail("valid");
        if (Client.validDomain("localhost")) fail("single");
        if (Client.validDomain("bad_domain.com")) fail("underscore");
        if (Client.validDomain("ex ample.com")) fail("space");

        if (Client.publicAddress(InetAddress.getByName("8.8.8.8")) != true) fail("public ip");
        if (Client.publicAddress(InetAddress.getByName("127.0.0.1"))) fail("loopback");
        if (Client.publicAddress(InetAddress.getByName("10.1.2.3"))) fail("rfc1918");
        if (Client.publicAddress(InetAddress.getByName("169.254.169.254"))) fail("metadata");
        if (Client.publicAddress(InetAddress.getByName("192.168.0.1"))) fail("lan");

        for (String name : new String[]{"https://example.invalid/private?token=secret", "user:secret@example.invalid", "example.invalid/private", "example.invalid?token=secret", "example.invalid#secret"}) {
            if (Client.validDomain(name)) fail("URL material accepted as a domain");
        }
        MainTest.run();
        System.out.println("rdap parser and request privacy checks passed");
    }

    private static void fail(String message) {
        throw new AssertionError(message);
    }
}
