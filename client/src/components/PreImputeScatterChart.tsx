'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Select, Spin, Typography } from 'antd';
import ChartWrapper from '@/components/ChartWrapper';
import { useDatasetStore } from '@/store/useDataStore';
import { fetchDataTypes, fetchPreimputeScatter } from '@/services/apiService';

const { Text } = Typography;

const COLOR_OBS = '#0072B2';      // Observed (target present)
const COLOR_MISS = '#D55E00';     // Target missing

type ScatterResp = {
  mode?: 'preimpute';
  source?: 'raw' | 'merged_preimpute';
  session_id?: string;
  x_column: string;
  y_column: string;
  target_column?: string;
  x_min: number; x_max: number;
  y_min: number; y_max: number;
  n: number; dropped: number;
  pearson: number; spearman: number; r2: number;
  slope: number; intercept: number;
  points: Array<{ x: number; y: number; label: 'Observed' | 'ImputeTargetMissing' }>;
  missing_counts?: {
    total_rows: number; x_missing: number; y_missing: number; either_missing: number;
    target_missing_total?: number; target_missing_in_scatter?: number;
  };
  counts?: { observed?: number; impute_target_missing?: number };
  legend?: string[];
};

const PreImputeScatterPlot: React.FC<{ inModal?: boolean }> = ({ inModal }) => {
  const { dataset, isUpdated } = useDatasetStore();

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [columns, setColumns] = useState<string[]>([]);
  const [xCol, setXCol] = useState<string | null>(null);
  const [yCol, setYCol] = useState<string | null>(null);
  const [targetCol, setTargetCol] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ScatterResp | null>(null);

  // Load ALL columns from dtypes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dtypes = await fetchDataTypes(); // Record<string,string>
        const cols = Object.keys(dtypes);
        if (!cancelled) {
          setColumns(cols);
          // default selections if unset or invalid
          if (!xCol || !cols.includes(xCol)) setXCol(cols[0] ?? null);
          if (!yCol || !cols.includes(yCol)) setYCol(cols[1] ?? cols[0] ?? null);
          if (!targetCol || !cols.includes(targetCol)) setTargetCol(cols[2] ?? cols[0] ?? null);
        }
      } catch (err) {
        console.error('Error loading dtypes:', err);
        if (!cancelled) setColumns([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, isUpdated]);

  // Fetch scatter when selections change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!xCol || !yCol || !targetCol) {
        setResp(null);
        return;
      }
      setLoading(true);
      try {
        const r = await fetchPreimputeScatter({
          x_column: xCol,
          y_column: yCol,
          target_column: targetCol, // NEW
        });
        if (!cancelled) setResp(r);
      } catch (e) {
        console.error(e);
        if (!cancelled) setResp(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [xCol, yCol, targetCol, dataset, isUpdated]);

  // Draw scatter
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = containerRef.current.clientWidth || 600;
    const height = containerRef.current.clientHeight || (inModal ? 320 : 420);
    const margin = { top: 10, right: 16, bottom: 56, left: 64 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMinYMin meet')
      .attr('width', '100%')
      .attr('height', '100%');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Empty state
    if (!resp || !resp.points?.length) {
      g.append('text')
        .attr('x', innerW / 2)
        .attr('y', innerH / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', 13)
        .text('Select X, Y and Target to render pre-imputation scatter');
      return;
    }

    const xScale = d3.scaleLinear().domain([resp.x_min, resp.x_max]).nice().range([0, innerW]);
    const yScale = d3.scaleLinear().domain([resp.y_min, resp.y_max]).nice().range([innerH, 0]);

    const xAxis = d3.axisBottom(xScale).ticks(6);
    const yAxis = d3.axisLeft(yScale).ticks(6);

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis)
      .selectAll('text')
      .attr('transform', 'rotate(45)')
      .style('text-anchor', 'start');

    g.append('g').call(yAxis);

    // Axis labels
    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 40)
      .attr('text-anchor', 'middle')
      .style('font-size', 12)
      .text(resp.x_column);

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerH / 2)
      .attr('y', -48)
      .attr('text-anchor', 'middle')
      .style('font-size', 12)
      .text(resp.y_column);

    // Color by label
    const color = d3.scaleOrdinal<string, string>()
      .domain(['Observed', 'ImputeTargetMissing'])
      .range([COLOR_OBS, COLOR_MISS]);

    // Points (adaptive radius for density)
    const r = Math.max(1.5, Math.min(3.5, 1500 / resp.points.length));
    g.selectAll('circle.point')
      .data(resp.points)
      .enter()
      .append('circle')
      .attr('class', 'point')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', r)
      .attr('opacity', 0.8)
      .attr('fill', d => color(d.label));

    // Legend (top-left)
    const legend = [
      { label: 'Observed', color: COLOR_OBS },
      { label: 'Missing Target', color: COLOR_MISS },
    ];

    const legendWidth = 80;
    const rowH = 16;
    const lg = g.append('g')
      .attr('transform', `translate(${innerW - legendWidth}, 0)`);

    lg.selectAll('rect.leg')
      .data(legend)
      .enter()
      .append('rect')
      .attr('class', 'leg')
      .attr('x', 0)
      .attr('y', (_, i) => i * rowH + 2)
      .attr('width', 10)
      .attr('height', 10)
      .attr('fill', d => d.color);

    lg.selectAll('text.legt')
      .data(legend)
      .enter()
      .append('text')
      .attr('class', 'legt')
      .attr('x', 16)
      .attr('y', (_, i) => i * rowH + 11)
      .style('font-size', 11)
      .text(d => d.label);

  }, [resp, inModal]);

  return (
    <ChartWrapper
      title="Scatter Plot: Pre-Imputation"
      tooltipContent={
        <p>
          Scatter of <b>original (pre-impute)</b> values for X and Y. Rows with missing X or Y are dropped.
          Points are colored by whether the <b>Target</b> column is missing on that row.
        </p>
      }
      modalContent={<PreImputeScatterPlot inModal />}
      inModal={inModal}
      fixed={true}
      controls={
        <Select
          size="small"
          style={{ width: 150, marginLeft: 8 }}
          placeholder="Select target (to impute)"
          value={targetCol ?? undefined}
          onChange={setTargetCol}
          showSearch
          filterOption={(input, option) =>
            ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
          }
        >
          {columns.map(col => (
            <Select.Option key={col} value={col}>{col}</Select.Option>
          ))}
        </Select>
      }
    >
      <div style={{ display: 'flex', gap: '0.5rem', padding: '10px', flexWrap: 'wrap' }}>
        <div>
          <Text type="secondary">X</Text>
          <Select
            size="small"
            style={{ width: 200, marginLeft: 8 }}
            placeholder="Select X"
            value={xCol ?? undefined}
            onChange={setXCol}
            showSearch
            filterOption={(input, option) =>
              ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
            }
          >
            {columns.map(col => (
              <Select.Option key={col} value={col}>{col}</Select.Option>
            ))}
          </Select>
        </div>

        <div>
          <Text type="secondary">Y</Text>
          <Select
            size="small"
            style={{ width: 200, marginLeft: 8 }}
            placeholder="Select Y"
            value={yCol ?? undefined}
            onChange={setYCol}
            showSearch
            filterOption={(input, option) =>
              ((option?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())
            }
          >
            {columns.map(col => (
              <Select.Option key={col} value={col}>{col}</Select.Option>
            ))}
          </Select>
        </div>
      </div>

      <div ref={containerRef} style={{ flex: 1 }}>
        <Spin spinning={loading}>
          <svg ref={svgRef} width="100%" height="100%" />
        </Spin>
      </div>
    </ChartWrapper>
  );
};

export default PreImputeScatterPlot;
