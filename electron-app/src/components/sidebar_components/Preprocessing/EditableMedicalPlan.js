import React, { useState, useEffect, useMemo } from 'react';

const EditableMedicalPlan = ({ initialPlan, explanation, onApprove, onUpdate }) => {
  const [plan, setPlan] = useState(initialPlan);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setPlan(initialPlan);
    setIsEditing(false); // Reset editing status when a new plan arrives
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

  const explanationSection = useMemo(() => {
    if (!explanation) return "Generating explanation...";
    
    const section2Regex = /Section 2: Detailed Walkthrough of the Preprocessing Plan([\s\S]*?)============================================================/;
    const match = explanation.match(section2Regex);
    
    return match && match[1] ? match[1].trim() : "Could not extract explanation section. Please check the full report.";
  }, [explanation]);

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
      
      <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '15px', border: '1px solid #e0c8e6', borderRadius: '4px', padding: '10px', background: '#fff' }}>
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

      <div style={{ marginBottom: '15px' }}>
        <h6 style={{ margin: '0 0 5px 0', color: '#555' }}>Explanation:</h6>
        <div style={{
          fontSize: '12px',
          color: '#444',
          maxHeight: '150px',
          overflowY: 'auto',
          padding: '10px',
          backgroundColor: '#fff',
          border: '1px solid #e0c8e6',
          borderRadius: '4px',
          whiteSpace: 'pre-wrap'
        }}>
          {explanationSection}
        </div>
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
        {isEditing ? 'Approve & Generate Main Branch' : 'Generate Main Branch'}
      </button>
    </div>
  );
};

export default EditableMedicalPlan;