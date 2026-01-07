const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { upload } = require("../middleware/upload");

const rootDir = path.join(__dirname, "..");
// Update this path if you move the project
const pythonExecutable = "/Users/aravindp/Downloads/PAPAD-AutoML-main/backend/venv/bin/python";

// --- Helper Functions ---

const loadJsonSafe = (filePath) => {
  try {
    const fullPath = path.join(rootDir, filePath);
    const raw = fs.readFileSync(fullPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
};

const runPythonScript = (scriptPath, args) => {
  return new Promise((resolve, reject) => {
    // ✅ Use specific venv python
    const python = spawn(pythonExecutable, ["-u", scriptPath, ...args]);
    let output = "";
    let errorOutput = "";
    
    let isPrintingJson = false;

    python.stdout.on("data", (data) => { 
        const str = data.toString();
        output += str;
        
        // --- SMART LOGGING (Identical to normalProcess.js) ---
        if (str.includes("__JSON_START__")) {
            isPrintingJson = true;
            const preJson = str.split("__JSON_START__")[0];
            if (preJson.trim()) process.stdout.write(preJson);
        } 
        else if (str.includes("__JSON_END__")) {
            isPrintingJson = false;
            const postJson = str.split("__JSON_END__")[1];
            if (postJson && postJson.trim()) process.stdout.write(postJson);
        } 
        else if (!isPrintingJson) {
            // Check for Winner Line to highlight
            if (str.includes("====== BEST MODEL FOUND:")) {
                const lines = str.split('\n');
                const winnerLine = lines.find(l => l.includes("====== BEST MODEL FOUND:"));
                if (winnerLine) {
                    console.log("\x1b[32m%s\x1b[0m", winnerLine); // Green Text
                }
            } else {
                process.stdout.write(str);
            }
        }
    });

    python.stderr.on("data", (data) => { errorOutput += data.toString(); });

    python.on("close", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        const shortError = errorOutput.split('\n').filter(l => l.trim() !== '').slice(-3).join('\n');
        console.error(`[Py-Err] ${scriptPath} exited with code ${code}. Details:\n${shortError}`);
        reject(new Error(errorOutput || `Script exited with code ${code}`));
      }
    });
  });
};

// --- ROUTES ---

router.post("/execute-approved-plan", upload.single("dataset"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Dataset file missing" });
    if (!req.body.plan) return res.status(400).json({ error: "Medical Plan missing" });
  
    const plan = JSON.parse(req.body.plan);
    const datasetPath = req.file.path;
    const branchName = "main_branch";
    
    // Setup Logging Paths
    const logDirName = `${branchName}_logging`;
    const logDirPath = path.join(rootDir, "preprocessing", "Domain_based_preprocessing", logDirName);
    const outputCsvName = `${branchName}_processed.csv`;
    const preprocessedPath = path.join(rootDir, outputCsvName);
    
    if (!fs.existsSync(logDirPath)) fs.mkdirSync(logDirPath, { recursive: true });
  
    console.log(`\n🏥 Executing Medical Plan on ${branchName}...`);
  
    try {
      // =========================================================================
      // STEP 1: PREPROCESSING (Domain Specific Logic)
      // =========================================================================
      await runPythonScript(
        "preprocessing/Domain_based_preprocessing/medical_plan_executor.py",
        [datasetPath, JSON.stringify(plan), preprocessedPath, logDirPath]
      );

      // =========================================================================
      // STEP 2: BUILD GRAPH VISUALIZATION
      // =========================================================================
      const actions = new Set();
      Object.values(plan).forEach(details => actions.add(details.action));
  
      const nodes = [];
      const edges = [];
      let xPos = 50;
      let lastNodeId = "dataset-node";
  
      nodes.push({
        id: "dataset-node",
        type: "datasetNode",
        position: { x: xPos, y: 100 },
        data: { label: "Dataset" },
      });
      xPos += 250;
  
      const actionMapping = [
          { key: 'drop', label: 'Drop Identifiers', id: 'dp_drop' },
          { key: 'one_hot_encode', label: 'One-Hot Encoding', id: 'dp_ohe' },
          { key: 'label_encode', label: 'Label Encoding', id: 'dp_le' },
          { key: 'scale', label: 'Standard Scaling', id: 'dp_scale' }
      ];
  
      actionMapping.forEach(step => {
          if (actions.has(step.key)) {
              const newNodeId = `${step.id}_${Date.now()}`;
              nodes.push({
                  id: newNodeId,
                  type: "preprocessingNode", 
                  position: { x: xPos, y: 100 },
                  data: { 
                      label: step.label, 
                      baseId: step.id, 
                      color: "#b730cfff" 
                  }
              });
              edges.push({
                  id: `e-${lastNodeId}-${newNodeId}`,
                  source: lastNodeId,
                  target: newNodeId,
                  animated: true
              });
              lastNodeId = newNodeId;
              xPos += 250;
          }
      });
  
      // ✅ UPDATED: Use 'm0' (AutoML) to trigger full search
      const defaultModelId = "m0"; 
      const defaultOutputId = "o1"; // Scatter Plot

      const mList = [defaultModelId];
      const oList = [defaultOutputId];

      // Add Model Node
      const modelNodeId = `m_${defaultModelId}_${Date.now()}`;
      nodes.push({ id: modelNodeId, type: "modelNode", position: { x: xPos, y: 100 }, data: { label: "AutoML Search", baseId: defaultModelId } });
      edges.push({ id: `e-${lastNodeId}-${modelNodeId}`, source: lastNodeId, target: modelNodeId, animated: true });
      lastNodeId = modelNodeId;
      xPos += 250;
  
      // Add Output Node
      const outNodeId = `o_${defaultOutputId}_${Date.now()}`;
      nodes.push({ id: outNodeId, type: "outputNode", position: { x: xPos, y: 85 }, data: { label: "Scatter Plot", baseId: defaultOutputId } });
      edges.push({ id: `e-${lastNodeId}-${outNodeId}`, source: lastNodeId, target: outNodeId, animated: true });

      // =========================================================================
      // STEP 3: MODEL TRAINING (Running Auto-ML Search)
      // =========================================================================
      let trainingResults = [];
      let trainedModelPath = null;
    
      if (mList.length > 0) {
        try {
          // Load definitions
          const allModels = loadJsonSafe("model_selectionAndTraining/model_names.json");
          const selectedModels = allModels.filter(m => mList.includes(m.id));
          
          if (selectedModels.length > 0) {
            const output = await runPythonScript(
              "model_selectionAndTraining/model_handler.py",
              [preprocessedPath, JSON.stringify(selectedModels)]
            );
    
            const jsonStart = output.indexOf("__JSON_START__");
            const jsonEnd = output.indexOf("__JSON_END__");
            
            if (jsonStart !== -1 && jsonEnd !== -1) {
                const jsonStr = output.substring(jsonStart + 14, jsonEnd);
                try {
                    trainingResults = JSON.parse(jsonStr);
                    if (trainingResults.length > 0) {
                        trainedModelPath = trainingResults[0].path;
                    }
                } catch (e) {
                    console.error("   ❌ JSON Parse Error:", e.message);
                }
            }
            console.log(`   ✅ Model Training Complete.`);
          }
        } catch (err) {
          throw new Error(`Model Training Failed: ${err.message}`);
        }
      }
  
      // =========================================================================
      // STEP 4: OUTPUT GENERATION
      // =========================================================================
      let visualizationData = {};
      if (oList.length > 0) {
          if (trainedModelPath) {
            try {
              const output = await runPythonScript(
                "output_section/output_handler.py",
                [preprocessedPath, trainedModelPath, JSON.stringify(oList)]
              );
    
              const jsonStart = output.indexOf("__JSON_START__");
              const jsonEnd = output.indexOf("__JSON_END__");
              if (jsonStart !== -1 && jsonEnd !== -1) {
                  const jsonStr = output.substring(jsonStart + 14, jsonEnd);
                  visualizationData = JSON.parse(jsonStr);
              }
              console.log(`   ✅ Output Generation Complete.`);
            } catch (err) {
               console.error(`[Output Error] ${err.message}`);
            }
          } else {
              console.log("   ⚠️ Output generation skipped (No trained model found)");
          }
      }
  
      res.json({
          message: "Medical Plan Executed Successfully",
          graph: { nodes, edges },
          outputs: visualizationData,
          trainingResults: trainingResults,
          isCustom: false
      });
  
    } catch (err) {
      console.error("❌ Medical Plan Execution Failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

module.exports = { router };