import React, { useState, useEffect } from "react";
import axios from "axios";
import ErrorPopup from '../../ErrorPopup'; 

const Preprocessor = ({ file, detectedDomain, setLoading, onPlanGenerated }) => {
  const [error, setError] = useState(null); 

  useEffect(() => {
    // Clear previous plan when a new file is uploaded
    if (onPlanGenerated) {
        onPlanGenerated(null, null); 
    }
  }, [file, onPlanGenerated]);

  const handlePreprocess = async (type) => {
    if (!file) {
      setError("Please upload a file first.");
      return;
    }

    const formData = new FormData();
    formData.append("dataset", file);
    
    setError(null); 
    setLoading(true);

    if (type === "domain") {
      // NEW LOGIC: Call the plan generator
      try {
        console.log("🤖 Calling Gemma for a medical plan...");
        const res = await axios.post("http://localhost:5001/generate-medical-plan", formData);
        console.log("✅ Plan received from backend:", res.data);
        if (onPlanGenerated) {
            onPlanGenerated(res.data.plan, res.data.explanation);
        }
      } catch (err) {
        console.error("❌ Error generating medical plan:", err);
        setError(err.response?.data?.message || "Failed to generate AI plan.");
      } finally {
        setLoading(false);
      }
    } else {
      // EXISTING NORMAL PREPROCESSING LOGIC
      try {
        formData.append("isCustom", "false");
        console.log(`⚙️ Starting normal preprocessing...`);
        const res = await axios.post("http://localhost:5001/preprocess-normal", formData);
        console.log("✅ Preprocessing response:", res.data);
        if (res.data.graph && res.data.outputs) {
          console.log("🚀 Firing 'normal-run-complete' event!");
          window.dispatchEvent(new CustomEvent("normal-run-complete", { detail: res.data }));
        }
      } catch (err) {
        console.error("❌ Error during normal preprocessing:", err);
        setError("Something went wrong during normal preprocessing.");
      } finally {
        setLoading(false);
      }
    }
  };

  const normalizedDomain = detectedDomain ? detectedDomain.toString().trim().toLowerCase() : "";
  const isMedical = normalizedDomain === "medical";

  return (
    <div>
      {error && <ErrorPopup message={error} onClose={() => setError(null)} />}
      <p style={{ marginBottom: 10, fontWeight: "bold" }}>Create Main Branch with:</p>

      {isMedical ? (
        <div style={{ display: "flex", flexDirection: "row", gap: 10 }}> 
          <button
            onClick={() => handlePreprocess("domain")}
            style={{
              padding: "8px 12px", border: "none", borderRadius: 6,
              backgroundColor: "#b730cfff", color: "white", cursor: "pointer",
              flex: 1, fontWeight: 'bold'
            }}
          >
            Generate AI Plan
          </button>
          <button
            onClick={() => handlePreprocess("normal")}
            style={{
              padding: "8px 12px", border: "none", borderRadius: 6,
              backgroundColor: "#28a745", color: "white",
              cursor: "pointer", flex: 1,
            }}
          >
            Normal Preprocessing
          </button>
        </div>
      ) : (
        <button
          onClick={() => handlePreprocess("normal")}
          style={{
            padding: "8px 12px", border: "none", borderRadius: 6,
            backgroundColor: "#28a745", color: "white",
            cursor: "pointer", width: "100%",
          }}
        >
          Normal Preprocessing
        </button>
      )}
    </div>
  );
};

export default Preprocessor;