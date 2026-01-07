import React, { useState, useEffect } from 'react';

const EditableMedicalPlan = ({ initialPlan, explanation, onApprove, onUpdate }) => {
  const [plan, setPlan] = useState(initialPlan);
  const [isEditing, setIsEditing] = useState(false);
  const [editedExplanation, setEditedExplanation] = useState("");

  // Load explanation into state
  useEffect(() => {
    if (explanation) {
      setEditedExplanation(explanation);
    }
  }, [explanation]);

  // Update local state when prop changes
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
      <h5 style={{ marginTop: 0, color: '#b730cfff', display: 'flex', alignItems: 'center' }}>
        <span>🏥 AI Clinical Data Plan</span>
      </h5>
      
      {/* Plan Section Wrapper */}
      <div style={{ 
        border: '1px solid #e0c8e6', 
        borderRadius: '4px', 
        background: '#fff',
        marginBottom: '15px',
        overflow: 'hidden' // Keeps the rounded corners
      }}>
        {/* 
           1. overflowX: 'auto' enables horizontal scrolling if the screen is too narrow 
           2. maxHeight: '400px' keeps vertical scrolling 
        */}
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            
            {/* minWidth: '600px' prevents the columns from squashing */}
            <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              
              <colgroup>
                <col style={{ width: '25%' }} /> {/* Column Name */}
                <col style={{ width: '30%' }} /> {/* Action */}
                <col style={{ width: '45%' }} /> {/* Logic */}
              </colgroup>

              <thead style={{ position: 'sticky', top: 0, background: '#f8f9fa', borderBottom: '2px solid #ddd', zIndex: 2 }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: '#555', fontSize: '12px', fontWeight: 'bold' }}>Column Name</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: '#555', fontSize: '12px', fontWeight: 'bold' }}>Action</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: '#555', fontSize: '12px', fontWeight: 'bold' }}>Clinical Logic</th>
                </tr>
              </thead>
              
              <tbody>
                {Object.entries(plan).map(([column, details]) => (
                  <tr key={column} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    
                    {/* Column Name: Allow wrapping so "Obesity" shows fully instead of "Ob..." */}
                    <td style={{ 
                      padding: '12px', 
                      fontSize: '13px', 
                      fontWeight: '600', 
                      color: '#333', 
                      wordWrap: 'break-word',
                      verticalAlign: 'top'
                    }}>
                      {column}
                    </td>

                    {/* Action Dropdown */}
                    <td style={{ padding: '12px', verticalAlign: 'top' }}>
                      <select
                        value={details.action}
                        onChange={(e) => handleActionChange(column, e.target.value)}
                        style={{ 
                          width: '100%', 
                          padding: '6px', 
                          borderRadius: '4px', 
                          border: '1px solid #ccc',
                          fontSize: '12px',
                          cursor: 'pointer',
                          backgroundColor: details.action === 'drop' ? '#fff1f0' : '#f0f9ff',
                          color: details.action === 'drop' ? '#d9534f' : '#000'
                        }}
                      >
                        <option value="drop">Drop</option>
                        <option value="scale">Scale (Standardize)</option>
                        <option value="one_hot_encode">One-Hot Encode</option>
                        <option value="label_encode">Label Encode</option>
                      </select>
                    </td>

                    {/* Logic: Allow text to wrap naturally */}
                    <td style={{ 
                      padding: '12px', 
                      fontSize: '12px', 
                      color: '#555', 
                      lineHeight: '1.4', 
                      verticalAlign: 'top',
                      fontStyle: 'italic'
                    }}>
                       {details.reason || "No specific reason provided."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Explanation Section */}
      <div style={{ marginBottom: '15px' }}>
        <h6 style={{ margin: '0 0 5px 0', color: '#555' }}>Clinical Rationale & Report (Editable):</h6>
        <textarea
          value={editedExplanation}
          onChange={handleExplanationChange}
          placeholder="AI explanation will appear here..."
          style={{
            width: '100%',
            boxSizing: 'border-box',
            minHeight: '200px',
            resize: 'vertical',
            fontSize: '13px',
            lineHeight: '1.5',
            color: '#333',
            padding: '12px',
            backgroundColor: '#fff',
            border: '1px solid #e0c8e6',
            borderRadius: '4px',
            fontFamily: 'monospace'
          }}
        />
      </div>
      
      <button
        onClick={() => onApprove(plan)}
        style={{
          width: '100%',
          padding: '12px',
          border: 'none',
          borderRadius: '6px',
          backgroundColor: '#28a745',
          color: 'white',
          fontWeight: 'bold',
          fontSize: '14px',
          cursor: 'pointer',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        {isEditing ? 'Approve & Generate Code' : 'Generate Code'}
      </button>
    </div>
  );
};

export default EditableMedicalPlan;