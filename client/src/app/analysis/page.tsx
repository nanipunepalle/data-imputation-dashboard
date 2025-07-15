'use client';

import React from 'react';
import { LineChartOutlined } from '@ant-design/icons';
import styles from './analysis.module.css'; // create this CSS module
const Analysis: React.FC = () => {
  return (
    <div className={styles.container}>
      <LineChartOutlined className={styles.icon} />
      <h1 className={styles.title}>Analysis Page</h1>
      <p className={styles.message}>This page is under construction. Please check back later!</p>
    </div>
  );
};

export default Analysis;
