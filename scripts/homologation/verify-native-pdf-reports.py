"""Verify the exact synthetic seed from persona_chain_agent_test.dart, not ERP data."""
import argparse
import json
import re
import subprocess
from pathlib import Path
from pypdf import PdfReader
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
root = parser.parse_args().directory.resolve()
contacts = []
for engine in ("postgres", "mssql", "sybase"):
    for mode in ("table", "chart", "sections"):
        path = root / f"{engine}-{mode}.pdf"
        reader = PdfReader(path)
        assert len(reader.pages) == (1 if mode == "table" else 2)
        text = [page.extract_text() for page in reader.pages]
        # The native fixture inserts exactly id=1, amount=10.25. minimum=1 is empty.
        assert ("R$ 10,25" if mode == "chart" else "10.25") in text[1 if mode == "chart" else 0]
        if mode == "chart":
            assert reader.pages[0].images
        if mode == "sections":
            assert "Seção 1/2" in text[0] and "Seção 2/2" in text[1]
            assert all("leituras sucessivas; sem snapshot comum" in value for value in text)
            assert "Nenhum registro" in text[1] and "10.25" not in text[1]
            assert reader.pages[1].mediabox.width > reader.pages[1].mediabox.height
        sources = []
        for index, value in enumerate(text):
            assert f"Página {index + 1}/{len(text)}" in value
            assert "Leitura:" in value and "Fonte:" in value
            sources.extend(re.findall(r"Fonte: ([a-f0-9-]{36})", value))
        assert len(set(sources)) == 1
        assert not reader.trailer["/Root"].get("/OpenAction")
        subprocess.run(["pdftoppm", "-r", "90", "-png", str(path), str(root / path.stem)], check=True, capture_output=True)
        for index in range(1, len(text) + 1):
            with Image.open(root / f"{path.stem}-{index}.png") as image:
                image.load()
                thumb = image.convert("RGB")
                thumb.thumbnail((390, 550))
                contacts.append((f"{engine}/{mode}/{index}", thumb.copy()))
sheet = Image.new("RGB", (5 * 410, 3 * 590), "#dce3e0")
draw = ImageDraw.Draw(sheet)
for index, (label, thumb) in enumerate(contacts):
    x, y = index % 5 * 410, index // 5 * 590
    sheet.paste(thumb, (x + 10, y + 10))
    draw.text((x + 10, y + 565), label, fill="black")
sheet.save(root / "native-contact.png")
print(json.dumps({"files": 9, "pages": len(contacts), "nativeSeed": "exact", "emptySecondSection": "preserved"}))
