---
date: 2026-09-08
tags:
  - tools
  - linux
---

# Administration & Scripting Basics

## Package management (Debian/Ubuntu)

```bash
sudo apt update                  # refresh package index
sudo apt upgrade                 # upgrade all installed packages
sudo apt install nginx           # install a package
sudo apt remove nginx            # remove a package
sudo apt purge nginx             # remove package + config files
sudo apt autoremove              # remove unused dependencies
apt list --installed             # list installed packages
apt search keyword               # search available packages
```

For RHEL/Fedora use `dnf` instead of `apt`.

## User management

```bash
sudo useradd -m -s /bin/bash bob  # create user with home dir and shell
sudo passwd bob                   # set password for user
sudo userdel -r bob               # delete user and their home dir
id bob                            # show user UID, GID, groups
whoami                            # current username
su - bob                          # switch to user bob (login shell)
```

## Group management

```bash
groups                            # show groups of current user
cat /etc/group                    # list all groups
sudo groupadd developers         # create new group
sudo groupdel developers         # delete group
sudo gpasswd -a bob developers   # add user to group
sudo gpasswd -d bob developers   # remove user from group
```

## Shell configuration (.bashrc)

```bash
nano ~/.bashrc                    # edit shell config
source ~/.bashrc                  # reload config without restart
```

Common `.bashrc` additions:

```bash
alias ll='ls -lah'
alias gs='git status'
export PATH="$HOME/.local/bin:$PATH"
export EDITOR=nano
```

## Bash scripting basics

Create a script:

```bash
nano myscript.sh
```

Script template:

```bash
#!/bin/bash
set -euo pipefail

echo "Starting..."
ls -lh /var/log
echo "Done."
```

Run:

```bash
chmod +x myscript.sh             # make executable
./myscript.sh                    # run script
bash myscript.sh                 # run without chmod
```

## Misc utilities

```bash
cal                              # show calendar for current month
cal 2026                         # show calendar for full year
date                             # current date and time
date -u                          # current UTC date/time
echo "Hello, $USER"             # print text with variable
echo $PATH                       # print PATH variable
```
