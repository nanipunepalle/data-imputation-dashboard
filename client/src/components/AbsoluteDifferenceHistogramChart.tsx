'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Select, Spin } from 'antd';
import ChartWrapper from '@/components/ChartWrapper';
import { useDatasetStore } from '@/store/useDataStore';
import { fetchMissingnessSummary, fetchTestEvaluation } from '@/services/apiService';

const AbsoluteDifferenceHistogram: React.FC<{ inModal?: boolean }> = ({ inModal }) => {
  const { dataset, isUpdated } = useDatasetStore();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMissingnessSummary().then(summary => {
      const cols = summary.filter((s: any) => s.percent > 0).map((s: any) => s.feature);
      setColumns(cols);
      cols.length > 0 && setSelectedColumn(cols[0]);
    });
  }, [dataset, isUpdated]);

  useEffect(() => {
    if (!selectedColumn || !svgRef.current || !containerRef.current) return;
    setLoading(true);

    fetchTestEvaluation()
      .then(data => {
        const filtered = data.test_evaluation.filter((d: any) => d.column === selectedColumn);
        const values = filtered.map((d: any) => d.absolute_diff) as number[];

        // --- compute MAE & RMSE for this column ---
        let mae: number | undefined;
        let rmse: number | undefined;

        if (filtered.length > 0) {
          mae = d3.mean(values) ?? 0;

          const squaredDiffs = filtered.map((d: any) => {
            const orig = Number(d.original);
            const imp = Number(d.imputed);
            if (Number.isNaN(orig) || Number.isNaN(imp)) return 0;
            const diff = orig - imp;
            return diff * diff;
          });

          rmse = Math.sqrt(d3.mean(squaredDiffs) ?? 0);
        }
        // -----------------------------------------

        drawHistogram(values, mae, rmse);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedColumn, dataset, isUpdated]);

  const drawHistogram = (values: number[], mae?: number, rmse?: number) => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const containerWidth = containerRef.current!.clientWidth || 600;
    const containerHeight = containerRef.current!.clientHeight || 360;
    const width = containerWidth;
    const height = containerHeight;
    const margin = { top: 10, right: 30, bottom: 60, left: 60 };

    // Handle empty data
    if (!values || values.length === 0) {
      svg
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMinYMin meet')
        .attr('width', '100%')
        .attr('height', '100%')
        .append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .text('No data to display');
      return;
    }

    // X scale
    const extent = d3.extent(values) as [number, number];
    let [xMin, xMax] = extent;
    if (xMin === xMax) xMax = xMin + 1e-6; // avoid zero-width bins

    const x = d3.scaleLinear().domain([xMin, xMax]).nice().range([margin.left, width - margin.right]);

    // Binning
    const bins = d3.bin().domain(x.domain() as [number, number]).thresholds(20)(values);

    // Percentages (0–100) instead of counts
    const total = values.length;
    const pct = (n: number) => (n / total) * 100;

    // Y scale in percent
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(bins, d => pct(d.length)) || 0])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // Axes
    svg
      .append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(45)')
      .style('text-anchor', 'start');

    svg.append('g').attr('transform', `translate(${margin.left},0)`).call(
      d3.axisLeft(y).tickFormat(d => `${d as number}%`)
    );

    // Bars using percentage heights
    svg
      .selectAll('.bar')
      .data(bins)
      .enter()
      .append('rect')
      .attr('x', d => x(d.x0!) + 1)
      .attr('y', d => y(pct(d.length)))
      .attr('width', d => Math.max(0, x(d.x1!) - x(d.x0!) - 2))
      .attr('height', d => y(0) - y(pct(d.length)))
      .attr('fill', '#0072B2');

    // X label
    svg
      .append('text')
      .attr('x', width / 2)
      .attr('y', height - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', 'black')
      .text('Absolute Difference');

    // Y label (percentage)
    svg
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', margin.left / 3)
      .attr('text-anchor', 'middle')
      .attr('fill', 'black')
      .text('Percentage (%)');

    // --- MAE / RMSE annotation box inside the plot ---
    if (mae !== undefined && rmse !== undefined) {
      const boxPadding = 6;
      const lineHeight = 14;
      const boxWidth = 140;
      const boxHeight = lineHeight * 2 + boxPadding * 2;

      const boxX = width - margin.right - 10;
      const boxY = margin.top + 10;

      const g = svg.append('g').attr('transform', `translate(${boxX}, ${boxY})`);

      // background rect (anchored to top-right)
      g.append('rect')
        .attr('x', -boxWidth)
        .attr('y', 0)
        .attr('width', boxWidth)
        .attr('height', boxHeight)
        .attr('rx', 4)
        .attr('ry', 4)
        .attr('fill', 'white')
        .attr('stroke', '#ccc')
        .attr('stroke-width', 1)
        .attr('opacity', 0.9);

      g.append('text')
        .attr('x', -boxPadding)
        .attr('y', boxPadding + lineHeight - 4)
        .attr('text-anchor', 'end')
        .attr('fill', '#333')
        .style('font-size', '11px')
        .text(`MAE: ${mae.toFixed(4)}`);

      g.append('text')
        .attr('x', -boxPadding)
        .attr('y', boxPadding + lineHeight * 2 - 4)
        .attr('text-anchor', 'end')
        .attr('fill', '#333')
        .style('font-size', '11px')
        .text(`RMSE: ${rmse.toFixed(4)}`);
    }
    // -------------------------------------------------

    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMinYMin meet')
      .attr('width', '100%')
      .attr('height', '100%');
  };

  return (
    <ChartWrapper
      title="Absolute Difference Distribution"
      tooltipContent={
        <p>
          Histogram of absolute difference between original and imputed values (shown as % of samples in each bin). MAE and RMSE
          for the selected column are shown inside the plot.
        </p>
      }
      modalContent={<AbsoluteDifferenceHistogram inModal />}
      inModal={inModal}
      fixed={true}
      controls={
        <Select
          size="small"
          style={{ width: 180 }}
          placeholder="Select Column"
          onChange={val => setSelectedColumn(val)}
          value={selectedColumn}
        >
          {columns.map(col => (
            <Select.Option key={col} value={col}>
              {col}
            </Select.Option>
          ))}
        </Select>
      }
    >
      <div ref={containerRef} style={{ flex: 1 }}>
        <Spin spinning={loading}>
          <svg ref={svgRef} width="100%" height="100%" />
        </Spin>
      </div>
    </ChartWrapper>
  );
};

export default AbsoluteDifferenceHistogram;
