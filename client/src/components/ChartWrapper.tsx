'use client';

import { useState } from 'react';
import { Modal, Tooltip } from 'antd';
import { ArrowsAltOutlined, InfoCircleOutlined } from '@ant-design/icons';
import styles from '@/styles/ChartWrapper.module.css';

interface ChartWrapperProps {
    title: string;
    tooltipContent: React.ReactNode;
    children: React.ReactNode;
    legend?: React.ReactNode;
    modalContent?: React.ReactNode;
    inModal?: boolean;
    controls?: React.ReactNode;
    fixed?: boolean
}

const ChartWrapper: React.FC<ChartWrapperProps> = ({
    title,
    tooltipContent,
    children,
    legend,
    modalContent,
    inModal = false,
    controls,
    fixed = false
}) => {
    const [isModalVisible, setIsModalVisible] = useState(false);

    return (
        <div className={`${styles.container} ${inModal ? styles.modalContainer : ''}`}>
            <div className={styles.header}>
                <span className={styles.spanFlexCenter}>
                    <p className={styles.title}>{title}</p>
                    <Tooltip title={tooltipContent}>
                        <InfoCircleOutlined className={styles.infoIcon} />
                    </Tooltip>
                </span>
                <div className={styles.controls}>
                    {controls && controls}
                    {!inModal && (
                        <ArrowsAltOutlined
                            className={styles.expandIcon}
                            onClick={() => setIsModalVisible(true)}
                        />
                    )}
                </div>
            </div>

            {legend && <div className={styles.legend}>{legend}</div>}

            <div className={fixed ? styles.chartFixedArea: styles.chartScrollArea}>{children}</div>

            <Modal
                open={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
                footer={null}
                width="80%"
                style={{ top: 20 }}
                styles={{ body: { height: '70vh' } }}
                destroyOnHidden
            >
                {modalContent || (
                    <div style={{ width: '100%', height: '100%' }}>
                        <ChartWrapper
                            title={title}
                            tooltipContent={tooltipContent}
                            legend={legend}
                            inModal
                        >{children}</ChartWrapper>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ChartWrapper;
