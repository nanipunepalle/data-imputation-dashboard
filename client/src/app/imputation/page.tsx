'use client';

import React from 'react';
import { ToolOutlined } from '@ant-design/icons';
import styles from './imputation.module.css'; // Make sure this file exists

const Imputation: React.FC = () => {
  return (
    <div className={styles.container}>
      <ToolOutlined className={styles.icon} />
      <h1 className={styles.title}>Imputation Page</h1>
      <p className={styles.message}>This page is under construction. Please check back later!</p>
    </div>
  );
};

export default Imputation;
