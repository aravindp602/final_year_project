import React, { useState, useEffect, useMemo } from 'react';

const EditableMedicalPlan = ({ initialPlan, explanation, onApprove, onUpdate }) => {
  const [plan, setPlan] = useState(initialPlan);
  const [isEditing, setIsEditing] = useState(false);
  
  // --- NEW: State for the editable explanation ---
  const [editedExplanation, setEditedExplanation] = useState("");

  // This hook now parses the explanation and sets the initial state for the textarea
  useEffect(() => {
    if (explanation) {
      try {
        const parts = explanation.split(/============================================================/);
        const section2Content = parts.find(part => part.includes("Section 2: Detailed Walkthrough of the Preprocessing Plan"));
        
        if (section2Content) {
          const cleanText = section2Content.replace("Section 2: Detailed Walkthrough of the Preprocessing Plan", "").trim();
          setEditedExplanation(cleanText);
        } else {
          setEditedExplanation("Could not extract explanation section. Please check the full report.");
        }
      } catch (e) {
        console.error("Failed to parse explanation:", e);
        setEditedExplanation("Error displaying explanation.");
      }
    }
  }, [explanation]);

  // Update the local plan state when the initial plan prop changes
  useEffect(() => {
    setPlan(initialPlan);
    setIsEditing(false);
  }, [initialPlan]);

  const handleActionChange = (column, newAction) => {
    const updatedPlan = {
      ...plan,
      [column]: {
        ...plan[column],
        action: newAction,
      },
    };
    setPlan(updatedPlan);
    if (onUpdate) {
      onUpdate(updatedPlan);
    }
    setIsEditing(true);
  };
  
  // Handler for the textarea changes
  const handleExplanationChange = (e) => {
      setEditedExplanation(e.target.value);
      setIsEditing(true);
  }

  if (!plan || Object.keys(plan).length === 0) return null;

  return (
    <div style={{ 
      border: '2px dashed #b730cfff', 
      borderRadius: '8px', 
      padding: '15px', 
      marginTop: '15px',
      backgroundColor: '#faf7fb'
    }}>
      <h5 style={{ marginTop: 0, color: '#b730cfff' }}>AI-Generated Medical Plan</h5>
      
      {/* Plan Section - now with more vertical space */}
      <div style={{ 
        maxHeight: '250px', // Increased max-height for better scrolling
        overflowY: 'auto', 
        marginBottom: '15px', 
        border: '1px solid #e0c8e6', 
        borderRadius: '4px', 
        padding: '10px', 
        background: '#fff' 
      }}>
        {Object.entries(plan).map(([column, details]) => (
          <div key={column} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', fontSize: '13px' }}>
            <strong style={{ flex: 1, minWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', title: column }}>{column}</strong>
            <select
              value={details.action}
              onChange={(e) => handleActionChange(column, e.target.value)}
              style={{ flex: 2, padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
            >
              <option value="drop">Drop</option>
              <option value="scale">Scale</option>
              <option value="one_hot_encode">One-Hot Encode</option>
              <option value="label_encode">Label Encode</option>
            </select>
          </div>
        ))}
      </div>

      {/* Explanation Section - now an editable textarea */}
      <div style={{ marginBottom: '15px' }}>
        <h6 style={{ margin: '0 0 5px 0', color: '#555' }}>Explanation (Editable):</h6>
        <textarea
          value={editedExplanation}
          onChange={handleExplanationChange}
          style={{
            width: '100%',
            boxSizing: 'border-box', // Ensures padding doesn't add to width
            minHeight: '150px',   // Start with a good height
            resize: 'vertical',   // Allow user to resize vertically
            fontSize: '12px',
            color: '#444',
            padding: '10px',
            backgroundColor: '#fff',
            border: '1px solid #e0c8e6',
            borderRadius: '4px',
            fontFamily: 'inherit' // Use the same font as the rest of the app
          }}
        />
      </div>
      
      <button
        onClick={() => onApprove(plan)}
        style={{
          width: '100%',
          padding: '10px',
          border: 'none',
          borderRadius: '6px',
          backgroundColor: '#28a745',
          color: 'white',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}
      >
        {isEditing ? 'Approve & Generate Code' : 'Generate Code'}
      </button>
    </div>
  );
};

export default EditableMedicalPlan;