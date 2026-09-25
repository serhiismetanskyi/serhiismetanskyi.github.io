---
date: 2026-09-09
tags:
  - tools
  - kubernetes
---

# Services & Networking

## Networking Model

Every Pod gets a unique cluster-wide IP address. Pods communicate directly — no NAT required. A CNI (Container Networking Interface) plugin implements the network (Calico, Cilium, Flannel, Weave).

| Scope | How |
|-------|-----|
| Pod ↔ Pod (same node) | Virtual bridge / veth pairs |
| Pod ↔ Pod (cross-node) | CNI overlay or native routing |
| Pod ↔ Service | kube-proxy iptables/IPVS rules |
| External ↔ Cluster | Ingress controller or LoadBalancer |

---

## Service Types

A Service provides a stable endpoint (virtual IP + DNS name) for a set of Pods selected by labels.

### ClusterIP (default)

Internal-only. Accessible only within the cluster.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  type: ClusterIP
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 8000
      protocol: TCP
```

DNS: `api.<namespace>.svc.cluster.local` → resolves to the ClusterIP.

### NodePort

Exposes the service on a static port on every node's IP.

```yaml
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 8000
      nodePort: 30080
```

Access: `<any-node-ip>:30080`. Range: 30000–32767. Use for dev/test, not production.

### LoadBalancer

Provisions an external cloud load balancer (AWS ELB, GCP LB, Azure LB).

```yaml
spec:
  type: LoadBalancer
  ports:
    - port: 443
      targetPort: 8000
```

### ExternalName

Maps a Service to an external DNS name (CNAME record). No proxying.

```yaml
spec:
  type: ExternalName
  externalName: db.example.com
```

---

## Service Comparison

| Type | Scope | Use Case |
|------|-------|----------|
| **ClusterIP** | Internal only | Microservice-to-microservice |
| **NodePort** | Node IP + port | Dev/test external access |
| **LoadBalancer** | External LB | Production external traffic |
| **ExternalName** | DNS alias | External service reference |

---

## Ingress

Layer 7 (HTTP/HTTPS) routing. Requires an Ingress controller (NGINX, Traefik, Istio, Envoy).

For modern setups, also consider **Gateway API** (`GatewayClass`, `Gateway`, `HTTPRoute`) for richer traffic policy and multi-team routing boundaries.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.example.com
      secretName: tls-secret
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
```

| Feature | Service (L4) | Ingress (L7) |
|---------|-------------|--------------|
| Layer | TCP/UDP | HTTP/HTTPS |
| Routing | IP + port | Host, path, headers |
| TLS termination | No (use mesh) | Yes (via Secret) |
| Multiple backends | No | Yes (path-based, host-based) |

---

## NetworkPolicy

Restrict traffic between Pods. Default: all traffic allowed. NetworkPolicies act as firewalls.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
```

Then whitelist specific traffic: add `ingress.from` with `podSelector` matching allowed sources and specific `ports`. **Best practice**: deny-all first, then whitelist required paths.

---

## DNS

CoreDNS (cluster DNS) resolves Service names automatically:

| Query | Resolves To |
|-------|-------------|
| `<svc>` | ClusterIP (same namespace) |
| `<svc>.<ns>` | ClusterIP (cross-namespace) |
| `<svc>.<ns>.svc.cluster.local` | Fully qualified |
| `<pod-ip-dashed>.<ns>.pod.cluster.local` | Pod IP |

---

## Debugging Network Issues

```bash
# Test DNS resolution from inside cluster
kubectl run dns-test --rm -it --image=busybox -- nslookup api.default

# Check Service endpoints
kubectl get endpoints api

# Test connectivity
kubectl run net-test --rm -it --image=nicolaka/netshoot -- curl http://api:80

# Port forward for local debugging
kubectl port-forward svc/api 8080:80
```

---

## See also
- [Kubernetes Overview](index.md)
- [Security & Observability](06-security-observability.md)
- [Docker Networking & Volumes](../docker/04-networking-volumes.md)
