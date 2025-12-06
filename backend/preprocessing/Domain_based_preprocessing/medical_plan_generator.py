import pandas as pd
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
import json
import re
import datetime
import os
import sys
import traceback
from typing import Dict, Any, Optional, Tuple

class MedicalPlanGenerator:
    """
    A specialized class that attempts to use the original google/gemma-1.1-7b-it
    model locally. This requires a very large amount of RAM.
    """
    ALLOWED_ACTIONS = {"drop", "scale", "one_hot_encode", "label_encode"}

    def __init__(self, model_id: str = "google/gemma-1.1-7b-it", target_col: str = "Level"):
        """Initializes the generator and attempts to load the full Gemma 7B model."""
        self.target_col = target_col
        
        print(f"🚀 Initializing Medical Model '{model_id}' for local execution...", file=sys.stderr)
        print("⚠️ This will require >15GB of available RAM and may be very slow or fail on this machine.", file=sys.stderr)
        
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(model_id)
            
            # This is the line that will require a large amount of memory.
            # Using bfloat16 for the best possible chance of it fitting.
            self.model = AutoModelForCausalLM.from_pretrained(
                model_id,
                torch_dtype=torch.bfloat16,
                device_map="auto" 
            )
            print("✅ Medical Model initialized successfully.", file=sys.stderr)
        except Exception as e:
            print(f"❌ Failed to load the local model. This is likely due to insufficient RAM.", file=sys.stderr)
            raise e

    def _call_gemma_local(self, prompt: str, max_new_tokens: int = 2048) -> str:
        """Helper function to call the local model."""
        messages = [{"role": "user", "content": prompt}]
        input_ids = self.tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, return_tensors="pt"
        ).to(self.model.device)
        
        try:
            with torch.no_grad():
                outputs = self.model.generate(input_ids, max_new_tokens=max_new_tokens, do_sample=False)
            response = outputs[0][input_ids.shape[-1]:]
            return self.tokenizer.decode(response, skip_special_tokens=True)
        except Exception as e:
            print(f"❌ Error during model generation: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return ""

    @staticmethod
    def _extract_json(text: str) -> Optional[str]:
        """Robustly extracts a JSON object from model output."""
        match = re.search(r'```json\s*(\{.*?\})\s*```|(\{.*?\})', text, re.DOTALL)
        if match:
            return match.group(1) or match.group(2)
        return None

    def generate_plan(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Generates a column-wise preprocessing plan using the local model."""
        print("\n--- Generating Preprocessing Plan (using Local Model) ---", file=sys.stderr)
        column_info = "\n".join([f"- '{col}' (dtype: {df[col].dtype}, unique_values: {df[col].nunique()})" for col in df.columns])

        prompt = f"""<start_of_turn>user
You are an expert clinical data scientist building a model to predict the target column '{self.target_col}'.
TASK: Create a preprocessing plan as a JSON object.
OUTPUT FORMAT: Return ONLY a single valid JSON object. The JSON must map each column name to an object with an "action" and a "reason".

RULES:
1. The "action" MUST be one of: {sorted(self.ALLOWED_ACTIONS)}.
2. Never drop the target column '{self.target_col}'. Choose "label_encode" for it.
3. Use "scale" for continuous numeric features.
4. Use "one_hot_encode" for nominal categorical features (no order).
5. Use "label_encode" for ordinal features (order matters).
6. Use "drop" for identifiers or irrelevant columns.
7. Every column listed below MUST appear as a key in the JSON.

DATASET COLUMNS:
{column_info}

Return ONLY the JSON object now:<end_of_turn>
<start_of_turn>model
"""
        response = self._call_gemma_local(prompt)
        if not response:
            print("❌ Error: Received no response from local model.", file=sys.stderr)
            return {}

        plan_str = self._extract_json(response)
        if not plan_str:
            print(f"❌ Error: No JSON object detected in local model response.\nRaw response:\n{response}", file=sys.stderr)
            return {}
        try:
            plan = json.loads(plan_str)
            print("--- Generated Plan (JSON) ---", file=sys.stderr)
            print(json.dumps(plan, indent=2), file=sys.stderr)
            return plan
        except json.JSONDecodeError as e:
            print(f"❌ Error decoding JSON: {e}\nExtracted string:\n{plan_str}", file=sys.stderr)
            return {}

    def explain_plan_and_guide(self, plan: Dict[str, Any]) -> str:
        """Generates a detailed explanation using the local model."""
        print("\n--- Generating Explanation and Guidance (using Local Model) ---", file=sys.stderr)
        if not plan: return "No plan was generated."
        plan_str = json.dumps(plan, indent=2)

        prompt = f"""<start_of_turn>user
You are a senior data science mentor. The goal is to preprocess a medical dataset to predict lung cancer severity (target column: '{self.target_col}').
You are given a JSON preprocessing plan. Write a clear, practical report with three sections.

============================================================
Section 1: Why Preprocessing Matters (High-Level Summary)
============================================================
- Explain why raw medical data is rarely ready for machine learning and how issues like different scales, categorical variables, and data leakage can hurt model performance.

============================================================
Section 2: Detailed Walkthrough of the Preprocessing Plan
============================================================
- Group the columns by their "action".
- For each group, explain what the action does and why it's a good choice, listing the columns with their reasons.
- Explicitly describe how the target column '{self.target_col}' is being handled.

============================================================
Section 3: How to Implement This Plan in Python (Step-by-Step)
============================================================
- Provide a high-level guide using Pandas and Scikit-learn, mentioning specific tools like `df.drop()`, `StandardScaler`, `OneHotEncoder`, and `ColumnTransformer`.
- Emphasize doing `train_test_split` BEFORE fitting any transformers.

Preprocessing Plan (JSON):
{plan_str}

Your complete report:<end_of_turn>
<start_of_turn>model
"""
        explanation = self._call_gemma_local(prompt, max_new_tokens=3072)
        print("--- Generated Report ---", file=sys.stderr)
        return explanation

    def validate_plan(self, df: pd.DataFrame, plan: Dict[str, Any]) -> Dict[str, Any]:
        """Validates the generated plan against the DataFrame and rules."""
        print("\n--- Validating Preprocessing Plan ---", file=sys.stderr)
        errors, warnings = [], []
        if not plan:
            errors.append("Plan is empty.")
            return {"is_valid": False, "errors": errors, "warnings": warnings}

        df_cols, plan_cols = set(df.columns), set(plan.keys())
        if df_cols - plan_cols: errors.append(f"Plan is missing columns: {sorted(df_cols - plan_cols)}")
        if plan_cols - df_cols: warnings.append(f"Plan has extra columns: {sorted(plan_cols - df_cols)}")

        for col, spec in plan.items():
            if not isinstance(spec, dict):
                errors.append(f"Entry for '{col}' is not an object.")
                continue
            action = spec.get("action")
            if action not in self.ALLOWED_ACTIONS:
                errors.append(f"Column '{col}' has invalid action '{action}'.")
        
        if self.target_col not in plan or plan.get(self.target_col, {}).get("action") == "drop":
            errors.append(f"Target column '{self.target_col}' must exist in the plan and not be dropped.")

        is_valid = not errors
        print("✅ Plan validation PASSED." if is_valid else "❌ Plan validation FAILED.", file=sys.stderr)
        if errors: print("\nErrors:\n" + "\n".join(f"  - {e}" for e in errors), file=sys.stderr)
        if warnings: print("\nWarnings:\n" + "\n".join(f"  - {w}" for w in warnings), file=sys.stderr)
        return {"is_valid": is_valid, "errors": errors, "warnings": warnings}

    def run(self, df: pd.DataFrame) -> Tuple[Dict[str, Any], str]:
        """Full pipeline: generate, validate, and explain the plan."""
        plan = self.generate_plan(df)
        validation = self.validate_plan(df, plan)
        if not validation["is_valid"]:
            explanation = "Plan validation failed. Issues:\n" + "\n".join(f"- {e}" for e in validation["errors"])
            return plan, explanation
        explanation = self.explain_plan_and_guide(plan)
        return plan, explanation

# ==============================================================================
# --- MAIN EXECUTION BLOCK ---
# ==============================================================================
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Error: No file path provided.", file=sys.stderr)
        sys.exit(1)
        
    FILE_PATH = sys.argv[1]
    TARGET_COLUMN = sys.argv[2] if len(sys.argv) > 2 else "Level"

    print(f"--- Loading data from: {FILE_PATH} ---", file=sys.stderr)
    try:
        raw_df = pd.read_csv(FILE_PATH)
        print("✅ File loaded successfully.\n", file=sys.stderr)
    except FileNotFoundError:
        print(f"Error: Could not find {FILE_PATH}.", file=sys.stderr)
        sys.exit(1)

    print("--- Initializing Medical Plan Generator ---", file=sys.stderr)
    try:
        plan_generator = MedicalPlanGenerator(target_col=TARGET_COLUMN)
        
        print("\n--- Starting Automated Report Generation ---", file=sys.stderr)
        generated_plan, generated_explanation = plan_generator.run(raw_df)

        # --- STRUCTURED OUTPUT FOR NODE.JS ---
        print("__PLAN_START__")
        print(json.dumps(generated_plan))
        print("__PLAN_END__")
        
        print("__EXPLANATION_START__")
        print(generated_explanation)
        print("__EXPLANATION_END__")
        # --- END OF STRUCTURED OUTPUT ---

        print("\n--- Process Complete ---", file=sys.stderr)
    except Exception as e:
        print(f"❌ An unexpected error occurred during the process: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)