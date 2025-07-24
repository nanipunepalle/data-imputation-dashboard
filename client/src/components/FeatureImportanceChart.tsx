'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Select, Spin } from 'antd';
import { useDatasetStore } from '@/store/useDataStore';
import { fetchFeatureImportance } from '@/services/apiService';
import ChartWrapper from '@/components/ChartWrapper';

const { Option } = Select;

type Feature = {
  name: string;
  value: number;
  direction: 'Positive Direction' | 'Negative Direction';
};

const FeatureImportanceChart: React.FC<{ inModal?: boolean }> = ({ inModal }) => {
  const { dataset, targetColumn } = useDatasetStore();
  const [method, setMethod] = useState('all_methods');
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const methodOptions = [
    'all_methods', 'pearson', 'spearman', 'mutual_info', 'rf', 'lasso', 'rf_shap', 'lasso_shap',
  ];

  useEffect(() => {
    const loadFeatureImportance = async () => {
      if (!dataset || !dataset.rows.length || !targetColumn) return;
      setLoading(true);
      try {
        const result = await fetchFeatureImportance(targetColumn, method);
        const combinedData = result.Combined_df || {};
        const featureList: Feature[] = Object.keys(combinedData).map((feature): Feature => ({
          name: feature,
          value: combinedData[feature].Combined,
          direction: combinedData[feature].Direction_Sign > 0 ? 'Positive Direction' : 'Negative Direction',
        }));
        featureList.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
        setFeatures(featureList);
      } catch (error) {
        console.error('Failed to load feature importance:', error);
      } finally {
        setLoading(false);
      }
    };
    loadFeatureImportance();
  }, [dataset, targetColumn, method]);

  useEffect(() => {
    if (!features.length || !svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const containerWidth = containerRef.current.clientWidth;
    const margin = { top: 30, right: 20, bottom: 10, left: 140 };
    const barHeight = 10;
    const spacing = 10;
    const chartHeight = features.length * (barHeight + spacing);
    const height = margin.top + margin.bottom + chartHeight;
    const width = containerWidth;

    const maxVal = d3.max(features, d => Math.abs(d.value)) || 1;

    const x = d3.scaleLinear()
      .domain([-maxVal, maxVal])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleBand()
      .domain(features.map(d => d.name))
      .rangeRound([margin.top, height - margin.bottom])
      .padding(0.2);

    const tooltip = d3.select(containerRef.current)
      .append('div')
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.75)')
      .style('color', 'white')
      .style('padding', '6px 10px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0);

    svg.append('g')
      .attr('transform', `translate(0,${margin.top})`)
      .call(d3.axisTop(x).ticks(5));

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y))
      .selectAll('text')
      .attr('font-size', '12px')
      .attr('fill', '#1f2937')
      .each(function (_, i) {
        const label = features[i].name;
        const maxChars = 20;
        const textNode = d3.select(this);
        const truncated = label.length > maxChars ? label.slice(0, maxChars - 3) + '...' : label;
        textNode.text(truncated);
        textNode.append('title').text(label);
      });

    svg.selectAll('rect')
      .data(features)
      .join('rect')
      .attr('y', d => y(d.name)!)
      .attr('x', d => d.direction === 'Negative Direction' ? x(-d.value) : x(0))
      .attr('width', d => Math.abs(x(d.value) - x(0)))
      .attr('height', y.bandwidth())
      .attr('fill', d => d.direction === 'Positive Direction' ? '#0072B2' : '#C0504D')
      .on('mouseover', (event, d) => {
        tooltip.transition().duration(200).style('opacity', 0.9);
        tooltip.html(`<strong>${d.name}</strong><br/>Value: ${d.value.toFixed(3)}<br/>Direction: <em>${d.direction}</em>`);
      })
      .on('mousemove', event => {
        tooltip.style('left', `${event.offsetX + 10}px`).style('top', `${event.offsetY - 10}px`);
      })
      .on('mouseleave', () => tooltip.transition().duration(200).style('opacity', 0));

    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMinYMin meet')
      .attr('width', '100%')
      .attr('height', height);

    return () => { tooltip.remove(); };
  }, [features]);

  if (!dataset || !targetColumn) return null;


  return (
    <ChartWrapper
      title="Feature Importance"
      tooltipContent={
        <div style={{ maxWidth: 300 }}>
          <p><strong>Feature Importance</strong> shows the relative importance of each input variable in predicting the target.</p>
          <p>Methods like <code>SHAP</code>, <code>random forest</code>, and <code>LASSO</code> are aggregated here. The direction indicates the nature of correlation with the target variable.</p>
        </div>
      }
      controls={
        <Select
          value={method}
          onChange={setMethod}
          size="small"
          style={{ width: 160 }}
        >
          {methodOptions.map((option) => (
            <Option key={option} value={option}>{option}</Option>
          ))}
        </Select>
      }
      modalContent={<FeatureImportanceChart inModal />}
      inModal={inModal}
    >
      <div ref={containerRef} style={{ height: '100%', width: '100%' }}>
        <Spin spinning={loading}>
          <svg ref={svgRef} />
        </Spin>
      </div>
    </ChartWrapper>
  );
};

export default FeatureImportanceChart;
