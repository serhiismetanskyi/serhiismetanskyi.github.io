---
date: 2026-09-07
tags:
  - tools
  - linux
---

# Network Basics

## Local network info

```bash
ip a                     # show interfaces and IP addresses
ip route                 # show routing table
ss -tulpen               # show listening ports (modern)
hostname -I              # quick local IP address
```

## Legacy network commands

```bash
ifconfig                 # show interfaces (deprecated → use ip a)
netstat -tulpen          # show listening ports (deprecated → use ss)
netstat -an | grep ':80' # filter connections by port
```

## Connectivity and DNS

```bash
ping -c 4 8.8.8.8       # test network connectivity
ping -c 4 example.com   # test DNS + connectivity
traceroute example.com   # trace route to host (hops)
nslookup example.com     # DNS lookup (name → IP)
dig example.com          # advanced DNS lookup (detailed)
curl -I https://example.com  # get HTTP response headers
curl -s https://api.github.com | jq .  # fetch JSON and format
```

## Download files

```bash
curl -L -o file.tar.gz https://example.com/file.tar.gz  # download with curl
wget https://example.com/file.tar.gz                      # download with wget
wget -c https://example.com/big.iso                       # resume interrupted download
```

## SSH

```bash
ssh user@server                     # connect to remote server
ssh -p 2222 user@server             # connect on custom port
ssh -i ~/.ssh/id_ed25519 user@server  # connect with specific key
```

## Copy files over SSH

```bash
scp local.txt user@server:/tmp/     # upload file to server
scp user@server:/var/log/app.log ./ # download file from server
scp -r folder/ user@server:/opt/    # upload directory recursively
```
