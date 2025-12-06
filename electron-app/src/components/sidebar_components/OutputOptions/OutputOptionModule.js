import React from "react";

const OutputOptionModule = ({ output }) => {
  const handleDragStart = (e) => {
    const nodeData = {
      id: output.id,
      type: output.type,
      label: output.label,
      name: output.name,
    };

    e.dataTransfer.setData("application/reactflow", JSON.stringify(nodeData));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      style={{
        marginTop: 8,
        padding: "8px 10px",
        borderRadius: 6,
        backgroundColor: "#e5db15ff",
        border: "1px solid #ffe1a8",
        cursor: "grab",
        fontSize: 14,
        userSelect: "none",
      }}
    >
      {output.label}
    </div>
  );
};

export default OutputOptionModule;
