---
date: 2026-09-09
tags:
  - tools
  - kubernetes
  - rag
---

# Configuration & Storage

## ConfigMaps

Store non-sensitive configuration data as key-value pairs, consumed as environment variables or mounted files.

### Create

```bash
kubectl create configmap app-config --from-literal=DB_HOST=postgres --from-literal=DB_PORT=5432
kubectl create configmap nginx-conf --from-file=nginx.conf
kubectl create configmap env-config --from-env-file=.env
```

### YAML Definition

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  DB_HOST: "postgres"
  DB_PORT: "5432"
  LOG_LEVEL: "info"
```

### Consume in Pod

Three methods: `envFrom` (all keys as env vars), `valueFrom.configMapKeyRef` (selective), or volume mount (`configMap` volume → `mountPath`).

```yaml
spec:
  containers:
    - name: app
      envFrom:
        - configMapRef:
            name: app-config
```

---

## Secrets

Store sensitive data (passwords, tokens, TLS certs). Base64-encoded by default; enable encryption at rest for production.

### Create

```bash
kubectl create secret generic db-creds \
  --from-literal=DB_PASSWORD=s3cret \
  --from-literal=DB_USER=admin

# TLS secret
kubectl create secret tls tls-secret --cert=cert.pem --key=key.pem
```

### YAML Definition

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-creds
type: Opaque
stringData:
  DB_USER: admin
  DB_PASSWORD: s3cret
```

Use `stringData` (plain text) instead of `data` (base64) for readability; K8s auto-encodes.

Same consumption patterns as ConfigMap: `secretKeyRef` for env vars, or `secret` volume mount with `readOnly: true`.

### Security Best Practices

| Practice | How |
|----------|-----|
| Enable encryption at rest | `EncryptionConfiguration` in API server |
| Use external vault | HashiCorp Vault, AWS Secrets Manager via CSI driver |
| Restrict access | RBAC — limit `get`/`list` on Secrets |
| Never commit to git | Use sealed-secrets or external-secrets operator |
| Rotate regularly | Automate rotation via operator or vault |

---

## Persistent Volumes (PV) and Claims (PVC)

Pods are ephemeral — storage must be explicitly provisioned to survive restarts.

### Storage Architecture

```
StorageClass ──► PersistentVolume (PV) ◄── PersistentVolumeClaim (PVC) ◄── Pod
                 (actual disk)             (request for storage)
```

| Concept | Description |
|---------|-------------|
| **PV** | A piece of storage provisioned by admin or dynamically |
| **PVC** | A user's request for storage (size, access mode) |
| **StorageClass** | Defines provisioner and parameters for dynamic PV creation |

### Access Modes

| Mode | Abbr | Description |
|------|------|-------------|
| ReadWriteOnce | RWO | Single node read-write |
| ReadOnlyMany | ROX | Multiple nodes read-only |
| ReadWriteMany | RWX | Multiple nodes read-write (NFS, EFS) |

### PVC Example

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: standard
  resources:
    requests:
      storage: 10Gi
```

### Mount in Pod

```yaml
spec:
  containers:
    - name: app
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data-pvc
```

---

## StorageClass

Defines how PVs are dynamically provisioned.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  iopsPerGB: "50"
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
```

| Reclaim Policy | Behavior When PVC Deleted |
|----------------|--------------------------|
| `Delete` | PV and backing storage removed |
| `Retain` | PV preserved, manual cleanup needed |

---

## emptyDir and hostPath

| Volume Type | Lifetime | Use Case |
|-------------|----------|----------|
| `emptyDir` | Pod lifetime | Shared scratch space between containers |
| `hostPath` | Node lifetime | Access node filesystem (use with caution) |

```yaml
volumes:
  - name: cache
    emptyDir:
      sizeLimit: 500Mi
```

---

## See also
- [Kubernetes Overview](index.md)
- [Helm & Deployment Strategies](05-helm-deployments.md)
- [Docker Security & Production](../docker/05-security-production.md)
