import sys
import os
import json
import pandas as pd
import importlib
import traceback
import shutil
from sklearn.model_selection import train_test_split

# Import the finder script
import find_best_model 

# ------------------------------
# SETUP PATHS & DIRECTORIES
# ------------------------------
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

# Define Output Directories
TRAINED_MODELS_DIR = os.path.join(current_dir, "trained_models")
CANDIDATE_MODELS_DIR = os.path.join(current_dir, "candidate_models")

os.makedirs(TRAINED_MODELS_DIR, exist_ok=True)
os.makedirs(CANDIDATE_MODELS_DIR, exist_ok=True)

dataset_path = sys.argv[1]
selected_models_json = sys.argv[2]
output_dir = current_dir 

# ------------------------------
# 1. LOAD & SPLIT DATA
# ------------------------------
try:
    df = pd.read_csv(dataset_path)
except Exception as e:
    print(f"[ERROR] Error loading dataset: {e}")
    sys.exit(1)

target_col = df.columns[-1]
feature_cols = df.columns[:-1]

X = df[feature_cols]
y = df[target_col]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

train_path = os.path.join(output_dir, "train_dataset.csv")
test_path = os.path.join(output_dir, "test_dataset.csv")

train_df = pd.concat([X_train, y_train], axis=1)
test_df = pd.concat([X_test, y_test], axis=1)

train_df.to_csv(train_path, index=False)
test_df.to_csv(test_path, index=False)

# ------------------------------
# 2. MODEL ROUTING
# ------------------------------
selected_models = json.loads(selected_models_json)
results = []

model_file_map = {
    "kmeans": "kmeans",
    "minibatch_kmeans": "minibatch_kmeans",
    "k_medoids": "k_medoids",
    "gmm": "gmm",
    "dbscan": "dbscan",
    "optics": "optics",
    "hierarchical": "hierarchical",
    "meanshift": "meanshift",
    "birch": "birch",
    "affinity_propagation": "affinity_propagation",
    "spectral": "spectral"
}

for model_info in selected_models:
    model_name = model_info.get("name")
    model_label = model_info.get("label")

    # === CASE A: AUTO-ML (Best Cluster Algo) ===
    if model_name == "best_cluster_algo":
        try:
            # 1. Run Search in Candidate Directory
            winner_result = find_best_model.run(
                X_train, y_train, 
                X_test, y_test, 
                train_path, test_path, 
                target_col, 
                CANDIDATE_MODELS_DIR 
            )
            
            if winner_result:
                # 2. Copy the Winner to the Final 'trained_models' Directory
                source_path = winner_result['path']
                final_model_name = f"best_{winner_result['internal_name']}_model.pkl"
                dest_path = os.path.join(TRAINED_MODELS_DIR, final_model_name)
                
                shutil.copy2(source_path, dest_path)
                
                # 3. Update Result to point to final path
                winner_result['path'] = dest_path
                results.append(winner_result)
                
        except Exception as e:
            print(f"[ERROR] Auto-ML Failed: {str(e)}")
            traceback.print_exc()

    # === CASE B: SPECIFIC MODEL ===
    else:
        if model_name not in model_file_map:
            print(f"[WARNING] No script for {model_name}")
            continue

        script_name = model_file_map[model_name]
        print(f"\n[TRAINING] Training {model_label}...")

        try:
            module = importlib.import_module(f"models.{script_name}")
            
            # Save directly to Trained Directory
            model_path = os.path.join(TRAINED_MODELS_DIR, f"{model_name}_model.pkl")
            
            metrics = module.train(
                X_train, y_train, 
                X_test, y_test, 
                train_path, test_path, 
                target_col,
                model_path
            )
            
            print(f"[SUCCESS] {model_label} finished.")
            
            results.append({
                "model": model_label,
                "metrics": metrics,
                "path": model_path
            })

        except Exception as e:
            print(f"[ERROR] Failed to train {model_label}: {str(e)}")
            traceback.print_exc()

# ------------------------------
# 3. RETURN JSON
# ------------------------------
print("\n__JSON_START__")
print(json.dumps(results))
print("__JSON_END__")