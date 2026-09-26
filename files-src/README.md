# Файли для сторінки Files

Джерела файлів, які можна завантажити на сторінці /files/.
Лежать поза docs/, бо Zensical перетворює кожен .md у docs/ на сторінку сайту.

Скіли пакуються zip-архівами (папка скіла з SKILL.md всередині) у docs/downloads/skills/:

    python3 scripts/build_files.py

Потім додайте рядок з файлом у docs/files/skills.md і назву — на огляд docs/files/index.md.
