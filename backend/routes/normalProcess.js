const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { upload } = require("../middleware/upload");

const rootDir = path.join(__dirname, "..");
// Update this path if you move the project
const pythonExecutable = "/Users/aravindp/Downloads/PAPAD-AutoML-main/backend/venv/bin/python";

const loadJsonSafe = (filePath) => {
  try {
    const fullPath = path.join(rootDir, filePath);
    const raw = fs.readFileSync(fullPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
};

const generateGraphData = (pList, mList, oList) => {
  const nodes = [];
  const edges = [];
  let lastNodeId = "dataset-node";
  let xPos = 50; 
  
  nodes.push({
    id: "dataset-node",
    type: "datasetNode",
    position: { x: xPos, y: 100 },
    data: { label: "Dataset" },
  });
  xPos += 250;

  const allPreproc = loadJsonSafe("preprocessing/Normal_preprocessing/normal_preprocessing_modules.json");
  const allModels = loadJsonSafe("model_selectionAndTraining/model_names.json");
  const allOutputs = loadJsonSafe("output_section/output_options.json");

  pList.forEach((id) => {
    const module = allPreproc.find(m => m.id === id);
    if (!module) return;
    const newNodeId = `p_${id}_${Date.now()}`;
    nodes.push({ id: newNodeId, type: "preprocessingNode", position: { x: xPos, y: 100 }, data: { label: module.label, baseId: id } });
    edges.push({ id: `e-${lastNodeId}-${newNodeId}`, source: lastNodeId, target: newNodeId, animated: true });
    lastNodeId = newNodeId;
    xPos += 250;
  });

  mList.forEach((id) => {
    const module = allModels.find(m => m.id === id);
    if (!module) return;
    const newNodeId = `m_${id}_${Date.now()}`;
    nodes.push({ id: newNodeId, type: "modelNode", position: { x: xPos, y: 100 }, data: { label: module.label, baseId: id } });
    edges.push({ id: `e-${lastNodeId}-${newNodeId}`, source: lastNodeId, target: newNodeId, animated: true });
    lastNodeId = newNodeId;
    xPos += 250;
  });

  oList.forEach((id) => {
    const module = allOutputs.find(m => m.id === id);
    if (!module) return;
    const newNodeId = `o_${id}_${Date.now()}`;
    nodes.push({ id: newNodeId, type: "outputNode", position: { x: xPos, y: 85 }, data: { label: module.label, baseId: id } });
    edges.push({ id: `e-${lastNodeId}-${newNodeId}`, source: lastNodeId, target: newNodeId, animated: true });
    lastNodeId = newNodeId;
    xPos += 250;
  });

  return { nodes, edges };
};

const runPythonScript = (scriptPath, args) => {
  return new Promise((resolve, reject) => {
    const python = spawn(pythonExecutable, ["-u", scriptPath, ...args]);
    let output = "";
    let errorOutput = "";
    
    let isPrintingJson = false;

    python.stdout.on("data", (data) => { 
        const str = data.toString();
        output += str;
        
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
            if (str.includes("====== BEST MODEL FOUND:")) {
                const lines = str.split('\n');
                const winnerLine = lines.find(l => l.includes("====== BEST MODEL FOUND:"));
                if (winnerLine) {
                    console.log("\x1b[32m%s\x1b[0m", winnerLine);
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

const processBranch = async (branchName, datasetPath, pList, mList, oList) => {
  console.log(`\n🌿 Processing Branch: ${branchName}`);
  
  const logDirName = `${branchName}_logging`;
  const logDirPath = path.join(rootDir, "preprocessing", "Normal_preprocessing", logDirName);
  
  if (!fs.existsSync(logDirPath)) fs.mkdirSync(logDirPath, { recursive: true });

  const outputCsvName = `${branchName}_processed.csv`;
  const preprocessedPath = path.join(rootDir, outputCsvName);

  const allModules = loadJsonSafe("preprocessing/Normal_preprocessing/normal_preprocessing_modules.json");
  const modulesToUse = pList.map(id => allModules.find(m => m.id === id)).filter(Boolean);

  try {
    await runPythonScript(
      "preprocessing/Normal_preprocessing/normal_preprocessing_handler.py",
      [datasetPath, JSON.stringify(modulesToUse), preprocessedPath, logDirPath]
    );
    console.log(`   ✅ Preprocessing Complete.`);
  } catch (err) {
    throw new Error(`Preprocessing Failed: ${err.message.split('\n').pop()}`); 
  }

  let trainingResults = [];
  let trainedModelPath = null;

  if (mList.length > 0) {
    try {
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

  const graphData = generateGraphData(pList, mList, oList);

  return {
    outputs: visualizationData,
    trainingResults: trainingResults,
    graph: graphData
  };
};

// -------------------------------------------------------------
// EXISTING NORMAL PROCESSING ENDPOINT
// -------------------------------------------------------------
router.post("/preprocess-normal", upload.single("dataset"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Dataset file missing" });

  const isCustom = req.body.isCustom === "true";
  let customIds = req.body.ids ? JSON.parse(req.body.ids) : [];
  let modelIds = req.body.modelIds ? JSON.parse(req.body.modelIds) : [];
  let outputIds = req.body.outputIds ? JSON.parse(req.body.outputIds) : [];

  if (!isCustom) {
     modelIds = ['m0'];
     outputIds = ['o1'];
     const allModules = loadJsonSafe("preprocessing/Normal_preprocessing/normal_preprocessing_modules.json");
     if (customIds.length === 0) customIds = allModules.map(m => m.id);
  }

  try {
    const result = await processBranch("main_branch", req.file.path, customIds, modelIds, outputIds);
    res.json({ message: "Pipeline Completed Successfully", ...result });
  } catch (err) {
    res.status(500).json({ message: "Pipeline Processing Failed", error: err.message });
  }
});

// -------------------------------------------------------------
// NEW: EXECUTE APPROVED MEDICAL PLAN ENDPOINT
// -------------------------------------------------------------
router.post("/execute-approved-plan", upload.single("dataset"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Dataset file missing" });
    if (!req.body.plan) return res.status(400).json({ error: "Medical Plan missing" });
  
    const plan = JSON.parse(req.body.plan);
    const datasetPath = req.file.path;
    const branchName = "main_branch";
    
    // Setup Logging Paths (Domain Based)
    const logDirName = `${branchName}_logging`;
    const logDirPath = path.join(rootDir, "preprocessing", "Domain_based_preprocessing", logDirName);
    const outputCsvName = `${branchName}_processed.csv`;
    const preprocessedPath = path.join(rootDir, outputCsvName);
    
    if (!fs.existsSync(logDirPath)) fs.mkdirSync(logDirPath, { recursive: true });
  
    console.log(`\n🏥 Executing Medical Plan on ${branchName}...`);
  
    try {
      // 1. Run the Python Executor
      await runPythonScript(
        "preprocessing/Domain_based_preprocessing/medical_plan_executor.py",
        [datasetPath, JSON.stringify(plan), preprocessedPath, logDirPath]
      );
  
      // 2. Build Graph Nodes based on Action Types found in Plan
      // We want to visualize what just happened
      const actions = new Set();
      Object.values(plan).forEach(details => actions.add(details.action));
  
      const nodes = [];
      const edges = [];
      let xPos = 50;
      let lastNodeId = "dataset-node";
  
      // Dataset Node
      nodes.push({
        id: "dataset-node",
        type: "datasetNode",
        position: { x: xPos, y: 100 },
        data: { label: "Dataset" },
      });
      xPos += 250;
  
      // Map Plan Actions to Graph Nodes
      // We force a logical order for the visual graph to look clean
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
                  // Use 'domain' type which maps to DomainPreprocessingNode in frontend
                  type: "domain", 
                  position: { x: xPos, y: 100 },
                  data: { 
                      label: step.label, 
                      baseId: step.id,
                      color: "#b730cfff" // Purple
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
  
      // 3. Auto-Train Model (Default: MiniBatch KMeans) to give immediate results
      const defaultModelId = "m2"; 
      const defaultOutputId = "o1"; 
      
      // -- Model Node --
      const modelNodeId = `m_${defaultModelId}_${Date.now()}`;
      nodes.push({ id: modelNodeId, type: "modelNode", position: { x: xPos, y: 100 }, data: { label: "Auto-KMeans", baseId: defaultModelId } });
      edges.push({ id: `e-${lastNodeId}-${modelNodeId}`, source: lastNodeId, target: modelNodeId, animated: true });
      lastNodeId = modelNodeId;
      xPos += 250;
  
      // -- Output Node --
      const outNodeId = `o_${defaultOutputId}_${Date.now()}`;
      nodes.push({ id: outNodeId, type: "outputNode", position: { x: xPos, y: 85 }, data: { label: "Scatter Plot", baseId: defaultOutputId } });
      edges.push({ id: `e-${lastNodeId}-${outNodeId}`, source: lastNodeId, target: outNodeId, animated: true });
  
      // 4. Run Training & Output Generation in Background
      console.log("   🏥 Starting Default Training (MiniBatch KMeans)...");
      
      // Load available models config to find details for MiniBatch KMeans
      const allModels = loadJsonSafe("model_selectionAndTraining/model_names.json");
      const selectedModelObj = allModels.filter(m => m.id === defaultModelId);
  
      let trainingResults = [];
      let trainedModelPath = null;
      let vizData = {};
  
      if (selectedModelObj.length > 0) {
           // Run Model Handler
           const trainOutput = await runPythonScript(
               "model_selectionAndTraining/model_handler.py", 
               [preprocessedPath, JSON.stringify(selectedModelObj)]
           );
           
           if (trainOutput.includes("__JSON_START__")) {
               const jsonStr = trainOutput.split("__JSON_START__")[1].split("__JSON_END__")[0];
               trainingResults = JSON.parse(jsonStr);
               if (trainingResults.length > 0) trainedModelPath = trainingResults[0].path;
           }
           console.log(`   ✅ Model Training Complete.`);
  
           // Run Output Handler
           if (trainedModelPath) {
               const outOutput = await runPythonScript(
                   "output_section/output_handler.py",
                   [preprocessedPath, trainedModelPath, JSON.stringify([defaultOutputId])]
               );
               if (outOutput.includes("__JSON_START__")) {
                  const jsonStr = outOutput.split("__JSON_START__")[1].split("__JSON_END__")[0];
                  vizData = JSON.parse(jsonStr);
              }
              console.log(`   ✅ Output Generation Complete.`);
           }
      }
  
      res.json({
          message: "Medical Plan Executed Successfully",
          graph: { nodes, edges },
          outputs: vizData,
          trainingResults: trainingResults,
          isCustom: false
      });
  
    } catch (err) {
      console.error("❌ Medical Plan Execution Failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

module.exports = { router, processBranch };