import pandas as pd
import json
import re
import sys
import traceback
import os
from typing import Dict, Any, Optional, Tuple

# Use the official, modern Hugging Face client, as you specified
from huggingface_hub import InferenceClient

class MedicalPlanGenerator:
    """
    A specialized class that uses the Hugging Face InferenceClient to generate
    a high-quality preprocessing plan and a detailed explanation using the specified Llama model.
    """
    ALLOWED_ACTIONS = {"drop", "scale", "one_hot_encode", "label_encode"}

    def __init__(
        self,
        hf_token: str,
        # Using the exact model string you requested
        model_id: str = "meta-llama/Llama-3.1-8B-Instruct:novita",
        target_col: str = "Level",
    ):
        """Initializes the InferenceClient."""
        if not hf_token:
            raise ValueError("Hugging Face token is required for the Inference API.")

        # This client is the modern, correct way to interact with the HF API
        self.client = InferenceClient(token=hf_token)
        self.model_id = model_id
        self.target_col = target_col

        print(
            f"🚀 Initializing Medical Plan Generator with InferenceClient for model '{model_id}'...",
            file=sys.stderr,
        )
        print("✅ Generator ready.", file=sys.stderr)


    def _call_api(self, messages: list, max_new_tokens: int) -> str:
        """Helper function to call the chat completions API."""
        try:
            # Use the client's chat.completions.create method
            response = self.client.chat.completions.create(
                model=self.model_id,
                messages=messages,
                max_tokens=max_new_tokens,
                temperature=0.1,
                stream=False,
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"❌ API Request Failed. Full Error Traceback:", file=sys.stderr)
            if hasattr(e, 'response') and e.response is not None:
                 print(f"Response Status: {e.response.status_code}", file=sys.stderr)
                 print(f"Response Body: {e.response.text}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return ""

    @staticmethod
    def _extract_json(text: str) -> Optional[str]:
        """Robustly extracts a full JSON object from model output using brace matching."""
        if not text:
            return None

        fenced = re.search(r"```json\s*(.*)```", text, re.DOTALL | re.IGNORECASE)
        if fenced:
            candidate = fenced.group(1).strip()
        else:
            start = text.find("{")
            if start == -1:
                return None
            candidate = text[start:]

        depth = 0
        in_string = False
        escape = False
        start_idx = None

        for i, ch in enumerate(candidate):
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                if depth == 0:
                    start_idx = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and start_idx is not None:
                    return candidate[start_idx : i + 1].strip()
        return None

    def generate_plan(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Generates a column-wise preprocessing plan using the API."""
        print("\n--- Generating Preprocessing Plan (via API) ---", file=sys.stderr)
        
        column_info = "\n".join([f"- `{col}` (dtype: {df[col].dtype}, unique values: {df[col].nunique()})" for col in df.columns])

        system_prompt = (
            "You are a data science expert. Your only function is to create a preprocessing plan. "
            "You must output a single, valid JSON object and nothing else. Do not add any conversational text or markdown."
        )

        user_prompt = f"""
Create a preprocessing plan for a medical dataset to predict the target column '{self.target_col}'.

**Instructions:**
1.  **Output Format:** Your entire response MUST be a single, raw JSON object.
2.  **JSON Keys:** The JSON object's top-level keys MUST be the exact column names from the list.
3.  **JSON Values:** Each column's value MUST be an object with `"action"` and `"reason"`.
4.  **Allowed Actions:** The `"action"` value MUST be one of: {sorted(self.ALLOWED_ACTIONS)}.
5.  **Target Column Rule:** The action for the target column, `{self.target_col}`, **MUST** be `"label_encode"`.
6.  **Logic:** Use `"drop"` for identifiers, `"scale"` for numbers, and `"one_hot_encode"` or `"label_encode"` for categories based on uniqueness.

**Dataset Columns to Process:**
{column_info}

**Your JSON Output:**
"""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        response = self._call_api(messages, max_new_tokens=4096)
        
        if not response:
            print("❌ Error: Received no response from API.", file=sys.stderr)
            return {}

        plan_str = self._extract_json(response)
        if not plan_str:
            print(f"❌ Error: No JSON object detected in API response.\nRaw response:\n{response}", file=sys.stderr)
            return {}

        try:
            plan = json.loads(plan_str)
            print("--- Generated Plan (JSON) ---", file=sys.stderr)
            print(json.dumps(plan, indent=2), file=sys.stderr)
            return plan
        except json.JSONDecodeError as e:
            print(f"❌ Error decoding JSON: {e}", file=sys.stderr)
            print("---- Extracted JSON candidate ----", file=sys.stderr)
            print(plan_str, file=sys.stderr)
            return {}

    def explain_plan_and_guide(self, plan: Dict[str, Any]) -> str:
        """Generates a detailed explanation using the API."""
        print("\n--- Generating Explanation and Guidance (via API) ---", file=sys.stderr)
        if not plan:
            return "No plan was generated to explain."
        plan_str = json.dumps(plan, indent=2)

        messages = [
            {
                "role": "system",
                "content": "You are a senior data science mentor. Your task is to write a clear, practical, and well-structured report.",
            },
            {
                "role": "user",
                "content": f"""
The goal is to preprocess a medical dataset to predict '{self.target_col}'. Here is the agreed JSON preprocessing plan:
{plan_str}

Write a detailed report with three sections as described below. Use markdown for formatting.

============================================================
Section 1: Why Preprocessing Matters
============================================================
- Explain why raw medical data is rarely ready for machine learning and how issues like different scales and categorical variables can hurt model performance.

============================================================
Section 2: Detailed Walkthrough of the Preprocessing Plan
============================================================
- Group the columns by their "action" from the plan (e.g., create a subheading for "Scaling", "Dropping", etc.).
- For each group, explain what the action does and why it's a good choice for the columns listed under it.
- Explicitly describe how the target column '{self.target_col}' is being handled.

============================================================
Section 3: How to Implement This Plan in Python
============================================================
- Provide a high-level guide using Pandas and Scikit-learn.
- Mention specific tools like `df.drop()`, `StandardScaler`, and `OneHotEncoder`.
- Emphasize the importance of doing a `train_test_split` before fitting any transformers to prevent data leakage.

Your complete report:
""",
            },
        ]

        explanation = self._call_api(messages, max_new_tokens=3072)
        print("--- Generated Report ---", file=sys.stderr)
        return explanation

    def run(self, df: pd.DataFrame) -> Tuple[Dict[str, Any], str]:
        """Full pipeline: generate the plan, then generate the explanation."""
        plan = self.generate_plan(df)
        if not plan:
            return {}, "Failed to generate a valid plan."
        explanation = self.explain_plan_and_guide(plan)
        return plan, explanation


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Error: No file path provided.", file=sys.stderr)
        sys.exit(1)

    # --- THE DEFINITIVE FIX IS HERE ---
    # Correctly access the command-line arguments by their index.
    FILE_PATH = sys.argv[1]
    TARGET_COLUMN = sys.argv[2] if len(sys.argv) > 2 else "Level"

    print(f"--- Loading data from: {FILE_PATH} ---", file=sys.stderr)
    try:
        raw_df = pd.read_csv(FILE_PATH)
        print("✅ File loaded successfully.\n", file=sys.stderr)
    except Exception as e:
        print(f"❌ Error loading CSV: {e}", file=sys.stderr)
        sys.exit(1)

    print("--- Initializing Medical Plan Generator ---", file=sys.stderr)
    try:
        HF_TOKEN = os.getenv("HF_TOKEN")
        if not HF_TOKEN:
            raise ValueError(
                "Hugging Face token not found in environment variable HF_TOKEN."
            )

        plan_generator = MedicalPlanGenerator(
            hf_token=HF_TOKEN, target_col=TARGET_COLUMN
        )
        generated_plan, generated_explanation = plan_generator.run(raw_df)

        print("__PLAN_START__")
        print(json.dumps(generated_plan))
        print("__PLAN_END__")
        print("__EXPLANATION_START__")
        print(generated_explanation)
        print("__EXPLANATION_END__")

        print("\n--- Process Complete ---", file=sys.stderr)
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)