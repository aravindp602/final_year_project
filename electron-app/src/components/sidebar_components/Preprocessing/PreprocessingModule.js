import React from "react";

// 1. Accept 'type' in props
const PreprocessingModule = ({ module, color, type }) => {
  const handleDragStart = (e) => {
    const nodeData = {
      id: module.id,
      // 2. Use the passed 'type' (e.g., "normal" or "domain")
      // Fallback to module.type only if prop is missing
      type: type || module.type, 
      label: module.label || module.name,
      
      // 3. CRITICAL: Pass the color so the Canvas Node can use it!
      color: color, 
    };
    
    console.log("🚀 [Sidebar] Drag Start:", nodeData);
    
    e.dataTransfer.setData("application/reactflow", JSON.stringify(nodeData));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      style={{
        marginTop: 8,
        padding: "10px 12px",
        borderRadius: "6px",
        backgroundColor: color || "#ccc", 
        color: "#0f0101ff", 
        border: "none", 
        boxShadow: "0 2px 4px rgba(0,0,0,0.15)", 
        cursor: "grab",
        fontSize: "14px",
        userSelect: "none",
        transition: "transform 0.1s ease", 
      }}
      onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
      onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
    >
      {module.label || module.name}
    </div>
  );
};

export default PreprocessingModule;