import os
import pandas as pd
import importlib
import traceback

# List of models to test
CANDIDATE_MODELS = {
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

def normalize_metrics(metrics):
    """
    Standardizes metric keys to 'silhouette', 'calinski', 'davies'.
    PRESERVES any other keys (like 'k', 'n_clusters') found in the input.
    """
    if not metrics: return {}
    
    # 1. Start with a COPY of the original metrics to keep 'n_clusters', 'k', etc.
    standardized = metrics.copy()
    
    # Mapping of Standard Key -> Possible Aliases
    key_map = {
        'silhouette': ['silhouette', 'silhouette_score', 'sil'],
        'calinski': ['calinski', 'calinski_harabasz', 'calinski_harabasz_score', 'ch', 'chi'],
        'davies': ['davies', 'davies_bouldin', 'davies_bouldin_score', 'db', 'dbi']
    }

    # 2. Add the standardized keys if they are missing but aliases exist
    for std_key, aliases in key_map.items():
        # If the standard key is already there, skip
        if std_key in standardized:
            continue

        # Look for aliases in the original keys
        for alias in aliases:
            for m_key in metrics.keys():
                if m_key.lower() == alias:
                    standardized[std_key] = metrics[m_key]
                    break 
            if std_key in standardized: break
            
    return standardized

def train_candidate(name, script_name, X_train, y_train, X_test, y_test, train_path, test_path, target_col, output_dir):
    try:
        module = importlib.import_module(f"models.{script_name}")
        model_path = os.path.join(output_dir, f"candidate_{name}.pkl")
        
        metrics = module.train(
            X_train, y_train, 
            X_test, y_test, 
            train_path, test_path, 
            target_col,
            model_path
        )
        return {
            "model": name, 
            "label": name.replace("_", " ").title(),
            "metrics": metrics,
            "path": model_path,
            "internal_name": name
        }
    except Exception as e:
        # Print error but don't crash the whole search
        print(f"   [ERROR] Training {name} failed: {e}")
        return None

def run(X_train, y_train, X_test, y_test, train_path, test_path, target_col, output_dir):
    print("\n [AUTO-ML] Starting search for Best Clustering Algorithm...", flush=True)
    candidates = []

    for name, script_name in CANDIDATE_MODELS.items():
        print(f"   ...Testing {name}", flush=True)
        
        res = train_candidate(name, script_name, X_train, y_train, X_test, y_test, train_path, test_path, target_col, output_dir)
        
        if res:
            raw_metrics = res['metrics']
            # Normalize (and preserve extra keys now)
            std_metrics = normalize_metrics(raw_metrics)
            
            # --- CRITICAL FIX: Inject Algorithm Name into Metrics for Frontend ---
            std_metrics['algorithm'] = res['label']
            
            # Check if we have the Big 3
            if all(k in std_metrics for k in ['silhouette', 'calinski', 'davies']):
                res['metrics'] = std_metrics # Replace with clean keys
                candidates.append(res)
            else:
                # LOGGING: Show exactly what was missing
                print(f"   [SKIP] {name} missing standard metrics. Received: {list(raw_metrics.keys())}", flush=True)

    if not candidates:
        raise Exception("All candidate models failed to train or returned invalid metrics.")

    # --- Ranking Logic ---
    data = []
    for i, c in enumerate(candidates):
        data.append({
            'index': i,
            'sil': float(c['metrics']['silhouette']),
            'ch': float(c['metrics']['calinski']),
            'db': float(c['metrics']['davies'])
        })
    
    df_rank = pd.DataFrame(data)
    
    # 1 is Best Rank
    df_rank['r_sil'] = df_rank['sil'].rank(ascending=False) # High = Good
    df_rank['r_ch']  = df_rank['ch'].rank(ascending=False)  # High = Good
    df_rank['r_db']  = df_rank['db'].rank(ascending=True)   # Low = Good

    # Weighted Score (Lower sum is better)
    df_rank['final_score'] = (df_rank['r_sil'] * 0.5) + (df_rank['r_ch'] * 0.25) + (df_rank['r_db'] * 0.25)

    # Sort and pick winner
    best_row = df_rank.sort_values(by='final_score').iloc[0]
    winner = candidates[int(best_row['index'])]
    
    # Update label to indicate it's the winner
    winner['model'] = f"Best: {winner['label']}"
    
    # --- LOG FOR NODE.JS TO CATCH ---
    print(f"\n\033[92m====== BEST MODEL FOUND: {winner['label']} (Score: {best_row['final_score']:.2f}) ======\033[0m\n", flush=True)
    
    return winner