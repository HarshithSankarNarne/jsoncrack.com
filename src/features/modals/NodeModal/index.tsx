import React, { useState, useEffect } from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Group, Textarea, ColorSwatch } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import styled from "styled-components";
import type { NodeData, NodeRow } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useFile from "../../../store/useFile";

const StyledColorPreview = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0;
`;

// Color detection function (same as TextRenderer)
function isColorFormat(colorString: string) {
  const hexCodeRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  const rgbRegex = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/;
  const rgbaRegex = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0|1|0\.\d+)\s*\)$/;

  return (
    hexCodeRegex.test(colorString) || rgbRegex.test(colorString) || rgbaRegex.test(colorString)
  );
}

// Component to show color previews above the textarea in edit mode
const ColorPreviewBar = ({ content }: { content: string }) => {
  const colors: string[] = [];
  
  // Extract all color values from the content
  const colorRegex = /#[A-Fa-f0-9]{3,6}|rgb\([^)]+\)|rgba\([^)]+\)/g;
  let match;
  while ((match = colorRegex.exec(content)) !== null) {
    if (isColorFormat(match[0]) && !colors.includes(match[0])) {
      colors.push(match[0]);
    }
  }

  if (colors.length === 0) return null;

  return (
    <Flex gap={4} mb={4} wrap="wrap">
      {colors.map((color, index) => (
        <Flex key={index} align="center" gap={4}>
          <ColorSwatch size={16} radius={2} color={color} />
          <Text size="xs" ff="monospace">{color}</Text>
        </Flex>
      ))}
    </Flex>
  );
};
const ColorAwareJsonDisplay = ({ jsonString }: { jsonString: string }) => {
  const renderColorPreview = (content: string) => {
    try {
      const parsed = JSON.parse(content);
      const lines = JSON.stringify(parsed, null, 2).split('\n');
      
      return lines.map((line, index) => {
        // Look for color values in the line
        const colorMatch = line.match(/"([^"]*)":\s*"([^"]*)"/) || line.match(/"([^"]*)"$/);
        if (colorMatch) {
          const value = colorMatch[2] || colorMatch[1];
          if (isColorFormat(value)) {
            return (
              <StyledColorPreview key={index}>
                <ColorSwatch size={12} radius={4} color={value} />
                <span>{line}</span>
              </StyledColorPreview>
            );
          }
        }
        return <div key={index}>{line}</div>;
      });
    } catch {
      // If not valid JSON, just check each line for color values
      return content.split('\n').map((line, index) => {
        const colorMatch = line.match(/#[A-Fa-f0-9]{3,6}|rgb\([^)]+\)|rgba\([^)]+\)/);
        if (colorMatch && isColorFormat(colorMatch[0])) {
          return (
            <StyledColorPreview key={index}>
              <ColorSwatch size={12} radius={4} color={colorMatch[0]} />
              <span>{line}</span>
            </StyledColorPreview>
          );
        }
        return <div key={index}>{line}</div>;
      });
    }
  };

  return <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>{renderColorPreview(jsonString)}</div>;
};

// return object from json including ALL fields (including arrays and objects) for editing
const normalizeNodeDataForEditing = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.key) {
      if (row.type === "array") {
        obj[row.key] = `[${row.childrenCount || 0} items]`;
      } else if (row.type === "object") {
        obj[row.key] = `{${row.childrenCount || 0} keys}`;
      } else {
        obj[row.key] = row.value;
      }
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return object from json removing array and object fields (for display only)
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setSelectedNode = useGraph(state => state.setSelectedNode);
  const contents = useFile(state => state.contents);
  const setContents = useFile(state => state.setContents);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");

  // Update edited content when node data changes or when entering edit mode
  useEffect(() => {
    const content = isEditing 
      ? normalizeNodeDataForEditing(nodeData?.text ?? [])
      : normalizeNodeData(nodeData?.text ?? []);
    setEditedContent(content);
    setOriginalContent(content);
  }, [nodeData, isEditing]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const updatePrimitiveValue = (target: any, lastKey: string | number | undefined, editedData: any) => {
    if (target && typeof target === 'object' && lastKey !== undefined) {
      target[lastKey] = editedData;
    } else if (lastKey !== undefined) {
      const currentJson = JSON.parse(contents);
      currentJson[lastKey] = editedData;
      return currentJson;
    }
    return null;
  };

  const updateObjectValues = (targetObject: any, editedData: any) => {
    Object.keys(editedData).forEach(key => {
      const nodeRow = nodeData?.text.find(row => row.key === key);
      if (nodeRow && nodeRow.type !== 'array' && nodeRow.type !== 'object') {
        targetObject[key] = editedData[key];
      }
    });
  };

  const handleSave = () => {
    if (!nodeData?.path || !nodeData) return;

    try {
      // Parse the edited content
      let editedData;
      try {
        editedData = JSON.parse(editedContent);
      } catch {
        editedData = editedContent.replace(/^"|"$/g, '');
      }

      const currentJson = JSON.parse(contents);
      let target = currentJson;
      const path = [...nodeData.path];
      const lastKey = path.pop();

      // Navigate to the parent object/array
      for (const key of path) {
        if (target && typeof target === 'object') {
          target = target[key];
        }
      }

      // Handle single value vs multi-value nodes
      if (nodeData.text.length === 1 && !nodeData.text[0].key) {
        // Single value node
        const result = updatePrimitiveValue(target, lastKey, editedData);
        if (result) Object.assign(currentJson, result);
      } else {
        // Multi-value node - only update primitive values
        const targetObject = lastKey !== undefined ? target?.[lastKey] : currentJson;
        if (targetObject && typeof targetObject === 'object') {
          updateObjectValues(targetObject, editedData);
        }
      }

      const updatedJsonString = JSON.stringify(currentJson, null, 2);
      setContents({ contents: updatedJsonString });
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating JSON:", error);
    }
  };

  const handleCancel = () => {
    const content = normalizeNodeData(nodeData?.text ?? []);
    setEditedContent(content);
    setOriginalContent(content);
    setIsEditing(false);
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex gap="xs" align="center">
              {!isEditing ? (
                <>
                  <Button size="xs" variant="light" onClick={handleEdit}>
                    Edit
                  </Button>
                  <CloseButton onClick={onClose} />
                </>
              ) : (
                <>
                  <Button size="xs" variant="light" color="green" onClick={handleSave}>
                    Save
                  </Button>
                  <Button size="xs" variant="light" color="red" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <CloseButton onClick={onClose} />
                </>
              )}
            </Flex>
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            {isEditing ? (
              <>
                <ColorPreviewBar content={editedContent} />
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  placeholder="Enter valid JSON content..."
                  minRows={8}
                  maxRows={15}
                  styles={{
                    input: {
                      fontFamily: 'monospace',
                      fontSize: '12px'
                    }
                  }}
                />
              </>
            ) : (
              <ColorAwareJsonDisplay jsonString={normalizeNodeData(nodeData?.text ?? [])} />
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
