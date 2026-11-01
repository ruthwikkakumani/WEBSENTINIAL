// rdap-health probes the registry using the core's actual health-check code.
// It starts no server and never makes a domain lookup.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"websentinel/core/internal/collect"
)

func main() {
	base := flag.String("rdap", "http://127.0.0.1:8082", "loopback RDAP origin")
	flag.Parse()
	if !(collect.Registry{Base: *base}).Health(context.Background()) {
		fmt.Println("RDAP health: down (invalid configuration, unavailable endpoint, or invalid response)")
		os.Exit(1)
	}
	fmt.Println("RDAP health: ok")
}
