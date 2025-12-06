import sys
import os
import json
import importlib
import pandas as pd
import chardet
import csv
import shutil

# ------------------------------
# Add project root to sys.path
# ------------------------------
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)
# ------------------------------

# FORCE UTF-8 OUTPUT (Prevents other encoding errors on Windows)
sys.stdout.reconfigure(encoding='utf-8')

dataset_path = sys.argv[1]
modules_json = sys.argv[2]
output_path = sys.argv[3]
log_dir = sys.argv[4] if len(sys.argv) > 4 else None

# Load mapping file
json_path = os.path.join(os.path.dirname(__file__), "normal_preprocessing_modules.json")

with open(json_path, "r", encoding="utf-8") as f:
    module_map = json.load(f)

id_to_label = {m["id"]: m["name"] for m in module_map}

modules = json.loads(modules_json)

# --- CLEAN AND CREATE LOG DIRECTORY ---
if log_dir:
    if os.path.exists(log_dir):
        print(f"Cleaning existing log directory: {log_dir}")
        try:
            shutil.rmtree(log_dir)
        except Exception as e:
            print(f"Warning: Could not delete old logs at {log_dir}. Error: {e}")
    os.makedirs(log_dir, exist_ok=True)
    print(f"Logging intermediate steps to: {log_dir}")
# --------------------------------------

# Load dataset safely
def load_dataset(path):
    with open(path, "rb") as f:
        enc = chardet.detect(f.read())["encoding"]
    
    with open(path, "r", encoding=enc, errors="replace") as f:
        sample = f.read(2048)
        try:
            delim = csv.Sniffer().sniff(sample).delimiter
        except:
            delim = ","

    return pd.read_csv(
        path,
        encoding=enc,
        delimiter=delim,
        on_bad_lines="skip",
        engine="python"
    )

df = load_dataset(dataset_path)

def label_to_python_filename(label):
    return label.lower().replace(" ", "_").replace("-", "_")

# Process modules
for i, module in enumerate(modules, 1):
    module_id = module["id"]
    module_label = id_to_label.get(module_id)

    if not module_label:
        print(f"Warning: Module ID {module_id} not found in map.")
        continue

    python_file = label_to_python_filename(module_label)
    print(f"Running {module_label} (id={module_id})...")

    # Import and Run Module
    mod = importlib.import_module(
        f"preprocessing.Normal_preprocessing.components.{python_file}"
    )

    df = mod.apply(df)

    # --- LOGGING STEP ---
    if log_dir:
        clean_name = module_label.replace(" ", "_").lower()
        safe_name = f"{i}_{clean_name}.csv"
        log_path = os.path.join(log_dir, safe_name)
        df.to_csv(log_path, index=False)
        
        # FIX: Replaced special characters '└──' with safe '-->'
        print(f"   --> Saved log: {safe_name}")

df.to_csv(output_path, index=False)
print("Preprocessing done. Saved:", output_path)