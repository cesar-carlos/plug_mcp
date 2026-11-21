"""Independent verification of Brazilian formatting in synthetic PDFs only."""
from pathlib import Path
import subprocess
from pypdf import PdfReader

root = Path("node_modules/.cache/pdf-br-samples")
cases = {
    "tabela-br": ["000123", "20/11/2026", "1.234,50", "R$ 98.765,13", "R$ -1,01",
                  "9.007.199.254.740.993,13", "Não informado", "Sim", "Não", "12:34:56 UTC"],
    "grafico-br": ["18/11/2026", "R$ 1.234,50", "R$ 2.000,01", "Não informado", "Unidade: R$"],
}
for name, expected_values in cases.items():
    reader = PdfReader(root / f"{name}.pdf")
    assert len(reader.pages) == (1 if name == "tabela-br" else 2)
    assert not reader.trailer["/Root"].get("/OpenAction")
    text = "\n".join(page.extract_text() for page in reader.pages)
    for expected in expected_values:
        assert expected in text, expected
    subprocess.run(["pdftoppm", "-r", "90", "-png", str(root / f"{name}.pdf"),
                    str(root / name)], check=True, capture_output=True)
print("2 PDFs / 3 pages: Brazilian display, identifiers, dates and nulls verified")
