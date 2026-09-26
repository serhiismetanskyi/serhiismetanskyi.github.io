"""Пакує скіли з files-src/skills/<name>/ у docs/downloads/skills/<name>.zip для сторінки /files/."""
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "files-src" / "skills"
TARGET = ROOT / "docs" / "downloads" / "skills"


def build() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for skill in sorted(p for p in SOURCE.iterdir() if (p / "SKILL.md").is_file()):
        archive = TARGET / f"{skill.name}.zip"
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
            for file in sorted(skill.rglob("*")):
                if file.is_file():
                    # у архіві — папка скіла, як її очікують агенти: bug-report/SKILL.md
                    zf.write(file, pathlib.Path(skill.name) / file.relative_to(skill))
        print(f"{archive.relative_to(ROOT)}  {archive.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    build()
