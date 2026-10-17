"""Offline notebook checks: python -B tests/test_exploration.py."""
import copy
import json
import os
from pathlib import Path
import sys
import tempfile

import nbformat
from nbclient import NotebookClient
from jupyter_client import KernelManager

ROOT = Path(__file__).resolve().parents[1]
NOTEBOOK = ROOT / "data/exploration.ipynb"
SCRATCH = ROOT / ".scratchpad"
SCRATCH.mkdir(exist_ok=True)
notebook = nbformat.read(NOTEBOOK, as_version=4)
nbformat.validate(notebook)
for cell in notebook.cells:
    if cell.cell_type == "code":
        compile(cell.source, cell.id, "exec")

with tempfile.TemporaryDirectory(prefix="eda-check-", dir=SCRATCH) as directory:
    folder = Path(directory).resolve()
    assert folder.parent == SCRATCH.resolve()  # Bound automatic temporary cleanup.
    os.environ.update(MPLBACKEND="Agg", MPLCONFIGDIR=str(folder / "matplotlib"))
    namespace = {}
    setup = next(c.source for c in notebook.cells if c.id == "settings")
    exec(setup, namespace)
    for cell in notebook.cells:
        if "helpers" in cell.metadata.get("tags", []):
            exec(cell.source, namespace)

    def fixture(name, text, encoding="utf-8"):
        path = folder / name
        path.write_text(text, encoding=encoding, newline="")
        return path

    def load(path, **settings):
        exec(setup, namespace)
        namespace.update(FORMAT=None, SOURCE=None, JSON_PATH=())
        namespace.update(settings)
        info = namespace["file_info"](path)
        return namespace["load_preview"](path, info)

    csv = fixture("stations.csv", "Note\nAGS;Ort;Stra\u00dfe;Wert\n"
                  '01059075;Schleswig;"Stra\u00dfe; mit\nUmbruch";1,5\n'
                  "01059000;Schleswig-Flensburg;NA;2,0\n"
                  "01000000;Schleswig-Holstein;;3,0\n", "utf-8-sig")
    df, _ = load(csv, SEPARATOR=";", SKIP_ROWS=1, LIMIT=2)
    assert df.shape == (2, 4) and df.loc[0, "AGS"] == "01059075"
    assert df.loc[0, "Stra\u00dfe"] == "Stra\u00dfe; mit\nUmbruch"
    assert df.loc[1, "Stra\u00dfe"] == "NA"
    txt = fixture("addresses.txt", "01059075;M\u00fchle\n01059026;Stra\u00dfe\n", "latin1")
    df, _ = load(txt, ENCODING="latin1", SEPARATOR=";")
    assert df.shape == (2, 2) and df.iloc[0, 0] == "01059075"
    document = {"data": {"regions": [{"AGS": "01059075", "nested": [1, 2]}]}}
    js = fixture("projection.JSO", json.dumps(document))
    df, raw = load(js, JSON_PATH=None)
    assert df is None and raw == document
    df, raw = load(js, JSON_PATH=("data", "regions"))
    assert df.loc[0, "nested"] == [1, 2] and raw == document
    try:
        load(js, JSON_MAX_BYTES=1)
        raise AssertionError("JSON size guard did not run")
    except ValueError:
        pass
    parquet = folder / "prepared.parquet"
    namespace["pd"].DataFrame({"AGS": ["01059075"] * 5, "Wert": range(5)}).to_parquet(parquet)
    df, _ = load(parquet, LIMIT=2, COLUMNS=["AGS"])
    assert df.shape == (2, 1)
    assert namespace["file_info"](parquet)["records"] == 5

    # Execute the actual notebook, including filters and plotting, in real kernels.
    for source in (None, csv):
        run = copy.deepcopy(notebook)
        for cell in run.cells:
            if cell.id == "settings":
                cell.source += f"\nROOT_OVERRIDE = {str(ROOT)!r}\nSOURCE = None\nFORMAT = None\n"
                if source:
                    cell.source += f"SOURCE = {str(source)!r}\nSEPARATOR = ';'\nSKIP_ROWS = 1\n"
            elif source and cell.id == "statistics":
                cell.source = cell.source.replace("NUMBER = None", "NUMBER = 'Wert'")
            elif source and cell.id == "city":
                cell.source = cell.source.replace("CITY_FILTER = {}", "CITY_FILTER = {'AGS': '01059075'}")
        if source:
            run.cells.append(nbformat.v4.new_code_cell("assert len(df) == 3\nassert len(city) == 1"))
        manager = KernelManager(kernel_name="python3")
        manager.kernel_spec.argv = [sys.executable, "-m", "ipykernel_launcher", "-f", "{connection_file}"]
        manager.connection_file = str(folder / "kernel.json")
        try:
            NotebookClient(run, timeout=60, km=manager,
                           resources={"metadata": {"path": str(folder)}}).execute()
        finally:
            if manager.has_kernel:
                manager.shutdown_kernel(now=True)
                manager.cleanup_resources()
print("Notebook schema, synthetic CSV/TXT/JSON/Parquet checks and two kernel runs passed.")
