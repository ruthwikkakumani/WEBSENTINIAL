# =============================================================================
# WebSentinel Core — Go microservice
# =============================================================================

# ---------- Build stage ------------------------------------------------------
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /sentinel ./cmd/sentinel && mkdir /data

# ---------- Runtime stage ----------------------------------------------------
FROM gcr.io/distroless/base-debian12:nonroot
LABEL maintainer="WebSentinel Team <dev@websentinel.io>"
LABEL version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/websentinel/websentinel"
LABEL org.opencontainers.image.description="WebSentinel Core — assessment engine and API"

COPY --from=build /sentinel /sentinel

COPY --from=build --chown=65534:65534 /data /data
VOLUME ["/data"]

USER 65534

EXPOSE 8080

# Core has no CLI health mode. Probe /api/v1/health from the orchestrator.
HEALTHCHECK NONE

ENTRYPOINT ["/sentinel"]
CMD ["-addr", "0.0.0.0:8080", "-data", "/data/history.json"]