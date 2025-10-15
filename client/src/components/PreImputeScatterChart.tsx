'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Select, Spin, Switch, Typography, Space } from 'antd';
import ChartWrapper from '@/components/ChartWrapper';
import { useDatasetStore } from '@/store/useDataStore';
import { fetchDataTypes, fetchPreimputeColumns, fetchPreimputeScatter } from '@/services/apiService';

const { Text } = Typography;

const ACCENT = '#0072B2';

const PreImputeScatterPlot: React.FC<{ inModal?: boolean }> = ({ inModal }) => {
  const { dataset, isUpdated } = useDatasetStore(); // keep parity with your pattern
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [columns, setColumns] = useState<string[]>([]);
  const [xCol, setXCol] = useState<string | null>(null);
  const [yCol, setYCol] = useState<string | null>(null);
  // const [useRaw, setUseRaw] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);

  // payload from API
  const [resp, setResp] = useState<{
    x_column: string;
    y_column: string;
    x_min: number; x_max: number;
    y_min: number; y_max: number;
    n: number; dropped: number;
    pearson: number; spearman: number; r2: number;
    slope: number; intercept: number;
    points: Array<{ x: number; y: number; label: string }>;
    missing_counts?: { total_rows: number; x_missing: number; y_missing: number; either_missing: number; };
    source?: 'raw' | 'merged_preimpute';
  } | null>(null);

  // Load pre-impute numeric-ish columns (match your no-arg service call style)
  // useEffect(() => {
  //   let cancelled = false;
  //   (async () => {
  //     const cols = await fetchPreimputeColumns({ use_raw: useRaw }).catch(() => []);
  //     if (cancelled) return;
  //     setColumns(cols);
  //     if (cols.length >= 2) {
  //       setXCol(prev => prev ?? cols[0]);
  //       setYCol(prev => prev ?? cols[1]);
  //     } else {
  //       setXCol(null);
  //       setYCol(null);
  //     }
  //   })();
  //   return () => { cancelled = true; };
  // }, [dataset, isUpdated, useRaw]);

  // Load ALL columns from dtypes
      useEffect(() => {
          let cancelled = false;
          (async () => {
              try {
                  const dtypes = await fetchDataTypes(); // Record<string, string>
                  const cols = Object.keys(dtypes);
                  if (!cancelled) {
                      setColumns(cols);
                  }
              } catch (err) {
                  console.error('Error loading dtypes:', err);
                  if (!cancelled) setColumns([]);
              }
          })();
          return () => {
              cancelled = true;
          };
      }, [dataset, isUpdated]);

      useEffect(() => {
        if (columns.length > 0) {
            if (!xCol || !columns.includes(xCol)) {
                setXCol(columns[0]);
            }
        } else {
            setXCol(null);
        }
    }, [columns]);

    useEffect(() => {
        if (columns.length > 0) {
            if (!yCol || !columns.includes(yCol)) {
                setYCol(columns[0]);
            }
        } else {
            setYCol(null);
        }
    }, [columns]);

  // Fetch scatter when selections change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!xCol || !yCol) {
        setResp(null);
        return;
      }
      setLoading(true);
      try {
        const r = await fetchPreimputeScatter({ x_column: xCol, y_column: yCol });
        if (!cancelled) setResp(r);
      } catch {
        if (!cancelled) setResp(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [xCol, yCol, dataset, isUpdated]);

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
        .text('Select X and Y to render pre-imputation scatter');
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
      .attr('fill', ACCENT); 

    // OLS line
    // if (Number.isFinite(resp.slope) && Number.isFinite(resp.intercept)) {
    //   const x0 = resp.x_min, x1 = resp.x_max;
    //   const y0 = resp.slope * x0 + resp.intercept;
    //   const y1 = resp.slope * x1 + resp.intercept;

    //   g.append('line')
    //     .attr('x1', xScale(x0))
    //     .attr('x2', xScale(x1))
    //     .attr('y1', yScale(y0))
    //     .attr('y2', yScale(y1))
    //     .attr('stroke-width', 1.5)
    //     .attr('stroke-dasharray', '5,4')
    //     .attr('stroke', ACCENT); 
    // }

    // Corner stats (top-right)
    const stats = [
      `n: ${resp.n} (dropped: ${resp.dropped})`,
      `pearson: ${resp.pearson.toFixed(3)}`,
      `spearman: ${resp.spearman.toFixed(3)}`,
      `R²: ${resp.r2.toFixed(3)}`
    ];
    const statsG = g.append('text')
      .attr('x', innerW)
      .attr('y', 0)
      .attr('text-anchor', 'end')
      .attr('dy', '1em')
      .style('font-size', 11);

    statsG.selectAll('tspan')
      .data(stats)
      .enter()
      .append('tspan')
      .attr('x', innerW)
      .attr('dy', (_, i) => (i === 0 ? 0 : 14))
      .text(d => d);

  }, [resp, inModal]);

  return (
    <ChartWrapper
      title="Scatter Plot: Pre-Imputation Relationship"
      tooltipContent={
        <p>
          Scatter of <b>original (pre-impute)</b> values for the selected X and Y.
          Rows with missing X or Y are dropped; OLS line and correlations shown.
        </p>
      }
      modalContent={<PreImputeScatterPlot inModal />}
      inModal={inModal}
      fixed={true}
    >
      <div style={{ display: 'flex', gap: '0.5rem', padding: '10px' }}>
        <div>
          <Text type="secondary">X</Text>
          <Select
            size="small"
            style={{ width: 180, marginLeft: 8 }}
            placeholder="Select X"
            value={xCol ?? undefined}
            onChange={setXCol}
            showSearch
            filterOption={(i, o) => (o?.label as string).toLowerCase().includes(i.toLowerCase())}
          >
            {columns.map(col => (
              <Select.Option key={col} value={col}>
                {col}
              </Select.Option>
            ))}
          </Select>
        </div>
        <div>
          <Text type="secondary">Y</Text>
          <Select
            size="small"
            style={{ width: 180, marginLeft: 8 }}
            placeholder="Select Y"
            value={yCol ?? undefined}
            onChange={setYCol}
            showSearch
            filterOption={(i, o) => (o?.label as string).toLowerCase().includes(i.toLowerCase())}
          >
            {columns.map(col => (
              <Select.Option key={col} value={col}>
                {col}
              </Select.Option>
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
