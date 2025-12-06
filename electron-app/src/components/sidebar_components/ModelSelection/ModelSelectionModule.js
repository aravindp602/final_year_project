import React from "react";

const ModelSelectionModule = ({ model }) => {
  const handleDragStart = (e) => {
    // Same logic as PreprocessingModule, but for models
    const nodeData = {
      id: model.id,
      type: model.type,
      label: model.label,
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
        backgroundColor: "#ADE498",
        border: "1px solid #c9e8ff",
        cursor: "grab",
        fontSize: 14,
        userSelect: "none",
      }}
    >
      {model.label}
    </div>
  );
};

export default ModelSelectionModule;
