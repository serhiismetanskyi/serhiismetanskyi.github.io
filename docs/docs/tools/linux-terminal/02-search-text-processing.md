---
date: 2026-09-07
tags:
  - tools
  - linux
---

# Search, Pipes & Text Processing

## Find files

```bash
find . -name "*.py"              # find by name pattern
find . -name "name*"             # find files starting with name
find . -iname "*.jpg"            # case-insensitive search
find . -type f -mmin -30         # files modified in last 30 min
find . -type f -size +50M        # files larger than 50 MB
find . -type d -name node_modules # find directories by name
find . -empty -type d            # find empty directories
find . -name "*.pyc" -delete     # find and delete matching files
locate nginx.conf                # fast lookup (uses index)
whereis python                   # find binary/source/manual path
```

## Search inside files

```bash
grep "TODO" file.py              # search for pattern in file
grep -R "TODO" .                 # recursive search in directory
grep -Rin "error" logs/          # recursive + case-insensitive + line numbers
grep -v "DEBUG" app.log          # invert: show lines NOT matching
grep -c "ERROR" app.log          # count matching lines
grep -o "[0-9]\+" file.txt       # show only matched part
grep -A 3 -B 1 "Exception" log  # show 1 line before, 3 after match
```

For codebases, `rg` (ripgrep) is faster:

```bash
rg "class User"                  # search for pattern
rg -n "Exception" src/           # with line numbers
rg "TODO|FIXME" -g "*.py"       # filter files by glob
rg -l "deprecated" src/          # list matching file names only
rg -c "import" src/              # count matches per file
```

## Pipes and redirects

```bash
cmd1 | cmd2                      # pipe: stdout of cmd1 → stdin of cmd2
cmd > out.txt                    # redirect stdout to file (overwrite)
cmd >> out.txt                   # redirect stdout to file (append)
cmd 2> err.txt                   # redirect stderr to file
cmd > all.txt 2>&1               # redirect stdout + stderr to file
cmd > /dev/null 2>&1             # discard all output
cmd | tee output.log             # print to screen + save to file
```

## Command chaining

```bash
cmd1 ; cmd2                      # run cmd2 after cmd1 (always)
cmd1 && cmd2                     # run cmd2 only if cmd1 succeeds
cmd1 || cmd2                     # run cmd2 only if cmd1 fails
```

## Text processing basics

```bash
sed 's/http:/https:/g' urls.txt  # replace text (print to stdout)
sed -i 's/old/new/g' config.yaml # replace text in-place
awk '{print $1}' file.txt        # print first column (space-delimited)
awk -F',' '{print $2}' data.csv  # print second column (comma-delimited)
cut -d',' -f1,3 data.csv         # extract fields 1 and 3 by comma
tr '[:upper:]' '[:lower:]' < f   # convert to lowercase
```

## Sort, deduplicate, count

```bash
sort names.txt                   # sort lines alphabetically
sort -n numbers.txt              # sort numerically
sort names.txt | uniq            # remove duplicates (sorted input)
sort names.txt | uniq -c | sort -nr  # count + rank
wc -l file.txt                   # count lines
wc -l *.py                       # count lines per file
```
