# =============================================================================
# WebSentinel RDAP — Java RDAP proxy microservice
# =============================================================================

# ---------- Build stage ------------------------------------------------------
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /src
COPY src/ ./src/
RUN javac --release 21 -d build src/sentinel/*.java && \
    cd build && \
    jar cf /rdap-service.jar sentinel/*.class

# ---------- Runtime stage ----------------------------------------------------
FROM eclipse-temurin:21-jre-alpine
LABEL maintainer="WebSentinel Team <dev@websentinel.io>"
LABEL version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/websentinel/websentinel"
LABEL org.opencontainers.image.description="WebSentinel RDAP — domain registration data proxy"

RUN addgroup -S sentinel && adduser -S -G sentinel sentinel

COPY --from=build /rdap-service.jar /rdap-service.jar

USER sentinel

EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8082/health || exit 1

ENTRYPOINT ["java", "-cp", "/rdap-service.jar", "sentinel.Main", "8082"]