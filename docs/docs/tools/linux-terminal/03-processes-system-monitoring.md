---
date: 2026-09-07
tags:
  - tools
  - linux
  - observability
---

# Processes & System Monitoring

## View running processes

```bash
ps                       # processes in current shell
ps aux                   # all processes (detailed)
ps -ef | grep nginx      # filter processes by name
pgrep -af python         # find PIDs by pattern
```

## Live process monitoring

```bash
top                      # live process viewer (q to quit)
htop                     # interactive viewer (if installed)
```

## Stop / kill processes

```bash
kill 12345               # graceful stop (SIGTERM)
kill -9 12345            # force stop (SIGKILL)
pkill -f "uvicorn"       # kill by command pattern
killall node             # kill all by exact name
```

## Background jobs

```bash
long_task &              # start command in background
jobs                     # list background jobs
fg %1                    # bring job 1 to foreground
bg %1                    # resume stopped job in background
```

## Watch command output (auto-refresh)

```bash
watch -n 5 'df -h'       # run df -h every 5 seconds
watch -n 2 'ps aux | head -20'  # watch top processes
```

## Services (systemd)

```bash
systemctl status nginx   # check if service is running
systemctl start nginx    # start service
systemctl stop nginx     # stop service
systemctl restart nginx  # restart service
systemctl enable nginx   # start on boot
systemctl disable nginx  # do not start on boot
systemctl list-units --failed  # show failed services
```

## View logs

```bash
journalctl -u nginx -n 100   # last 100 log lines for service
journalctl -u nginx -f       # follow logs live
journalctl -p err             # show only errors and above
```

## Logged-in users

```bash
who                      # show who is logged in
w                        # show logged-in users + their activity
```

## Memory, disk, system

```bash
free -h                  # RAM usage (human-readable)
df -h                    # disk usage by filesystem
du -sh ./*               # size of each item in current dir
du -sh /var/log          # size of specific directory
lsblk                    # list block devices (disks/partitions)
uptime                   # uptime + load average
uname -a                 # kernel info
hostname                 # show system hostname
lscpu                    # CPU info (cores, model, cache)
vmstat 1 5               # virtual memory stats (1s interval, 5 times)
cat /etc/os-release      # distribution info
```
