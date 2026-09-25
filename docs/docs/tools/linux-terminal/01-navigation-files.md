---
date: 2026-09-07
tags:
  - tools
  - linux
---

# Navigation, Files & Shell Basics

## Get help

```bash
man ls                   # open manual page for ls
man grep                 # open manual page for grep
command --help           # short help for most commands
which python3            # show full path of a command
whatis ls                # one-line description from manual
```

## Basic system info

```bash
whoami                   # current username
uname -a                 # kernel and system info
date                     # current date and time
uptime                   # how long system is running + load
```

## Bash shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Stop running command |
| `Ctrl+Z` | Suspend (pause) running command |
| `Ctrl+D` | Exit current shell / logout |
| `Ctrl+L` | Clear screen (same as `clear`) |
| `Ctrl+R` | Search command history |
| `Ctrl+A` | Move cursor to start of line |
| `Ctrl+E` | Move cursor to end of line |
| `Ctrl+U` | Cut from cursor to start of line |
| `Ctrl+K` | Cut from cursor to end of line |
| `Tab` | Auto-complete file/command name |
| `!!` | Repeat last command |
| `!ls` | Rerun last command starting with `ls` |
| `sudo !!` | Rerun last command as root |
| `history` | Show command history |
| `clear` | Clear terminal screen |

## Navigation

```bash
pwd                      # print current directory
ls                       # list files
ls -lah                  # detailed list, hidden files, human sizes
ls -ltr                  # sort by time, newest last
cd /var/log              # go to absolute path
cd ..                    # go to parent directory
cd ~                     # go to home directory
cd -                     # go to previous directory
```

## Create files and directories

```bash
mkdir notes              # create directory
mkdir -p project/src/api # create nested directories
touch todo.txt           # create empty file or update timestamp
```

## Copy and move

```bash
cp file.txt file.bak     # copy file
cp -r src/ src-copy/     # copy directory recursively
cp -i file.txt backup/   # ask before overwrite

mv old.txt new.txt       # rename file
mv *.log logs/           # move files by pattern
mv -i config.yml backup/ # ask before overwrite
```

## Delete

```bash
rm file.txt              # delete file
rm -i file.txt           # ask before deleting
rm -r old_folder/        # delete directory recursively
rmdir empty_folder       # remove only if empty
```

## View and edit file content

```bash
cat README.md            # print whole file (small files)
cat -n file.txt          # print with line numbers
less app.log             # scroll through file (q to quit)
head -n 20 app.log       # first 20 lines
tail -n 50 app.log       # last 50 lines
tail -F app.log          # follow file as it grows (live logs)
nano config.yaml         # lightweight terminal text editor
vim config.yaml          # powerful terminal text editor (:wq to save/quit)
```

## I/O redirection

```bash
cat > file.txt           # write to file from stdin (Ctrl+D to save)
echo "line" >> file.txt  # append text to file
cat a.txt b.txt > out.txt  # combine files into one
```

## File info

```bash
file image.png           # detect file type
wc -l app.py             # count lines
wc -w README.md          # count words
diff -u old.txt new.txt  # show differences between files
du -sh project/          # directory size
```

## Environment variables

```bash
echo $PATH               # print PATH variable
echo $HOME               # print home directory path
echo $SHELL              # print current shell
env                      # show all environment variables
export API_KEY="secret"  # set variable for session
unset API_KEY            # remove variable
```

## sudo (run as superuser)

```bash
sudo command             # run command with root privileges
sudo -i                  # open root shell
sudo !!                  # rerun last command as root
```

## Permissions basics

```bash
ls -l                    # show permissions
chmod 644 file.txt       # owner read/write, others read
chmod 755 script.sh      # owner full, others read/execute
chmod +x script.sh       # add execute permission
chown user:group file    # change owner and group
```

Permission digits: `4` = read, `2` = write, `1` = execute (sum per role).

## Archives basics

```bash
tar -czf backup.tar.gz folder/   # create tar.gz archive
tar -xzf backup.tar.gz           # extract tar.gz archive
tar -tzf backup.tar.gz           # list contents without extracting
gzip file.txt                    # compress file → file.txt.gz
gunzip file.txt.gz               # decompress gzip file
zip -r project.zip project/      # create zip archive
unzip project.zip                # extract zip archive
rsync -av src/ dest/             # sync directories (incremental)
```
