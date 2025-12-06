import React, { useEffect, useState } from "react";
import axios from 'axios'; // Import axios
import FileUploader from "./sidebar_components/Preprocessing/FileUploader";
import DomainDetector from "./sidebar_components/Preprocessing/DomainDetector";
import Preprocessor from "./sidebar_components/Preprocessing/Preprocessor";
import PreprocessingModule from "./sidebar_components/Preprocessing/PreprocessingModule";
import ModelSelectionModule from "./sidebar_components/ModelSelection/ModelSelectionModule";
import OutputOptionModule from "./sidebar_components/OutputOptions/OutputOptionModule";
import EditableMedicalPlan from "./sidebar_components/Preprocessing/EditableMedicalPlan";

const Sidebar = ({
  file,
  onFileChange,
  onDomainDetected,
  domain,
  setGlobalLoading,
  medicalPlan,
  medicalExplanation,
  onPlanGenerated,
  onPlanUpdate,
}) => {
  const [NormalprocessingModules, setNormalProcessingModules] = useState([]);
  const [DomainprocessingModules, setDomainProcessingModules] = useState([]);
  const [models, setModels] = useState([]);
  const [outputModules, setOutput] = useState([]);
  const [activeTab, setActiveTab] = useState("normal");

  const NORMAL_COLOR = "#e87e0eff";
  const DOMAIN_COLOR = "#b730cfff";

  useEffect(() => {
    fetch("http://localhost:5001/normal-preprocessing-modules").then(res => res.json()).then(setNormalProcessingModules).catch(err => console.error("Failed to fetch normal modules:", err));
    fetch("http://localhost:5001/domain-based-preprocessing-modules").then(res => res.json()).then(setDomainProcessingModules).catch(err => console.error("Failed to fetch domain modules:", err));
    fetch("http://localhost:5001/model-list").then(res => res.json()).then(setModels).catch(err => console.error("Failed to fetch models:", err));
    fetch("http://localhost:5001/output-options").then(res => res.json()).then(setOutput).catch(err => console.error("Failed to fetch outputs:", err));
  }, []);

  // --- FINALIZED LOGIC FOR APPROVING THE PLAN ---
  const handleApprovePlan = async (approvedPlan) => {
    console.log("✅ [Sidebar] Plan Approved! Sending to backend:", approvedPlan);
    setGlobalLoading(true);
    
    const formData = new FormData();
    formData.append("dataset", file);
    formData.append("plan", JSON.stringify(approvedPlan));

    try {
        // This new endpoint executes the plan and returns a graph structure
        const res = await axios.post("http://localhost:5001/execute-approved-plan", formData);
        
        console.log("✅ [Sidebar] Main branch created from plan:", res.data);
        
        // Fire the `normal-run-complete` event. The FlowCanvas is already listening
        // for this event and will use the graph data in the response to draw the main branch.
        window.dispatchEvent(new CustomEvent("normal-run-complete", { detail: res.data }));
        
        // Clear the AI plan component from the sidebar now that it has been used
        onPlanGenerated(null, null); 
    } catch (error) {
        console.error("❌ Error executing approved plan:", error);
        // We use alert here because the ErrorPopup is part of the Preprocessor component which is no longer visible
        alert("Failed to create the main branch from the approved plan. Check the backend console for errors.");
    } finally {
        setGlobalLoading(false);
    }
  };


  return (
    <aside
      style={{
        width: 300,
        height: "100vh",
        backgroundColor: "#f0f2f5",
        borderRight: "1px solid #ccc",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: 12,
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 15,
        }}
      >
        {/* 1. Upload Section */}
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            backgroundColor: "#ffffff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <FileUploader
            onFileSelect={onFileChange}
            onDatasetUpload={(file) =>
              window.dispatchEvent(
                new CustomEvent("dataset-selected", { detail: file })
              )
            }
          />

          {file && (
            <DomainDetector
              file={file}
              onDomainDetected={onDomainDetected}
              setLoading={setGlobalLoading}
            />
          )}

          {/* Show the Preprocessor buttons ONLY if a domain is found AND no AI plan is currently displayed */}
          {file && domain && !medicalPlan && (
            <Preprocessor
              file={file}
              detectedDomain={domain}
              setLoading={setGlobalLoading}
              onPlanGenerated={onPlanGenerated}
            />
          )}

          {/* Show the Editable AI Plan ONLY if a plan has been generated */}
          {medicalPlan && (
            <EditableMedicalPlan 
                initialPlan={medicalPlan}
                explanation={medicalExplanation}
                onApprove={handleApprovePlan}
                onUpdate={onPlanUpdate}
            />
          )}

        </div>

        {/* 2. Draggable Modules Section */}
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            backgroundColor: "#ffffff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          <h4 style={{ marginBottom: "10px" }}>Drag-and-Drop Modules</h4>

          <div
            style={{
              display: "flex",
              backgroundColor: "#f1f3f5",
              borderRadius: "6px",
              padding: "4px",
              marginBottom: "15px",
            }}
          >
            <div
              onClick={() => setActiveTab("normal")}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "6px 0",
                fontSize: "13px",
                fontWeight: activeTab === "normal" ? "600" : "400",
                borderRadius: "5px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                backgroundColor: activeTab === "normal" ? "#fff" : "transparent",
                color: activeTab === "normal" ? NORMAL_COLOR : "#777",
                boxShadow: activeTab === "normal" ? "0 2px 4px rgba(0,0,0,0.1)" : "none",
                border: activeTab === "normal" ? `1px solid ${NORMAL_COLOR}20` : "1px solid transparent"
              }}
            >
              Normal
            </div>

            <div
              onClick={() => setActiveTab("domain")}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "6px 0",
                fontSize: "13px",
                fontWeight: activeTab === "domain" ? "600" : "400",
                borderRadius: "5px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                backgroundColor: activeTab === "domain" ? "#fff" : "transparent",
                color: activeTab === "domain" ? DOMAIN_COLOR : "#777",
                boxShadow: activeTab === "domain" ? "0 2px 4px rgba(0,0,0,0.1)" : "none",
                border: activeTab === "domain" ? `1px solid ${DOMAIN_COLOR}20` : "1px solid transparent"
              }}
            >
              Domain Based
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeTab === "normal" && (
              <>
                {NormalprocessingModules.length > 0 ? (
                  NormalprocessingModules.map((module) => (
                    <PreprocessingModule 
                        key={module.id} 
                        module={module} 
                        type="normal" 
                        color={NORMAL_COLOR}
                    />
                  ))
                ) : (
                  <p style={{ fontSize: 14, color: "#666" }}>Loading normal modules...</p>
                )}
              </>
            )}
            {activeTab === "domain" && (
              <>
                 {domain ? (
                    DomainprocessingModules.length > 0 ? (
                      DomainprocessingModules.map((module) => (
                        <PreprocessingModule 
                            key={module.id} 
                            module={module} 
                            type="domain"
                            color={DOMAIN_COLOR} 
                        />
                      ))
                    ) : (
                        <p style={{ fontSize: 14, color: "#666" }}>
                            Fetching modules for {domain}...
                        </p>
                    )
                 ) : (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#888', fontSize: '13px', fontStyle: 'italic' }}>
                        No domain detected yet. <br /> Upload a file to unlock domain modules.
                    </div>
                 )}
              </>
            )}
          </div>
        </div>

        {/* 3. Model Selection */}
        <div style={{ padding: 12, borderRadius: 8, backgroundColor: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h4>Model Selection</h4>
          {models.length > 0 ? (
            models.map((model) => (
              <ModelSelectionModule key={model.id} model={model} />
            ))
          ) : (
            <p style={{ fontSize: 14, color: "#666" }}>Loading models...</p>
          )}
        </div>

        {/* 4. Output Options */}
        <div style={{ padding: 12, borderRadius: 8, backgroundColor: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", marginBottom: 90 }}>
          <h4>Output Options</h4>
          {outputModules.length > 0 ? (
            outputModules.map((module) => (
              <OutputOptionModule key={module.id} output={module} />
            ))
          ) : (
            <p style={{ fontSize: 14, color: "#666" }}>
              Loading output options...
            </p>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;