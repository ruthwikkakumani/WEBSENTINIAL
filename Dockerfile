# =============================================================================
# WebSentinel — Production multi-stage Docker image
# =============================================================================

# ---------- Stage 1 : Build Go core -----------------------------------------
FROM golang:1.25-alpine AS go-build
WORKDIR /src
COPY services/core/go.mod services/core/go.sum ./
RUN go mod download
COPY services/core/ ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /sentinel ./cmd/sentinel && mkdir /data

# ---------- Stage 2 : Build React web frontend --------------------------------
FROM node:22-alpine AS web-build
WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

# ---------- Stage 3 : Minimal runtime image -----------------------------------
FROM gcr.io/distroless/base-debian12:nonroot AS runtime
LABEL maintainer="WebSentinel Team <dev@websentinel.io>"
LABEL version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/websentinel/websentinel"
LABEL org.opencontainers.image.description="WebSentinel — domain security monitoring platform"

# Copy Go binary
COPY --from=go-build /sentinel /sentinel

# Copy built web assets
COPY --from=web-build /web/dist /web/dist

# Copy browser extension (static artefacts)
COPY apps/extension /apps/extension

# Default data directory
COPY --from=go-build --chown=65534:65534 /data /data
VOLUME ["/data"]

# Non-root user (distroless nonroot image user is 65534 already)
USER 65534

EXPOSE 8080

# Core has no CLI health mode. Probe /api/v1/health from the orchestrator.
HEALTHCHECK NONE

ENTRYPOINT ["/sentinel"]
CMD ["-addr", "0.0.0.0:8080", "-data", "/data/history.json"]