"""Independent local F0 validation. Synthetic artifacts only; no business connection."""
import json
import re
import shutil
import subprocess
import argparse
from pathlib import Path

import pdfplumber
from PIL import Image, ImageDraw
from pypdf import PdfReader

arguments = argparse.ArgumentParser()
arguments.add_argument("--renderer", action="store_true", help="Verify the production renderer synthetic fixture")
arguments.add_argument("--directory", type=Path, help="Separate synthetic evidence directory for a new snapshot")
options = arguments.parse_args()
root = (options.directory or Path("node_modules/.cache/pdf-renderer-evidence" if options.renderer else "node_modules/.cache/pdf-report-f0")).resolve()
renderer = shutil.which("pdftoppm")
if not renderer:
    raise RuntimeError("Poppler pdftoppm is required; signature checks are insufficient")
reports = []
thumbnails = []
for path in sorted(root.glob("rows-*.pdf")):
    metrics = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
    reader = PdfReader(path)
    assert len(reader.pages) == metrics["pages"]
    assert not reader.trailer["/Root"].get("/OpenAction")
    ids = []
    long_descriptions = 0
    with pdfplumber.open(path) as document:
        for index, page in enumerate(document.pages):
            text = page.extract_text() or ""
            assert ("Relatório de consulta" if options.renderer else "Relatório sintético") in text
            assert f"Página {index + 1}/{len(document.pages)}" in text
            page_ids = re.findall(r"ID\d{6}", text)
            long_descriptions += text.count("Segunda linha preservada.")
            ids.extend(page_ids)
            if metrics["count"]:
                assert page_ids, "Unexpected empty data page"
                assert "Código" in text and "Valor (BRL)" in text
                for row_id in page_ids:
                    number = int(row_id[2:])
                    cents = number * 12345
                    expected = "Não informado" if (number - 1) % 11 == 0 else (
                        "R$ " + f"{cents // 100:,}".replace(",", ".") + f",{cents % 100:02}"
                        if options.renderer else f"{cents // 100},{cents % 100:02}")
                    line = next(line for line in text.splitlines() if row_id in line)
                    assert expected in line, f"Missing exact value for {row_id}"
            else:
                assert "Nenhum registro" in text
            for character in page.chars:
                assert 30 <= character["x0"] < character["x1"] <= page.width - 29
                assert 25 <= character["top"] < character["bottom"] <= page.height - 29
    assert ids == [f"ID{i:06}" for i in range(1, metrics["count"] + 1)], "Lost/repeated/reordered rows"
    assert long_descriptions == (metrics["count"] + 16) // 17, "Clipped multiline description"
    images = root / (path.stem + "-pages")
    images.mkdir(exist_ok=True)
    rendered = subprocess.run([renderer, "-r", "40", "-png", str(path), str(images / "page")], check=True,
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    pngs = sorted(images.glob("page-*.png"))
    assert len(pngs) == metrics["pages"]
    for png in pngs:
        with Image.open(png) as image:
            image.load()
            assert image.convert("L").getextrema()[0] < 100
            thumb = image.convert("RGB")
            thumb.thumbnail((160, 210))
            thumbnails.append((f"{path.stem} / {png.stem}", thumb.copy()))
    reports.append({"case": path.stem, "pages": len(pngs), "rows": len(ids), "exactValues": True,
                    "boundedText": True, "renderedAllPages": True, "noOpenAction": True,
                    "rendererWarnings": rendered.stderr.decode("utf-8", errors="replace").splitlines()})
for offset in range(0, len(thumbnails), 48):
    batch = thumbnails[offset:offset+48]
    sheet = Image.new("RGB", (6 * 180, ((len(batch) + 5) // 6) * 235), "#dce3e0")
    draw = ImageDraw.Draw(sheet)
    for index, (label, thumb) in enumerate(batch):
        x, y = (index % 6) * 180, (index // 6) * 235
        sheet.paste(thumb, (x + 10, y + 15))
        draw.text((x + 4, y + 220), label.replace("portrait", "P").replace("landscape", "L"), fill="black")
    sheet.save(root / f"contact-{offset // 48 + 1}.png")
(root / "validation.json").write_text(json.dumps(reports, indent=2), encoding="utf-8")
print(json.dumps({"cases": len(reports), "pagesRendered": len(thumbnails), "validation": "passed"}))
