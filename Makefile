.PHONY: test test-go test-java build-web \
        docker-build docker-push k8s-deploy helm-install prom-up all-services

# ---- Test Targets ----

test: test-go test-java test-web test-eval

test-eval:
	cd services/core && go run ./cmd/eval -fixtures ../../data/eval-fixtures.json

test-web:
	cd apps/web && npm test

test-go:
	cd services/core && go test ./...

test-java:
	cd services/rdap && javac --release 21 -d build src/sentinel/*.java && java -cp build sentinel.ParseTest

build-web:
	cd apps/web && npm install && npm run build

# ---- Docker Build ----

DOCKER_REGISTRY ?= ghcr.io
DOCKER_ORG     ?= websentinel
IMAGE_CORE     ?= $(DOCKER_REGISTRY)/$(DOCKER_ORG)/websentinel-core
IMAGE_RDAP     ?= $(DOCKER_REGISTRY)/$(DOCKER_ORG)/websentinel-rdap
IMAGE_TAG      ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo latest)

docker-build: docker-build-core docker-build-rdap

docker-build-core:
	docker build -t $(IMAGE_CORE):$(IMAGE_TAG) -f Dockerfile .

docker-build-rdap:
	docker build -t $(IMAGE_RDAP):$(IMAGE_TAG) -f services/rdap/Dockerfile services/rdap

docker-push: docker-push-core docker-push-rdap

docker-push-core:
	docker push $(IMAGE_CORE):$(IMAGE_TAG)

docker-push-rdap:
	docker push $(IMAGE_RDAP):$(IMAGE_TAG)

# ---- Docker Compose ----

compose-up:
	docker compose up --build -d

compose-down:
	docker compose down

compose-logs:
	docker compose logs -f

# ---- Kubernetes ----

K8S_NAMESPACE ?= websentinel
KUBECTL       ?= kubectl

k8s-namespace:
	$(KUBECTL) apply -f k8s/namespace.yaml

k8s-configmap:
	$(KUBECTL) apply -f k8s/configmap.yaml

k8s-deploy: k8s-namespace k8s-configmap
	$(KUBECTL) apply -f k8s/deployment-core.yaml
	$(KUBECTL) apply -f k8s/deployment-rdap.yaml
	$(KUBECTL) apply -f k8s/service-core.yaml
	$(KUBECTL) apply -f k8s/service-rdap.yaml
	$(KUBECTL) apply -f k8s/ingress.yaml
	$(KUBECTL) apply -f k8s/hpa.yaml
	$(KUBECTL) apply -f k8s/pdb.yaml
	@echo "--- Waiting for rollout ---"
	$(KUBECTL) -n $(K8S_NAMESPACE) rollout status deployment/websentinel-core --timeout=120s
	$(KUBECTL) -n $(K8S_NAMESPACE) rollout status deployment/websentinel-rdap --timeout=120s

k8s-undeploy:
	$(KUBECTL) delete -f k8s/ingress.yaml --ignore-not-found
	$(KUBECTL) delete -f k8s/service-core.yaml --ignore-not-found
	$(KUBECTL) delete -f k8s/service-rdap.yaml --ignore-not-found
	$(KUBECTL) delete -f k8s/deployment-core.yaml --ignore-not-found
	$(KUBECTL) delete -f k8s/deployment-rdap.yaml --ignore-not-found
	$(KUBECTL) delete -f k8s/hpa.yaml --ignore-not-found
	$(KUBECTL) delete -f k8s/pdb.yaml --ignore-not-found
	$(KUBECTL) delete -f k8s/configmap.yaml --ignore-not-found

k8s-logs:
	$(KUBECTL) -n $(K8S_NAMESPACE) logs -l app=websentinel-core --tail=100 -f

# ---- Helm (optional) ----

helm-install:
	helm upgrade --install websentinel ./helm/websentinel \
		--namespace $(K8S_NAMESPACE) --create-namespace

# ---- Prometheus / Observability ----

prom-up:
	docker compose up -d prometheus grafana

# ---- One-Shot Full Stack ----

all-services: docker-build compose-up
	@echo "WebSentinel running: http://localhost:8080"

# ---- Utility ----

.PHONY: docker-build-core docker-build-rdap docker-push-core docker-push-rdap \
        compose-up compose-down compose-logs \
        k8s-namespace k8s-configmap k8s-deploy k8s-undeploy k8s-logs
