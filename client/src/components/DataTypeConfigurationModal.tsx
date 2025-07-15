
import { useState } from "react";
import { Modal, Select, Checkbox, Input, Button } from "antd";
import { configureDataType } from "@/services/apiService";

const { Option } = Select;

interface DataTypeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    availableColumns: string[];
    file: File;
}

export default function DataTypeModal({
    isOpen,
    onClose,
    onSave,
    availableColumns,
    file,
}: DataTypeModalProps) {
    const [column, setColumn] = useState<string>("");
    const [dtype, setDtype] = useState<string>("");
    const [treatNoneAsCategory, setTreatNoneAsCategory] = useState<boolean>(false);
    const [customEncoder, setCustomEncoder] = useState<string>("");

    const handleSave = async () => {
        if (!column || !dtype) {
            alert("Column and dtype are required.");
            return;
        }

        try {
            const updatedData = await configureDataType({
                file,
                column,
                dtype,
                treat_none_as_category: treatNoneAsCategory,
                custom_encoder: customEncoder,
            });
            console.log(updatedData);
            onSave();
            onClose();
        } catch (error) {
            console.error('Failed to configure data type:', error);
            alert("Failed to configure data type");
        }
    };

    return (
        <Modal
            open={isOpen}
            onCancel={onClose}
            onOk={handleSave}
            title="Change Data Type"
            footer={[
                <Button key="back" onClick={onClose}>
                    Cancel
                </Button>,
                <Button key="submit" type="primary" onClick={handleSave}>
                    Save
                </Button>,
            ]}
        >
            <div style={{ marginBottom: 16 }}>
                <label>Column *</label>
                <Select
                    style={{ width: "100%", marginTop: 4 }}
                    value={column || undefined}
                    onChange={setColumn}
                    placeholder="Select a column"
                >
                    {availableColumns.map((col) => (
                        <Option key={col} value={col}>
                            {col}
                        </Option>
                    ))}
                </Select>
            </div>
            <div style={{ marginBottom: 16 }}>
                <label>Dtype *</label>
                <Select
                    style={{ width: "100%", marginTop: 4 }}
                    value={dtype || undefined}
                    onChange={setDtype}
                    placeholder="Select a dtype"
                >
                    <Option value="Categorical">Categorical</Option>
                    <Option value="int">int</Option>
                    <Option value="float">float</Option>
                </Select>
            </div>
            <div style={{ marginBottom: 16 }}>
                <Checkbox
                    checked={treatNoneAsCategory}
                    onChange={(e) => setTreatNoneAsCategory(e.target.checked)}
                >
                    Treat None as Category
                </Checkbox>
            </div>
            <div style={{ marginBottom: 16 }}>
                <label>Custom Encoder (optional)</label>
                <Input
                    value={customEncoder}
                    onChange={(e) => setCustomEncoder(e.target.value)}
                    placeholder="Enter custom encoder name"
                />
            </div>
        </Modal>
    );
}