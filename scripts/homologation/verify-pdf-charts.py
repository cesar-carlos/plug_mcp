"""Independent verification of synthetic chart PDFs; never reads operational data."""
import argparse
import json
from decimal import Decimal, ROUND_HALF_UP
import subprocess
from pathlib import Path
from pypdf import PdfReader
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
root = parser.parse_args().directory.resolve()
manifest = json.loads((root / "charts-manifest.json").read_text(encoding="utf-8"))
contacts = []
for case in manifest["charts"]:
    assert Path(case["filename"]).name == case["filename"]
    path = root / case["filename"]
    reader = PdfReader(path)
    assert len(reader.pages) == case["pages"] == 2
    assert not reader.trailer["/Root"].get("/OpenAction")
    assert "PARCIAL" in reader.pages[0].extract_text()
    assert "Unidade: R$" in reader.pages[0].extract_text()
    table = reader.pages[1].extract_text()
    for category, value in case["rows"]:
        assert category in table
        expected = "Não informado" if value is None else "R$ " + format(Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), ",.2f").translate(str.maketrans({",": ".", ".": ","}))
        assert expected in table
    assert reader.pages[0].images, "Chart image missing"
    for index, page in enumerate(reader.pages):
        assert f"Página {index + 1}/2" in page.extract_text()
        for font in page["/Resources"]["/Font"].values():
            obj = font.get_object()
            if obj.get("/Subtype") == "/Type0":
                descendant = obj["/DescendantFonts"][0].get_object()
                assert descendant["/FontDescriptor"].get_object().get("/FontFile2")
    prefix = root / path.stem
    subprocess.run(["pdftoppm", "-r", "100", "-png", str(path), str(prefix)], check=True, capture_output=True)
    for index in (1, 2):
        with Image.open(root / f"{path.stem}-{index}.png") as image:
            image.load()
            thumbnail = image.convert("RGB")
            thumbnail.thumbnail((530, 750))
            contacts.append((f"{case['kind']} / {index}", thumbnail.copy()))
sheet = Image.new("RGB", (3 * 550, 2 * 790), "#dce3e0")
draw = ImageDraw.Draw(sheet)
for index, (label, thumbnail) in enumerate(contacts):
    x, y = (index // 2) * 550, (index % 2) * 790
    sheet.paste(thumbnail, (x + 10, y + 20))
    draw.text((x + 10, y + 770), label, fill="black")
sheet.save(root / "chart-contact.png")
print(json.dumps({"charts": len(manifest["charts"]), "pages": len(contacts), "exactTableValues": True, "embeddedTextFonts": True}))
