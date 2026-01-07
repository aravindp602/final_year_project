const express = require("express");
const cors = require("cors");
const path = require("path");
const { spawn } = require("child_process");
const dotenv = require("dotenv");

dotenv.config();

const { upload, uploadDir } = require("./middleware/upload");
const resourceRoutes = require("./routes/resources");

// Import Normal Processing
const { router: normalProcessRoutes, processBranch } = require("./routes/normalProcess");

// --- KEY FIX: DESTRUCTURE IMPORT HERE ---
const { router: domainProcessRoutes } = require("./routes/domainProcess");

const app = express();
const PORT = 5001; 

const pythonExecutable = "/Users/aravindp/Downloads/PAPAD-AutoML-main/backend/venv/bin/python";

app.use(cors());
app.use(express.json());

app.use(resourceRoutes);
app.use(normalProcessRoutes);
app.use(domainProcessRoutes);

/* ---------------- Remaining Logic (Domain Detection & Plans) ---------------- */

app.post("/find-domain", upload.single("dataset"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  console.log("🚀 [Domain Detection] File received:", req.file.filename);
  console.log("⚠️ [DEV MODE] Returning hardcoded domain: Medical");

  setTimeout(() => {
    res.json({ domain: "Medical" });
  }, 1000);
});

// GENERATE MEDICAL PLAN (Uses Llama/Gemma via Python)
app.post("/generate-medical-plan", upload.single("dataset"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file for plan generation" });
    }
  
    console.log("🤖 [Medical Plan] Starting Gemma plan generation for:", req.file.filename);
    const filePath = path.join(uploadDir, req.file.filename);
  
    const pythonProcess = spawn(pythonExecutable, [
      "preprocessing/Domain_based_preprocessing/medical_plan_generator.py",
      filePath,
    ], {
      env: {
        ...process.env, 
        HF_TOKEN: process.env.HF_TOKEN 
      }
    });
  
    let fullOutput = "";
    let errorOutput = "";
  
    pythonProcess.stdout.on("data", (data) => {
      fullOutput += data.toString();
    });
  
    pythonProcess.stderr.on("data", (data) => {
      console.error(`[Gemma Log]: ${data.toString().trim()}`);
      errorOutput += data.toString();
    });
  
    pythonProcess.on("close", (code) => {
      if (code === 0) {
        try {
          const planMatch = fullOutput.match(/__PLAN_START__([\s\S]*?)__PLAN_END__/);
          const explanationMatch = fullOutput.match(/__EXPLANATION_START__([\s\S]*?)__EXPLANATION_END__/);
          
          if (!planMatch || !explanationMatch) {
            throw new Error("Could not find delimiters in Python script output.");
          }

          const plan = JSON.parse(planMatch[1]);
          const explanation = explanationMatch[1].trim();

          console.log("✅ [Medical Plan] Successfully generated and parsed plan.");
          res.json({ plan, explanation });
        } catch (e) {
          console.error("❌ [Medical Plan] Error parsing Python output:", e);
          res.status(500).json({ message: "Failed to parse the generated plan." });
        }
      } else {
        console.error(`❌ [Medical Plan] Python script failed with code ${code}.`);
        res.status(500).json({ message: "Plan generation script failed.", details: errorOutput });
      }
    });
});

/* ---------------- Run Configuration ---------------- */

app.post("/run-config", upload.single("dataset"), async (req, res) => {
  try {
    if (!req.file) {
        return res.status(400).json({ message: "Dataset file is required" });
    }

    let chainsRaw = req.body.chains;
    if (typeof chainsRaw === "string") {
        chainsRaw = JSON.parse(chainsRaw);
    }

    console.log("🚀 [RunConfig] Received Branches:", Object.keys(chainsRaw));

    // Prepare Promises
    const branchPromises = Object.entries(chainsRaw).map(async ([branchName, nodes]) => {
        console.log(`\n🌿 [Branch: ${branchName}] Processing ${nodes.length} nodes...`);

        const pList = [];
        const mList = [];
        const oList = [];

        nodes.forEach((step) => {
            const baseId = step.baseId || "";
            if (baseId.startsWith('n') || baseId.startsWith('p')) pList.push(baseId);
            else if (baseId.startsWith('m')) mList.push(baseId);
            else if (baseId.startsWith('o')) oList.push(baseId);
        });

        try {
            const result = await processBranch(branchName, req.file.path, pList, mList, oList);
            return { branchName, status: 'success', data: result };
        } catch (error) {
            console.error(`❌ [${branchName} FAILED] ${error.message}`);
            return { branchName, status: 'error', error: error.message };
        }
    });

    const resultsArray = await Promise.all(branchPromises);

    const finalResults = {};

    resultsArray.forEach(item => {
        if (item.status === 'success') {
            finalResults[item.branchName] = item.data;
        } else {
            finalResults[item.branchName] = {
                status: 'failed',
                error: item.error,
                trainingResults: [], 
                outputs: {}
            };
        }
    });

    res.json({
        message: "Multi-Branch Pipeline Completed",
        outputs: finalResults, 
        trainingResults: [], 
        graph: {} 
    });

  } catch (err) {
    console.error("❌ [RunConfig] Critical Error:", err);
    if (!res.headersSent) {
        res.status(500).json({ message: "Error processing configuration", details: err.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});